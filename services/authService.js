// services/authService.js
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-extra';
import puppeteerCore from 'puppeteer-core';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import browserSessionManager from './browserSessionManager.js';

// Apply the stealth plugin to avoid bot detection with enhanced configuration
puppeteer.use(StealthPlugin({
    // Enhanced stealth options
    runOnEveryFrame: false,
    // Disable some features that might be detected
    webglVendor: 'Intel Inc.',
    webglRenderer: 'Intel Iris OpenGL Engine',
    // Randomize hardware concurrency
    hardwareConcurrency: Math.floor(Math.random() * 8) + 4,
    // Randomize device memory
    deviceMemory: Math.floor(Math.random() * 8) + 4,
    // Randomize platform
    platform: ['Win32', 'MacIntel', 'Linux x86_64'][Math.floor(Math.random() * 3)]
}));

// Store intervals by profileId
const profileOnlineIntervals = new Map(); // Track individual profile online status
const processingProfiles = new Set(); // Track which profiles are currently processing

const authService = {
    async checkWhitelist(email) {
        try {
            // Fetch from both sources on every check
            const urls = [
                "https://firestore.googleapis.com/v1/projects/alpha-a4fdc/databases/(default)/documents/operator_whitelist",
                "https://firestore.googleapis.com/v1/projects/alpha-date-sender/databases/(default)/documents/operator_whitelist"
            ];
            let allEmails = [];
            for (const url of urls) {
                const response = await fetch(url);
                const data = await response.json();
                const emails = data.documents?.[0]?.fields?.email?.arrayValue?.values?.map(item =>
                    item.stringValue.toLowerCase()
                ) || [];
                allEmails = allEmails.concat(emails);
            }
            // Deduplicate
            const whitelistedEmails = Array.from(new Set(allEmails));

            return whitelistedEmails.includes(email.toLowerCase());
        } catch (error) {
            console.error('Whitelist check failed:', error);
            return false;
        }
    },

    async sendOnlineStatus(operatorId, token, profileId, browserSession = null) {
        try {
            if (!profileId) {
                throw new Error('Profile ID is required for online status');
            }

            const payload = {
                external_id: profileId.toString(),
                operator_id: operatorId,
                status: 1
            };

            console.log(`[ONLINE STATUS] Sending online status for profile ${profileId}, operator ${operatorId}`);

            // Try browser session first if available
            if (browserSession && browserSession.page) {
                try {
                    console.log('[ONLINE STATUS] Attempting to send online status via browser session...');
                    const result = await this.makeApiCallFromBrowser(
                        browserSession.page,
                        'https://alpha.date/api/operator/setProfileOnline',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: payload
                        }
                    );
                    
                    if (result) {
                        console.log(`[ONLINE STATUS] Successfully sent online status for profile ${profileId} via browser`);
                        return true;
                    }
                } catch (browserError) {
                    console.log('[ONLINE STATUS] Browser session failed, falling back to direct API call...');
                }
            }

            // Fallback to direct API call
            const response = await fetch('https://alpha.date/api/operator/setProfileOnline', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to send online status for profile ${profileId}: ${response.statusText}`);
            }

            console.log(`[ONLINE STATUS] Successfully sent online status for profile ${profileId} via direct API`);
            return true;
        } catch (error) {
            console.error(`[ONLINE STATUS] Error sending online status for profile ${profileId}:`, error);
            throw error;
        }
    },

    // Legacy method - now deprecated in favor of profile-specific heartbeats
    startOperatorOnlineHeartbeat(operatorId, token) {
        console.warn('[DEPRECATED] startOperatorOnlineHeartbeat is deprecated. Use profile-specific heartbeats instead.');
        // This method is kept for backward compatibility but does nothing
        // Profile-specific heartbeats are now handled by startProfileOnlineHeartbeat
    },

    stopOperatorOnlineHeartbeat(operatorId) {
        console.warn('[DEPRECATED] stopOperatorOnlineHeartbeat is deprecated. Use profile-specific heartbeats instead.');
        // This method is kept for backward compatibility but does nothing
        // Profile-specific heartbeats are now handled by stopProfileOnlineHeartbeat
    },

    // New methods for profile-specific online status
    async startProfileOnlineHeartbeat(profileId, operatorId, token, browserSession = null) {
        if (!profileId || !operatorId || !token) return;
        
        const intervalKey = `${profileId}-${operatorId}`;
        
        // Clear any existing interval for this profile
        if (profileOnlineIntervals.has(intervalKey)) {
            clearInterval(profileOnlineIntervals.get(intervalKey));
        }
        
        // Add to processing profiles set
        processingProfiles.add(profileId);
        
        // Immediately send online status
        try {
            await this.sendOnlineStatus(operatorId, token, profileId, browserSession);
        } catch (error) {
            console.error(`[ONLINE STATUS] Initial heartbeat error for profile ${profileId}:`, error);
            // Don't throw - just log the error and continue
        }
        
        // Set up periodic heartbeat every 1m50s (110,000 ms)
        const interval = setInterval(async () => {
            // Only send if profile is still processing
            if (processingProfiles.has(profileId)) {
                try {
                    await this.sendOnlineStatus(operatorId, token, profileId, browserSession);
                } catch (error) {
                    console.error(`[ONLINE STATUS] Heartbeat error for profile ${profileId}:`, error);
                    // Don't throw - just log the error and continue
                }
            } else {
                // Stop heartbeat if profile is no longer processing
                this.stopProfileOnlineHeartbeat(profileId, operatorId);
            }
        }, 110000);
        
        profileOnlineIntervals.set(intervalKey, interval);
        console.log(`[ONLINE STATUS] Started online heartbeat for profile ${profileId}, operator ${operatorId}`);
    },

    stopProfileOnlineHeartbeat(profileId, operatorId) {
        const intervalKey = `${profileId}-${operatorId}`;
        
        if (profileOnlineIntervals.has(intervalKey)) {
            clearInterval(profileOnlineIntervals.get(intervalKey));
            profileOnlineIntervals.delete(intervalKey);
            console.log(`[ONLINE STATUS] Stopped online heartbeat for profile ${profileId}, operator ${operatorId}`);
        }
        
        // Remove from processing profiles set
        processingProfiles.delete(profileId);
    },

    // Method to check if a profile is currently processing
    isProfileProcessing(profileId) {
        return processingProfiles.has(profileId);
    },

    // Method to get all currently processing profiles
    getProcessingProfiles() {
        return Array.from(processingProfiles);
    },

    async authenticateWithAlphaDate(email, password) {
        let browser = null;
        let foundChromePath = null;
        
        try {
            console.log('[INFO] Attempting to authenticate with Alpha.Date using Puppeteer with stealth plugin');
            
            // Check if we should use proxy (disabled for Render due to network restrictions)
            const proxyHost = process.env.PROXY_HOST || '164.163.42.38';
            const proxyPort = process.env.PROXY_PORT || '10000';
            const useProxy = process.env.USE_PROXY === 'true' && process.env.NODE_ENV !== 'production';
            
            // Check if we should use residential proxy rotation
            const useResidentialProxy = process.env.USE_RESIDENTIAL_PROXY === 'true';
            const residentialProxyApiKey = process.env.RESIPROX_PROXY_STRING;
            
            if (useProxy) {
                console.log(`[INFO] Using proxy ${proxyHost}:${proxyPort} for Cloudflare bypass...`);
                try {
                    return await this.authenticateWithProxy(email, password, proxyHost, proxyPort);
                } catch (proxyError) {
                    console.log('[INFO] Proxy authentication failed, trying direct connection...');
                    return await this.authenticateWithDirectConnection(email, password);
                }
            } else if (useResidentialProxy && residentialProxyApiKey) {
                console.log('[INFO] Using residential proxy rotation for Cloudflare bypass...');
                return await this.authenticateWithResidentialProxy(email, password, residentialProxyApiKey);
            } else {
                console.log('[INFO] Using direct connection with enhanced stealth for Cloudflare bypass...');
                return await this.authenticateWithDirectConnection(email, password);
            }
            
            // Check if we're in production and if Puppeteer is available
            if (process.env.NODE_ENV === 'production') {
                console.log('[INFO] Production environment detected, checking Chrome availability...');
                console.log('[INFO] PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
                console.log('[INFO] PUPPETEER_CACHE_DIR:', process.env.PUPPETEER_CACHE_DIR);
                
                // First, try to find the correct Chrome path
                const { existsSync } = await import('fs');
                const { execSync } = await import('child_process');
                
                // Try to find Chrome using system commands
                let systemChromePath = null;
                try {
                    systemChromePath = execSync('which google-chrome', { encoding: 'utf8' }).trim();
                } catch (err) {
                    console.log('[INFO] google-chrome not found in PATH');
                }
                
                const possiblePaths = [
                    process.env.PUPPETEER_EXECUTABLE_PATH,
                    systemChromePath,
                    '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome',
                    '/opt/render/.cache/puppeteer/chrome-linux/chrome',
                    '/usr/bin/google-chrome-stable',
                    '/usr/bin/google-chrome',
                    '/usr/bin/chromium-browser',
                    '/usr/bin/chromium'
                ].filter(Boolean);
                
                console.log('[INFO] Checking Chrome paths...');
                for (const path of possiblePaths) {
                    if (existsSync(path)) {
                        foundChromePath = path;
                        console.log(`[INFO] Found Chrome at: ${path}`);
                        break;
                    } else {
                        console.log(`[INFO] Chrome not found at: ${path}`);
                    }
                }
                
                // If still not found, try to search the filesystem
                if (!foundChromePath) {
                    console.log('[INFO] Searching filesystem for Chrome...');
                    try {
                        // First try to find the actual Chrome binary
                        let searchResult = execSync('find /opt -name "chrome" -type f -executable 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
                        if (searchResult && existsSync(searchResult)) {
                            foundChromePath = searchResult;
                            console.log(`[INFO] Found Chrome binary via filesystem search: ${searchResult}`);
                        } else {
                            // Fallback to broader search, excluding shell scripts
                            searchResult = execSync('find /opt -name "*chrome*" -type f -executable -not -name "*.sh" 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
                            if (searchResult && existsSync(searchResult)) {
                                foundChromePath = searchResult;
                                console.log(`[INFO] Found Chrome via filesystem search: ${searchResult}`);
                            }
                        }
                    } catch (err) {
                        console.log('[INFO] Filesystem search failed:', err.message);
                    }
                }
                
                // If still not found, try to install Puppeteer browsers
                if (!foundChromePath) {
                    console.log('[INFO] Chrome not found, attempting to install Puppeteer browsers...');
                    try {
                        // Install Puppeteer browsers
                        execSync('npx puppeteer browsers install chrome --force', { stdio: 'pipe' });
                        
                        // Check if installation was successful
                        try {
                            const puppeteerPath = puppeteer.executablePath();
                            if (puppeteerPath && existsSync(puppeteerPath)) {
                                foundChromePath = puppeteerPath;
                                console.log(`[INFO] Puppeteer Chrome installed successfully at: ${puppeteerPath}`);
                            }
                        } catch (err) {
                            console.log('[INFO] Could not get Puppeteer executable path after installation:', err.message);
                        }
                    } catch (err) {
                        console.log('[INFO] Puppeteer browser installation failed:', err.message);
                    }
                }
                
                if (!foundChromePath) {
                    console.log('[ERROR] No Chrome executable found and installation failed');
                    console.log('[INFO] Skipping Puppeteer authentication, using API method directly');
                    return await this.authenticateWithAPI(email, password);
                }
                
                try {
                    // Test if Puppeteer can launch with the found path
                    console.log('[INFO] Testing Chrome launch with path:', foundChromePath);
                    const testBrowser = await puppeteer.launch({
                        headless: 'new',
                        executablePath: foundChromePath,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-gpu',
                            '--disable-software-rasterizer'
                        ]
                    });
                    await testBrowser.close();
                    console.log('[INFO] Puppeteer test launch successful with path:', foundChromePath);
                } catch (testError) {
                    console.error('[ERROR] Puppeteer test launch failed:', testError.message);
                    console.error('[ERROR] Full error details:', testError);
                    console.log('[INFO] Skipping Puppeteer authentication, using API method directly');
                    return await this.authenticateWithAPI(email, password);
                }
            }
            
            // Launch browser with enhanced stealth settings
            const launchOptions = {
                headless: process.env.NODE_ENV === 'production' ? 'new' : false, // Use headless in production
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    // Additional stealth arguments
                    '--disable-blink-features=AutomationControlled',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-translate',
                    '--hide-scrollbars',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--no-pings',
                    '--disable-client-side-phishing-detection',
                    '--disable-component-update',
                    '--disable-domain-reliability',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--disable-hang-monitor',
                    '--disable-prompt-on-repost',
                    '--disable-background-networking'
                ]
            };

            // In production, we need to specify the executable path
            if (process.env.NODE_ENV === 'production' && foundChromePath) {
                launchOptions.executablePath = foundChromePath;
                console.log(`[INFO] Using found Chrome executable for main launch: ${foundChromePath}`);
            }

            browser = await puppeteer.launch(launchOptions);

            const page = await browser.newPage();

            // Evaluate stealth effectiveness
            await this.evaluateStealthEffectiveness(page);

            // Set realistic user agent with more variety
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            ];
            const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
            await page.setUserAgent(randomUserAgent);

            // Randomize viewport to avoid fingerprinting
            const viewports = [
                { width: 1366, height: 768 },
                { width: 1920, height: 1080 },
                { width: 1440, height: 900 },
                { width: 1536, height: 864 },
                { width: 1280, height: 720 }
            ];
            const randomViewport = viewports[Math.floor(Math.random() * viewports.length)];
            await page.setViewport(randomViewport);

            // Set additional headers to appear more human-like
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            });

            console.log('[INFO] Navigating to Alpha.Date login page...');
            
            // Navigate to the login page first to establish session
            await page.goto('https://alpha.date/login', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait a bit to let any initial scripts load
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Check for Cloudflare challenge or popup modals
            const cloudflareDetected = await this.checkForCloudflareChallenge(page);
            if (cloudflareDetected) {
                console.log('[INFO] Cloudflare challenge detected, waiting for manual resolution...');
                
                // Wait for user to manually solve the challenge
                await this.waitForCloudflareResolution(page);
            }
            
            // Check for and handle popup modals
            await this.handlePopupModals(page);

            console.log('[INFO] Filling login form...');
            
            // Wait for login form to be available with more comprehensive selectors
            const emailSelectors = [
                'input[name="login"]',
                'input[data-testid="email"]',
                'input[type="email"]',
                'input[name="email"]',
                'input[id*="email"]',
                'input[id*="login"]',
                'input[placeholder*="email"]',
                'input[placeholder*="Email"]'
            ];
            
            const passwordSelectors = [
                'input[name="password"]',
                'input[data-testid="password"]',
                'input[type="password"]',
                'input[id*="password"]',
                'input[placeholder*="password"]',
                'input[placeholder*="Password"]'
            ];
            
            console.log('[INFO] Looking for email input field...');
            let emailField = null;
            for (const selector of emailSelectors) {
                try {
                    emailField = await page.waitForSelector(selector, { timeout: 2000 });
                    if (emailField) {
                        console.log(`[INFO] Found email field with selector: ${selector}`);
                        break;
                    }
                } catch (err) {
                    console.log(`[INFO] Email selector not found: ${selector}`);
                }
            }
            
            if (!emailField) {
                console.log('[ERROR] No email field found with any selector');
                // Take a screenshot for debugging
                const timestamp = Date.now();
                const screenshotPath = `/opt/render/project/src/debug-screenshots/login-form-debug-${timestamp}.png`;
                await page.screenshot({ path: screenshotPath });
                console.log(`[INFO] Debug screenshot saved: ${screenshotPath}`);
                
                // Also save the page HTML for debugging
                const htmlPath = `/opt/render/project/src/debug-screenshots/login-form-debug-${timestamp}.html`;
                const pageContent = await page.content();
                const fs = await import('fs');
                fs.writeFileSync(htmlPath, pageContent);
                console.log(`[INFO] Debug HTML saved: ${htmlPath}`);
                
                throw new Error('Email field not found');
            }
            
            console.log('[INFO] Looking for password input field...');
            let passwordField = null;
            for (const selector of passwordSelectors) {
                try {
                    passwordField = await page.waitForSelector(selector, { timeout: 2000 });
                    if (passwordField) {
                        console.log(`[INFO] Found password field with selector: ${selector}`);
                        break;
                    }
                } catch (err) {
                    console.log(`[INFO] Password selector not found: ${selector}`);
                }
            }
            
            if (!passwordField) {
                console.log('[ERROR] No password field found with any selector');
                // Take a screenshot for debugging
                const timestamp = Date.now();
                const screenshotPath = `/opt/render/project/src/debug-screenshots/login-form-debug-${timestamp}.png`;
                await page.screenshot({ path: screenshotPath });
                console.log(`[INFO] Debug screenshot saved: ${screenshotPath}`);
                throw new Error('Password field not found');
            }

            // Fill in credentials with human-like delays
            await emailField.type(email, { delay: 100 });
            await new Promise(resolve => setTimeout(resolve, 500));
            await passwordField.type(password, { delay: 100 });

            // Wait a bit before submitting
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Submit the form with more comprehensive selectors
            const submitSelectors = [
                'button[data-testid="submit-btn"]',
                'button[type="submit"]',
                'input[type="submit"]',
                'button[class*="submit"]',
                'button[class*="login"]',
                'button[id*="submit"]',
                'button[id*="login"]',
                'input[value*="Login"]',
                'input[value*="Sign"]',
                'button:contains("Login")',
                'button:contains("Sign")'
            ];
            
            console.log('[INFO] Looking for submit button...');
            let submitButton = null;
            for (const selector of submitSelectors) {
                try {
                    submitButton = await page.waitForSelector(selector, { timeout: 2000 });
                    if (submitButton) {
                        console.log(`[INFO] Found submit button with selector: ${selector}`);
                        break;
                    }
                } catch (err) {
                    console.log(`[INFO] Submit selector not found: ${selector}`);
                }
            }
            
            if (!submitButton) {
                console.log('[ERROR] No submit button found with any selector');
                // Take a screenshot for debugging
                const timestamp = Date.now();
                const screenshotPath = `/opt/render/project/src/debug-screenshots/login-form-debug-${timestamp}.png`;
                await page.screenshot({ path: screenshotPath });
                console.log(`[INFO] Debug screenshot saved: ${screenshotPath}`);
                throw new Error('Submit button not found');
            }
            
            await submitButton.click();
            
            console.log('[INFO] Login form submitted, waiting for response...');

            // Wait for navigation or API response
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Check for captcha
            const captchaDetected = await this.checkForCaptcha(page);
            if (captchaDetected) {
                console.log('[INFO] Captcha detected, waiting for manual resolution...');
                await this.waitForCaptchaResolution(page);
            }

            // Try to extract token from localStorage or cookies
            const token = await this.extractAuthToken(page);
            
            if (token) {
                console.log('[INFO] Authentication successful via Puppeteer');
                
                // Get operator ID from the page or make an API call
                const operatorId = await this.extractOperatorId(page, token);
                
                // Store browser session for future API calls
                const browserSession = {
                    browser: browser,
                    page: page,
                    token: token,
                    operatorId: operatorId,
                    email: email,
                    createdAt: Date.now()
                };
                
                // Don't close the browser - keep it alive for API calls
                return {
                    success: true,
                    token: token,
                    operatorId: operatorId,
                    browserSession: browserSession,
                    message: 'Authentication successful via Puppeteer'
                };
            } else {
                // Fallback to API method
                console.log('[INFO] Token not found in browser, trying API method...');
                if (browser) {
                    await browser.close();
                }
                return await this.authenticateWithAPI(email, password);
            }

        } catch (error) {
            console.error('[ERROR] Puppeteer authentication error:', error);
            
            // Fallback to API method
            console.log('[INFO] Falling back to API authentication method...');
            if (browser) {
                await browser.close();
            }
            return await this.authenticateWithAPI(email, password);
        }
    },

    async checkForCloudflareChallenge(page) {
        try {
            const content = await page.content();
            const cloudflareIndicators = [
                'Just a moment...',
                'cf-mitigated',
                'cloudflare',
                'DDoS protection',
                'ray id',
                'cf-ray',
                'checking your browser',
                'enable javascript',
                'cf-browser-verification'
            ];

            return cloudflareIndicators.some(indicator => 
                content.toLowerCase().includes(indicator.toLowerCase())
            );
        } catch (error) {
            console.error('[ERROR] Error checking for Cloudflare challenge:', error);
            return false;
        }
    },

    async waitForCloudflareResolution(page) {
        console.log('[INFO] Please manually solve the Cloudflare challenge in the browser window...');
        
        // Wait for the page to load successfully (indicating challenge was solved)
        try {
            await page.waitForFunction(() => {
                return !document.body.innerHTML.includes('Just a moment') && 
                       !document.body.innerHTML.includes('cf-mitigated') &&
                       document.readyState === 'complete';
            }, { timeout: 300000 }); // 5 minutes timeout
            
            console.log('[INFO] Cloudflare challenge appears to be resolved');
        } catch (error) {
            console.error('[ERROR] Timeout waiting for Cloudflare challenge resolution:', error);
            throw new Error('Cloudflare challenge resolution timeout');
        }
    },

    async handlePopupModals(page) {
        console.log('[INFO] Checking for popup modals...');
        
        try {
            // Wait a bit for any modals to appear
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // First, try to find and click "Got it" buttons specifically
            const gotItButtons = await page.$$eval('button', buttons => {
                return buttons
                    .filter(button => {
                        const text = button.textContent.trim().toLowerCase();
                        return text.includes('got it') || text.includes('gotit') || text.includes('got-it');
                    })
                    .map(button => ({
                        text: button.textContent.trim(),
                        visible: button.offsetParent !== null,
                        rect: button.getBoundingClientRect()
                    }));
            });
            
            if (gotItButtons.length > 0) {
                console.log('[INFO] Found "Got it" buttons:', gotItButtons);
                for (const buttonInfo of gotItButtons) {
                    if (buttonInfo.visible) {
                        console.log(`[INFO] Clicking visible "Got it" button: "${buttonInfo.text}"`);
                        await page.evaluate((text) => {
                            const buttons = Array.from(document.querySelectorAll('button'));
                            const button = buttons.find(b => b.textContent.trim().toLowerCase().includes('got it'));
                            if (button) button.click();
                        }, buttonInfo.text);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        break;
                    }
                }
            }
            
            // Common popup modal selectors
            const modalSelectors = [
                'button:contains("OK")',
                'button:contains("Accept")',
                'button:contains("Continue")',
                'button:contains("Close")',
                'button:contains("Dismiss")',
                '.modal button',
                '.popup button',
                '[role="dialog"] button',
                '.dialog button',
                '.overlay button'
            ];
            
            for (const selector of modalSelectors) {
                try {
                    const button = await page.$(selector);
                    if (button) {
                        console.log(`[INFO] Found popup modal with button: ${selector}`);
                        await button.click();
                        console.log('[INFO] Clicked popup modal button');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        break;
                    }
                } catch (err) {
                    // Continue to next selector
                }
            }
            
            // Also try to find and click any visible buttons in modals
            const visibleButtons = await page.$$eval('button', buttons => {
                return buttons
                    .filter(button => {
                        const rect = button.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && 
                               window.getComputedStyle(button).display !== 'none' &&
                               window.getComputedStyle(button).visibility !== 'hidden';
                    })
                    .map(button => button.textContent.trim())
                    .filter(text => text.length > 0);
            });
            
            console.log('[INFO] All visible buttons found:', visibleButtons);
            
        } catch (error) {
            console.log('[INFO] Error handling popup modals:', error.message);
        }
    },

    async authenticateWithZenRows(email, password, apiKey) {
        let browser = null;
        
        try {
            console.log('[INFO] Starting ZenRows authentication...');
            
            // Connect to ZenRows browser
            const connectionURL = `wss://browser.zenrows.com?apikey=${apiKey}`;
            browser = await puppeteerCore.connect({ 
                browserWSEndpoint: connectionURL,
                defaultViewport: { width: 1366, height: 768 }
            });
            
            console.log('[INFO] Connected to ZenRows browser');
            
            const page = await browser.newPage();
            
            // Navigate to Alpha.Date login page
            console.log('[INFO] Navigating to Alpha.Date login page via ZenRows...');
            await page.goto('https://alpha.date/login', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            // Wait for page to load
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if we're on the login page (not Cloudflare challenge)
            const currentUrl = page.url();
            console.log('[INFO] Current URL:', currentUrl);
            
            if (currentUrl.includes('cloudflare') || currentUrl.includes('challenge')) {
                console.log('[WARN] Still on Cloudflare challenge page, waiting longer...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
            
            // Fill in the login form using the exact selectors from the HTML
            console.log('[INFO] Filling login form...');
            
            // Wait for form elements
            await page.waitForSelector('input[name="login"]', { timeout: 10000 });
            await page.waitForSelector('input[name="password"]', { timeout: 10000 });
            await page.waitForSelector('button[data-testid="submit-btn"]', { timeout: 10000 });
            
            // Fill email
            await page.type('input[name="login"]', email, { delay: 100 });
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Fill password
            await page.type('input[name="password"]', password, { delay: 100 });
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Submit form
            await page.click('button[data-testid="submit-btn"]');
            
            console.log('[INFO] Login form submitted, waiting for response...');
            
            // Wait for navigation or response
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Check for successful login
            const newUrl = page.url();
            console.log('[INFO] URL after login:', newUrl);
            
            // Try to extract token from localStorage or cookies
            const token = await this.extractAuthToken(page);
            
            if (token) {
                console.log('[INFO] Authentication successful via ZenRows');
                
                // Get operator ID from the page or make an API call
                const operatorId = await this.extractOperatorId(page, token);
                
                // Store browser session for future API calls
                const browserSession = {
                    browser: browser,
                    page: page,
                    token: token,
                    operatorId: operatorId,
                    email: email,
                    createdAt: Date.now()
                };
                
                // Don't close the browser - keep it alive for API calls
                return {
                    success: true,
                    token: token,
                    operatorId: operatorId,
                    browserSession: browserSession,
                    message: 'Authentication successful via ZenRows'
                };
            } else {
                console.log('[INFO] Token not found, falling back to API method...');
                if (browser) {
                    await browser.close();
                }
                return await this.authenticateWithAPI(email, password);
            }
            
        } catch (error) {
            console.error('[ERROR] ZenRows authentication error:', error);
            
            // Fallback to API method
            console.log('[INFO] Falling back to API authentication method...');
            if (browser) {
                await browser.close();
            }
            return await this.authenticateWithAPI(email, password);
        }
    },

    // Helper function for delays that works with or without waitForTimeout
    async safeDelay(page, ms) {
        try {
            if (typeof page.waitForTimeout === 'function') {
                await page.waitForTimeout(ms);
            } else {
                await new Promise(resolve => setTimeout(resolve, ms));
            }
        } catch (error) {
            console.log('[INFO] Delay failed, using setTimeout fallback');
            await new Promise(resolve => setTimeout(resolve, ms));
        }
    },

    async authenticateWithProxy(email, password, proxyHost, proxyPort) {
        let browser = null;
        
        try {
            console.log('[INFO] Starting proxy authentication...');
            console.log(`[INFO] Using proxy: ${proxyHost}:${proxyPort}`);
            
            // Find Chrome executable path first
            let foundChromePath = null;
            const { existsSync } = await import('fs');
            const { execSync } = await import('child_process');
            
            // Try to find Chrome using system commands
            let systemChromePath = null;
            try {
                systemChromePath = execSync('which google-chrome', { encoding: 'utf8' }).trim();
            } catch (err) {
                console.log('[INFO] google-chrome not found in PATH');
            }
            
            const possiblePaths = [
                process.env.PUPPETEER_EXECUTABLE_PATH,
                systemChromePath,
                '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome',
                '/opt/render/.cache/puppeteer/chrome-linux/chrome',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium'
            ].filter(Boolean);
            
            console.log('[INFO] Checking Chrome paths for proxy authentication...');
            for (const path of possiblePaths) {
                if (existsSync(path)) {
                    foundChromePath = path;
                    console.log(`[INFO] Found Chrome at: ${path}`);
                    break;
                } else {
                    console.log(`[INFO] Chrome not found at: ${path}`);
                }
            }
            
            // If still not found, try to search the filesystem
            if (!foundChromePath) {
                console.log('[INFO] Searching filesystem for Chrome...');
                try {
                    // First try to find the actual Chrome binary
                    let searchResult = execSync('find /opt -name "chrome" -type f -executable 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
                    if (searchResult && existsSync(searchResult)) {
                        foundChromePath = searchResult;
                        console.log(`[INFO] Found Chrome binary via filesystem search: ${searchResult}`);
                    } else {
                        // Fallback to broader search, excluding shell scripts
                        searchResult = execSync('find /opt -name "*chrome*" -type f -executable -not -name "*.sh" 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
                        if (searchResult && existsSync(searchResult)) {
                            foundChromePath = searchResult;
                            console.log(`[INFO] Found Chrome via filesystem search: ${searchResult}`);
                        }
                    }
                } catch (err) {
                    console.log('[INFO] Filesystem search failed:', err.message);
                }
            }
            
            // If still not found, try to install Puppeteer browsers
            if (!foundChromePath) {
                console.log('[INFO] Chrome not found, attempting to install Puppeteer browsers...');
                try {
                    // Install Puppeteer browsers
                    execSync('npx puppeteer browsers install chrome --force', { stdio: 'pipe' });
                    
                    // Check if installation was successful
                    try {
                        const puppeteerPath = puppeteer.executablePath();
                        if (puppeteerPath && existsSync(puppeteerPath)) {
                            foundChromePath = puppeteerPath;
                            console.log(`[INFO] Puppeteer Chrome installed successfully at: ${puppeteerPath}`);
                        }
                    } catch (err) {
                        console.log('[INFO] Could not get Puppeteer executable path after installation:', err.message);
                    }
                } catch (err) {
                    console.log('[INFO] Puppeteer browser installation failed:', err.message);
                }
            }
            
            if (!foundChromePath) {
                console.log('[ERROR] No Chrome executable found for proxy authentication');
                throw new Error('Chrome executable not found');
            }
            
            // Try different proxy types
            const proxyTypes = ['socks5://', 'socks4://', 'http://'];
            let lastError = null;
            
            for (const proxyType of proxyTypes) {
                try {
                    console.log(`[INFO] Trying proxy type: ${proxyType}`);
                    
                    const launchOptions = {
                        headless: true,
                        executablePath: foundChromePath,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-accelerated-2d-canvas',
                            '--no-first-run',
                            '--no-zygote',
                            '--disable-gpu',
                            '--disable-background-timer-throttling',
                            '--disable-backgrounding-occluded-windows',
                            '--disable-renderer-backgrounding',
                            '--disable-features=TranslateUI',
                            '--disable-ipc-flooding-protection',
                            '--disable-default-apps',
                            '--disable-extensions',
                            '--disable-plugins',
                            '--disable-images',
                            '--disable-javascript',
                            '--disable-web-security',
                            '--disable-features=VizDisplayCompositor',
                            '--proxy-server=' + proxyType + proxyHost + ':' + proxyPort,
                            '--ignore-certificate-errors',
                            '--ignore-ssl-errors',
                            '--ignore-certificate-errors-spki-list',
                            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        ]
                    };

                    console.log('[INFO] Launching browser with proxy configuration...');
                    try {
                        browser = await puppeteer.launch(launchOptions);
                        console.log('[INFO] Browser launched successfully with proxy');
                    } catch (launchError) {
                        console.log('[INFO] Browser launch failed with proxy:', launchError.message);
                        throw new Error(`Browser launch failed: ${launchError.message}`);
                    }
                    
                    let page;
                    try {
                        page = await browser.newPage();
                        console.log('[INFO] Page created successfully');
                    } catch (pageError) {
                        console.log('[INFO] Page creation failed:', pageError.message);
                        throw new Error(`Page creation failed: ${pageError.message}`);
                    }
                    
                    // Verify page is properly initialized
                    if (!page) {
                        throw new Error('Page object is null or undefined');
                    }
                    
                    // Check if page has basic functionality
                    if (typeof page.goto !== 'function') {
                        throw new Error('Page object missing goto function');
                    }
                    
                    // Check for waitForTimeout function, but don't fail if it's missing
                    if (typeof page.waitForTimeout !== 'function') {
                        console.log('[INFO] waitForTimeout not available, will use alternative delays');
                    }
                    
                    // Set additional headers to look more like a real browser
                    await page.setExtraHTTPHeaders({
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1'
                    });

                    console.log('[INFO] Navigating to Alpha.Date login page via proxy...');
                    
                    // Test the connection first with a simple page
                    try {
                        await page.goto('https://httpbin.org/ip', { 
                            waitUntil: 'networkidle2',
                            timeout: 15000 
                        });
                        console.log('[INFO] Proxy connection test successful');
                    } catch (connectionError) {
                        console.log('[INFO] Proxy connection test failed:', connectionError.message);
                        throw new Error(`Proxy connection failed: ${connectionError.message}`);
                    }
                    
                    await page.goto('https://alpha.date/login', { 
                        waitUntil: 'networkidle2',
                        timeout: 30000 
                    });

                    // Wait for page to load and check for Cloudflare
                    await this.safeDelay(page, 3000);
                    
                    const currentUrl = page.url();
                    console.log('[INFO] Current URL after navigation:', currentUrl);
                    
                    // Check if we hit a Cloudflare challenge
                    const cloudflareDetected = await page.evaluate(() => {
                        return document.title.includes('Cloudflare') || 
                               document.body.textContent.includes('Checking your browser') ||
                               document.body.textContent.includes('Please wait while we verify');
                    });
                    
                    if (cloudflareDetected) {
                        console.log('[INFO] Cloudflare challenge detected, waiting for manual resolution...');
                        console.log('[INFO] Please manually solve the Cloudflare challenge in the browser window...');
                        
                        // Wait for Cloudflare to be resolved (up to 60 seconds)
                        await page.waitForFunction(() => {
                            return !document.title.includes('Cloudflare') && 
                                   !document.body.textContent.includes('Checking your browser') &&
                                   !document.body.textContent.includes('Please wait while we verify');
                        }, { timeout: 60000 });
                        
                        console.log('[INFO] Cloudflare challenge appears to be resolved');
                    }

                    // Handle any popup modals
                    await this.handlePopupModals(page);

                    console.log('[INFO] Filling login form...');
                    
                    // Wait for login form elements with specific Alpha.Date selectors
                    const emailSelector = 'input[name="login"][data-testid="email"]';
                    const passwordSelector = 'input[name="password"][data-testid="password"]';
                    const submitSelector = 'button[data-testid="submit-btn"]';
                    
                    await page.waitForSelector(emailSelector, { timeout: 10000 });
                    await page.waitForSelector(passwordSelector, { timeout: 10000 });
                    
                    // Fill in the form
                    await page.type(emailSelector, email);
                    await page.type(passwordSelector, password);
                    
                    // Click submit button
                    await page.click(submitSelector);
                    
                    // Wait for navigation or response
                    await this.safeDelay(page, 5000);
                    
                    // Check if login was successful
                    const loginSuccess = await page.evaluate(() => {
                        // Check for error messages
                        const errorElements = document.querySelectorAll('.error, .alert, .message, [class*="error"], [class*="alert"]');
                        for (const element of errorElements) {
                            if (element.textContent.toLowerCase().includes('invalid') || 
                                element.textContent.toLowerCase().includes('incorrect') ||
                                element.textContent.toLowerCase().includes('failed')) {
                                return false;
                            }
                        }
                        
                        // Check if we're redirected to dashboard or main page
                        return window.location.href.includes('/dashboard') || 
                               window.location.href.includes('/profile') ||
                               !window.location.href.includes('/login');
                    });
                    
                    if (!loginSuccess) {
                        throw new Error('Login failed - invalid credentials or login form not found');
                    }
                    
                    console.log('[INFO] Login successful via proxy');
                    
                    // Extract token from cookies or localStorage
                    const token = await page.evaluate(() => {
                        // Try to get token from localStorage
                        const localToken = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('accessToken');
                        if (localToken) return localToken;
                        
                        // Try to get token from sessionStorage
                        const sessionToken = sessionStorage.getItem('token') || sessionStorage.getItem('authToken') || sessionStorage.getItem('accessToken');
                        if (sessionToken) return sessionToken;
                        
                        // Try to get token from cookies
                        const cookies = document.cookie.split(';');
                        for (const cookie of cookies) {
                            const [name, value] = cookie.trim().split('=');
                            if (name === 'token' || name === 'authToken' || name === 'accessToken') {
                                return value;
                            }
                        }
                        
                        return null;
                    });
                    
                    if (!token) {
                        throw new Error('Could not extract authentication token');
                    }
                    
                    // Extract operator ID
                    const operatorId = await this.extractOperatorId(page, token);
                    
                    console.log('[INFO] Authentication successful via proxy');
                    
                    // Store browser session
                    const sessionId = await browserSessionManager.storeBrowserSession(browser, page, email, token, operatorId);
                    
                    return {
                        success: true,
                        token,
                        operatorId,
                        sessionId,
                        message: 'Authentication successful via proxy'
                    };
                    
                } catch (proxyError) {
                    console.log(`[INFO] Proxy type ${proxyType} failed:`, proxyError.message);
                    lastError = proxyError;
                    
                    if (browser) {
                        await browser.close();
                        browser = null;
                    }
                    
                    // Continue to next proxy type
                    continue;
                }
            }
            
            // If all proxy types failed, throw the last error
            throw lastError || new Error('All proxy types failed');
            
        } catch (error) {
            console.error('[ERROR] Proxy authentication error:', error);
            
            // Fallback to API method
            console.log('[INFO] Falling back to API authentication method...');
            if (browser) {
                await browser.close();
            }
            return await this.authenticateWithAPI(email, password);
        }
    },

    decodeJWTToken(token) {
        try {
            // JWT tokens have 3 parts separated by dots
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid JWT format');
            }
            
            // Decode the payload (second part)
            const payload = parts[1];
            
            // Add padding if needed for base64 decode
            const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
            
            // Decode base64
            const decodedPayload = Buffer.from(paddedPayload, 'base64').toString('utf8');
            
            // Parse JSON
            const tokenData = JSON.parse(decodedPayload);
            
            console.log('[INFO] JWT token decoded successfully:', {
                id: tokenData.id,
                email: tokenData.email,
                agency_id: tokenData.agency_id,
                external_id: tokenData.external_id
            });
            
            // Return the operator ID
            return tokenData.id ? tokenData.id.toString() : null;
            
        } catch (error) {
            console.error('[ERROR] Failed to decode JWT token:', error.message);
            return null;
        }
    },

    async authenticateWithDirectConnection(email, password) {
        let browser = null;
        
        try {
            console.log('[INFO] Starting direct connection authentication...');
            
            // Find Chrome executable path first
            let foundChromePath = null;
            const { existsSync } = await import('fs');
            const { execSync } = await import('child_process');
            
            // Try to find Chrome using system commands
            let systemChromePath = null;
            try {
                systemChromePath = execSync('which google-chrome', { encoding: 'utf8' }).trim();
            } catch (err) {
                console.log('[INFO] google-chrome not found in PATH');
            }
            
            const possiblePaths = [
                process.env.PUPPETEER_EXECUTABLE_PATH,
                systemChromePath,
                '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome',
                '/opt/render/.cache/puppeteer/chrome-linux/chrome',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium'
            ].filter(Boolean);
            
            console.log('[INFO] Checking Chrome paths for direct connection...');
            for (const path of possiblePaths) {
                if (existsSync(path)) {
                    foundChromePath = path;
                    console.log(`[INFO] Found Chrome at: ${path}`);
                    break;
                } else {
                    console.log(`[INFO] Chrome not found at: ${path}`);
                }
            }
            
            // If still not found, try to search the filesystem
            if (!foundChromePath) {
                console.log('[INFO] Searching filesystem for Chrome...');
                try {
                    // First try to find the actual Chrome binary
                    let searchResult = execSync('find /opt -name "chrome" -type f -executable 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
                    if (searchResult && existsSync(searchResult)) {
                        foundChromePath = searchResult;
                        console.log(`[INFO] Found Chrome binary via filesystem search: ${searchResult}`);
                    } else {
                        // Fallback to broader search, excluding shell scripts
                        searchResult = execSync('find /opt -name "*chrome*" -type f -executable -not -name "*.sh" 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
                        if (searchResult && existsSync(searchResult)) {
                            foundChromePath = searchResult;
                            console.log(`[INFO] Found Chrome via filesystem search: ${searchResult}`);
                        }
                    }
                } catch (err) {
                    console.log('[INFO] Filesystem search failed:', err.message);
                }
            }
            
            // If still not found, try to install Puppeteer browsers
            if (!foundChromePath) {
                console.log('[INFO] Chrome not found, attempting to install Puppeteer browsers...');
                try {
                    // Install Puppeteer browsers
                    execSync('npx puppeteer browsers install chrome --force', { stdio: 'pipe' });
                    
                    // Check if installation was successful
                    try {
                        const puppeteerPath = puppeteer.executablePath();
                        if (puppeteerPath && existsSync(puppeteerPath)) {
                            foundChromePath = puppeteerPath;
                            console.log(`[INFO] Puppeteer Chrome installed successfully at: ${puppeteerPath}`);
                        }
                    } catch (err) {
                        console.log('[INFO] Could not get Puppeteer executable path after installation:', err.message);
                    }
                } catch (err) {
                    console.log('[INFO] Puppeteer browser installation failed:', err.message);
                }
            }
            
            if (!foundChromePath) {
                console.log('[ERROR] No Chrome executable found for direct connection');
                throw new Error('Chrome executable not found');
            }
            
            const launchOptions = {
                headless: true,
                executablePath: foundChromePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--disable-default-apps',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--ignore-certificate-errors',
                    '--ignore-ssl-errors',
                    '--ignore-certificate-errors-spki-list',
                    '--disable-blink-features=AutomationControlled',
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    '--window-size=1920,1080',
                    '--start-maximized',
                    '--disable-software-rasterizer',
                    '--disable-background-networking',
                    '--disable-sync',
                    '--disable-translate',
                    '--hide-scrollbars',
                    '--mute-audio',
                    '--safebrowsing-disable-auto-update',
                    '--disable-features=site-per-process',
                    '--disable-site-isolation-trials',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-ipc-flooding-protection',
                    '--disable-renderer-backgrounding',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-background-timer-throttling',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--disable-default-apps',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-blink-features=AutomationControlled'
                ]
            };

            console.log('[INFO] Launching browser with direct connection...');
            browser = await puppeteer.launch(launchOptions);
            
            console.log('[INFO] Browser launched successfully with direct connection');
            
            const page = await browser.newPage();
            
            // Enhanced stealth techniques
            await page.evaluateOnNewDocument(() => {
                // Remove webdriver property
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
                
                // Override permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                
                // Override plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                
                // Override languages
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
                
                // Override chrome
                window.chrome = {
                    runtime: {},
                };
            });
            
            // Set additional headers to look more like a real browser
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            console.log('[INFO] Navigating to Alpha.Date login page via direct connection...');
            
            // Try multiple navigation strategies for Cloudflare bypass
            let navigationSuccess = false;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (!navigationSuccess && retryCount < maxRetries) {
                try {
                    console.log(`[INFO] Navigation attempt ${retryCount + 1}/${maxRetries}...`);
                    
                    await page.goto('https://alpha.date/login', { 
                        waitUntil: 'networkidle2',
                        timeout: 30000 
                    });
                    
                    navigationSuccess = true;
                    console.log('[INFO] Navigation successful');
                    
                } catch (navigationError) {
                    retryCount++;
                    console.log(`[INFO] Navigation attempt ${retryCount} failed:`, navigationError.message);
                    
                    if (retryCount < maxRetries) {
                        console.log(`[INFO] Waiting 5 seconds before retry...`);
                        await this.safeDelay(page, 5000);
                    }
                }
            }
            
            if (!navigationSuccess) {
                throw new Error('Failed to navigate to Alpha.Date after multiple attempts');
            }

            // Wait for page to load and check for Cloudflare
            await this.safeDelay(page, 5000);
            
            const currentUrl = page.url();
            console.log('[INFO] Current URL after navigation:', currentUrl);
            
            // Check if we hit a Cloudflare challenge
            const cloudflareDetected = await page.evaluate(() => {
                return document.title.includes('Cloudflare') || 
                       document.body.textContent.includes('Checking your browser') ||
                       document.body.textContent.includes('Please wait while we verify');
            });
            
            if (cloudflareDetected) {
                console.log('[INFO] Cloudflare challenge detected, waiting for manual resolution...');
                console.log('[INFO] Please manually solve the Cloudflare challenge in the browser window...');
                
                // Wait for Cloudflare to be resolved (up to 60 seconds)
                await page.waitForFunction(() => {
                    return !document.title.includes('Cloudflare') && 
                           !document.body.textContent.includes('Checking your browser') &&
                           !document.body.textContent.includes('Please wait while we verify');
                }, { timeout: 60000 });
                
                console.log('[INFO] Cloudflare challenge appears to be resolved');
            }

            // Handle any popup modals
            await this.handlePopupModals(page);

            console.log('[INFO] Filling login form...');
            
            // Wait for login form elements with specific Alpha.Date selectors
            const emailSelector = 'input[name="login"][data-testid="email"]';
            const passwordSelector = 'input[name="password"][data-testid="password"]';
            const submitSelector = 'button[data-testid="submit-btn"]';
            
            await page.waitForSelector(emailSelector, { timeout: 10000 });
            await page.waitForSelector(passwordSelector, { timeout: 10000 });
            
            // Fill in the form
            await page.type(emailSelector, email);
            await page.type(passwordSelector, password);
            
            // Click submit button
            await page.click(submitSelector);
            
            // Wait for navigation or response
            await this.safeDelay(page, 5000);
            
            // Check if login was successful
            const loginSuccess = await page.evaluate(() => {
                // Check for error messages
                const errorElements = document.querySelectorAll('.error, .alert, .message, [class*="error"], [class*="alert"]');
                for (const element of errorElements) {
                    if (element.textContent.toLowerCase().includes('invalid') || 
                        element.textContent.toLowerCase().includes('incorrect') ||
                        element.textContent.toLowerCase().includes('failed')) {
                        return false;
                    }
                }
                
                // Check if we're redirected to dashboard or main page
                return window.location.href.includes('/dashboard') || 
                       window.location.href.includes('/profile') ||
                       !window.location.href.includes('/login');
            });
            
            if (!loginSuccess) {
                throw new Error('Login failed - invalid credentials or login form not found');
            }
            
            console.log('[INFO] Login successful via direct connection');
            
            // Extract token from cookies or localStorage
            const token = await page.evaluate(() => {
                // Try to get token from localStorage
                const localToken = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('accessToken');
                if (localToken) return localToken;
                
                // Try to get token from sessionStorage
                const sessionToken = sessionStorage.getItem('token') || sessionStorage.getItem('authToken') || sessionStorage.getItem('accessToken');
                if (sessionToken) return sessionToken;
                
                // Try to get token from cookies
                const cookies = document.cookie.split(';');
                for (const cookie of cookies) {
                    const [name, value] = cookie.trim().split('=');
                    if (name === 'token' || name === 'authToken' || name === 'accessToken') {
                        return value;
                    }
                }
                
                return null;
            });
            
            if (!token) {
                throw new Error('Could not extract authentication token');
            }
            
            // Extract operator ID
            const operatorId = await this.extractOperatorId(page, token);
            
            console.log('[INFO] Authentication successful via direct connection');
            
            // Store browser session
            const sessionId = await browserSessionManager.storeBrowserSession(browser, page, email, token, operatorId);
            
            return {
                success: true,
                token,
                operatorId,
                sessionId,
                message: 'Authentication successful via direct connection'
            };
            
        } catch (error) {
            console.error('[ERROR] Direct connection authentication error:', error);
            
            // Fallback to API method
            console.log('[INFO] Falling back to API authentication method...');
            if (browser) {
                await browser.close();
            }
            return await this.authenticateWithAPI(email, password);
        }
    },

    async evaluateStealthEffectiveness(page) {
        console.log('[INFO] Evaluating stealth effectiveness...');
        
        try {
            const stealthResults = await page.evaluate(() => {
                const results = {};
                
                // Check for automation indicators
                results.navigatorWebdriver = navigator.webdriver;
                results.chromeRuntime = typeof chrome !== 'undefined' && chrome.runtime;
                results.automationControlled = navigator.webdriver === true;
                
                // Check for headless indicators
                results.userAgent = navigator.userAgent;
                results.platform = navigator.platform;
                results.language = navigator.language;
                results.languages = navigator.languages;
                
                // Check for plugins
                results.pluginsLength = navigator.plugins.length;
                results.mimeTypesLength = navigator.mimeTypes.length;
                
                // Check for screen properties
                results.screenWidth = screen.width;
                results.screenHeight = screen.height;
                results.colorDepth = screen.colorDepth;
                results.pixelDepth = screen.pixelDepth;
                
                // Check for window properties
                results.innerWidth = window.innerWidth;
                results.innerHeight = window.innerHeight;
                results.outerWidth = window.outerWidth;
                results.outerHeight = window.outerHeight;
                
                return results;
            });
            
            console.log('[INFO] Stealth evaluation results:', stealthResults);
            
            // Check for potential detection indicators
            if (stealthResults.navigatorWebdriver) {
                console.log('[WARN] navigator.webdriver is detected - stealth may be compromised');
            }
            
            if (stealthResults.automationControlled) {
                console.log('[WARN] Automation controlled flag detected - stealth may be compromised');
            }
            
        } catch (error) {
            console.log('[INFO] Error evaluating stealth effectiveness:', error.message);
        }
    },

    async checkForCaptcha(page) {
        try {
            const captchaSelectors = [
                'iframe[src*="hcaptcha"]',
                'iframe[src*="recaptcha"]',
                'iframe[src*="captcha"]',
                '.h-captcha',
                '.g-recaptcha',
                '#captcha',
                '[class*="captcha"]'
            ];

            for (const selector of captchaSelectors) {
                const element = await page.$(selector);
                if (element) {
                    console.log(`[INFO] Captcha detected with selector: ${selector}`);
                    return true;
                }
            }

            // Also check page content for captcha indicators
            const content = await page.content();
            const captchaIndicators = [
                'hcaptcha',
                'recaptcha',
                'captcha',
                'verify you are human',
                'prove you are human'
            ];

            return captchaIndicators.some(indicator => 
                content.toLowerCase().includes(indicator.toLowerCase())
            );
        } catch (error) {
            console.error('[ERROR] Error checking for captcha:', error);
            return false;
        }
    },

    async waitForCaptchaResolution(page) {
        console.log('[INFO] Please manually solve the captcha in the browser window...');
        
        // Wait for captcha to be solved (check for form submission or redirect)
        try {
            await page.waitForFunction(() => {
                // Check if captcha elements are gone or if we've been redirected
                const captchaElements = document.querySelectorAll('iframe[src*="captcha"], .h-captcha, .g-recaptcha');
                return captchaElements.length === 0 || window.location.href.includes('/dashboard');
            }, { timeout: 300000 }); // 5 minutes timeout
            
            console.log('[INFO] Captcha appears to be resolved');
        } catch (error) {
            console.error('[ERROR] Timeout waiting for captcha resolution:', error);
            throw new Error('Captcha resolution timeout');
        }
    },

    async extractAuthToken(page) {
        try {
            // Try to get token from localStorage
            const token = await page.evaluate(() => {
                return localStorage.getItem('token') || 
                       localStorage.getItem('authToken') || 
                       localStorage.getItem('accessToken') ||
                       sessionStorage.getItem('token') ||
                       sessionStorage.getItem('authToken') ||
                       sessionStorage.getItem('accessToken');
            });

            if (token) {
                console.log('[INFO] Token found in browser storage');
                return token;
            }

            // Try to get token from cookies
            const cookies = await page.cookies();
            const tokenCookie = cookies.find(cookie => 
                cookie.name.toLowerCase().includes('token') ||
                cookie.name.toLowerCase().includes('auth')
            );

            if (tokenCookie) {
                console.log('[INFO] Token found in cookies');
                return tokenCookie.value;
            }

            // Try to extract from page content (if it's embedded in HTML)
            const content = await page.content();
            const tokenMatch = content.match(/"token"\s*:\s*"([^"]+)"/);
            if (tokenMatch) {
                console.log('[INFO] Token found in page content');
                return tokenMatch[1];
            }

            return null;
        } catch (error) {
            console.error('[ERROR] Error extracting auth token:', error);
            return null;
        }
    },

    async extractOperatorId(page, token) {
        try {
            console.log('[INFO] Extracting operator ID...');
            
            // Try to get operator ID from page content
            const operatorId = await page.evaluate(() => {
                // Look for operator ID in various places
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const content = script.textContent;
                    const match = content.match(/"operator_id"\s*:\s*"?(\d+)"?/);
                    if (match) return match[1];
                }
                
                // Check localStorage
                return localStorage.getItem('operatorId') || 
                       localStorage.getItem('operator_id') ||
                       sessionStorage.getItem('operatorId') ||
                       sessionStorage.getItem('operator_id');
            });

            if (operatorId) {
                console.log('[INFO] Operator ID found in page content:', operatorId);
                return operatorId;
            }

            // If not found, try to navigate to a page that might contain operator info
            console.log('[INFO] Operator ID not found in page content, trying to navigate to dashboard...');
            
            try {
                await page.goto('https://alpha.date/dashboard', { waitUntil: 'networkidle2', timeout: 10000 });
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Try to extract from dashboard page
                const dashboardOperatorId = await page.evaluate(() => {
                    // Look for operator ID in dashboard page
                    const scripts = document.querySelectorAll('script');
                    for (const script of scripts) {
                        const content = script.textContent;
                        const match = content.match(/"operator_id"\s*:\s*"?(\d+)"?/);
                        if (match) return match[1];
                    }
                    
                    // Check for any element with operator ID
                    const elements = document.querySelectorAll('[data-operator-id], [data-operator], .operator-id');
                    for (const element of elements) {
                        const id = element.getAttribute('data-operator-id') || 
                                  element.getAttribute('data-operator') || 
                                  element.textContent;
                        if (id && /^\d+$/.test(id)) return id;
                    }
                    
                    return null;
                });
                
                if (dashboardOperatorId) {
                    console.log('[INFO] Operator ID found in dashboard:', dashboardOperatorId);
                    return dashboardOperatorId;
                }
            } catch (navError) {
                console.log('[INFO] Could not navigate to dashboard:', navError.message);
            }

            // If still not found, try to decode the JWT token
            console.log('[INFO] Attempting to decode JWT token to extract operator ID...');
            try {
                const operatorId = this.decodeJWTToken(token);
                if (operatorId) {
                    console.log('[INFO] Operator ID found via JWT decode:', operatorId);
                    return operatorId;
                }
            } catch (jwtError) {
                console.log('[INFO] JWT decode failed:', jwtError.message);
            }

            console.log('[WARN] Could not extract operator ID from any source');
            return null;
        } catch (error) {
            console.error('[ERROR] Error extracting operator ID:', error);
            return null;
        }
    },

    async makeApiCallFromBrowser(page, url, options = {}) {
        try {
            console.log(`[INFO] Making API call from browser: ${url}`);
            
            const result = await page.evaluate(async (url, options) => {
                try {
                    const response = await fetch(url, {
                        method: options.method || 'GET',
                        headers: options.headers || {},
                        body: options.body ? JSON.stringify(options.body) : undefined
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const data = await response.json();
                    return { success: true, data };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }, url, options);

            if (result.success) {
                console.log('[INFO] API call successful from browser');
                return result.data;
            } else {
                console.error('[ERROR] API call failed from browser:', result.error);
                return null;
            }
        } catch (error) {
            console.error('[ERROR] Error making API call from browser:', error);
            return null;
        }
    },

    // Fallback API authentication method
    async authenticateWithAPI(email, password) {
        try {
            console.log('[INFO] Attempting API authentication with Alpha.Date');
            
            const response = await fetch('https://alpha.date/api/login/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin'
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const contentType = response.headers.get('content-type') || '';
            const responseStatus = response.status;

            console.log(`[INFO] API Response status: ${responseStatus}, Content-Type: ${contentType}`);

            // Get response body as text first
            const responseText = await response.text();

            // Check for Cloudflare challenge indicators
            const isCloudflareChallenge = this.detectCloudflareChallenge(responseStatus, contentType, responseText);

            if (isCloudflareChallenge) {
                console.log('[ERROR] Cloudflare challenge detected in API response');
                
                // Save the challenge page
                const challengeFile = await this.saveCloudflareChallenge(responseText, email);
                
                console.log(`[ERROR] Challenge page saved to: ${challengeFile}`);

                return {
                    success: false,
                    isCloudflareChallenge: true,
                    status: responseStatus,
                    contentType: contentType,
                    challengeFile: challengeFile,
                    message: 'Cloudflare protection detected'
                };
            }

            // Check if response is OK
            if (!response.ok) {
                console.log(`[ERROR] API Authentication failed with status: ${responseStatus}`);
                return {
                    success: false,
                    isCloudflareChallenge: false,
                    status: responseStatus,
                    message: `Authentication failed: ${response.statusText}`
                };
            }

            // Try to parse JSON response
            let loginData;
            try {
                loginData = JSON.parse(responseText);
            } catch (parseError) {
                console.log('[ERROR] Failed to parse API response as JSON');
                return {
                    success: false,
                    isCloudflareChallenge: false,
                    message: 'Invalid response format from Alpha.Date'
                };
            }

            // Validate required fields in response
            if (!loginData.token) {
                console.log('[ERROR] No token in API response');
                return {
                    success: false,
                    isCloudflareChallenge: false,
                    message: 'No authentication token received'
                };
            }

            console.log('[INFO] Alpha.Date API authentication successful');

            return {
                success: true,
                token: loginData.token,
                operatorId: loginData.operator_id,
                message: 'Authentication successful via API'
            };

        } catch (error) {
            console.error('[ERROR] Alpha.Date API authentication error:', error);
            return {
                success: false,
                isCloudflareChallenge: false,
                message: `Network error: ${error.message}`
            };
        }
    },

    detectCloudflareChallenge(status, contentType, responseBody) {
        // Check status code
        if (status === 403) {
            // Check content type
            if (contentType.includes('text/html')) {
                // Check for Cloudflare challenge indicators in the response body
                const cloudflareIndicators = [
                    'Just a moment...',
                    'cf-mitigated',
                    'cloudflare',
                    'DDoS protection',
                    'ray id',
                    'cf-ray',
                    'checking your browser',
                    'enable javascript',
                    'cf-browser-verification'
                ];

                const bodyLower = responseBody.toLowerCase();
                const hasCloudflareIndicator = cloudflareIndicators.some(indicator => 
                    bodyLower.includes(indicator.toLowerCase())
                );

                if (hasCloudflareIndicator) {
                    return true;
                }
            }
        }

        return false;
    },

    async saveCloudflareChallenge(responseBody, email) {
        try {
            // Create challenges directory if it doesn't exist
            const challengesDir = path.join(process.cwd(), 'cloudflare-challenges');
            if (!fs.existsSync(challengesDir)) {
                fs.mkdirSync(challengesDir, { recursive: true });
            }

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
            const filename = `cloudflare-challenge-${email.replace('@', '_at_')}-${timestamp}.html`;
            const filepath = path.join(challengesDir, filename);

            // Save the challenge page
            fs.writeFileSync(filepath, responseBody, 'utf8');

            console.log(`[INFO] Cloudflare challenge page saved: ${filepath}`);

            return filepath;
        } catch (error) {
            console.error('[ERROR] Failed to save Cloudflare challenge page:', error);
            return null;
        }
    },

    async authenticateWithResidentialProxy(email, password, apiKey) {
        let browser = null;
        let foundChromePath = null;
        
        try {
            console.log('[INFO] Starting residential proxy authentication...');
            
            // Use the same Chrome detection logic as the main function
            if (process.env.NODE_ENV === 'production') {
                console.log('[INFO] Production environment detected, checking Chrome availability...');
                console.log('[INFO] PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
                console.log('[INFO] PUPPETEER_CACHE_DIR:', process.env.PUPPETEER_CACHE_DIR);
                
                // First, try to find the correct Chrome path
                const { existsSync } = await import('fs');
                const { execSync } = await import('child_process');
                
                // Try to find Chrome using system commands
                let systemChromePath = null;
                try {
                    systemChromePath = execSync('which google-chrome', { encoding: 'utf8' }).trim();
                } catch (err) {
                    console.log('[INFO] google-chrome not found in PATH');
                }
                
                const possiblePaths = [
                    process.env.PUPPETEER_EXECUTABLE_PATH,
                    systemChromePath,
                    '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome',
                    '/opt/render/.cache/puppeteer/chrome-linux/chrome',
                    '/usr/bin/google-chrome-stable',
                    '/usr/bin/google-chrome',
                    '/usr/bin/chromium-browser',
                    '/usr/bin/chromium'
                ].filter(Boolean);
                
                console.log('[INFO] Checking Chrome paths for residential proxy authentication...');
                for (const path of possiblePaths) {
                    if (existsSync(path)) {
                        foundChromePath = path;
                        console.log(`[INFO] Found Chrome at: ${path}`);
                        break;
                    } else {
                        console.log(`[INFO] Chrome not found at: ${path}`);
                    }
                }
                
                // If still not found, try to search the filesystem
                if (!foundChromePath) {
                    console.log('[INFO] Searching filesystem for Chrome...');
                    try {
                        // First try to find the actual Chrome binary
                        let searchResult = execSync('find /opt -name "chrome" -type f -executable 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
                        if (searchResult && existsSync(searchResult)) {
                            foundChromePath = searchResult;
                            console.log(`[INFO] Found Chrome binary via filesystem search: ${searchResult}`);
                        } else {
                            // Fallback to broader search, excluding shell scripts
                            searchResult = execSync('find /opt -name "*chrome*" -type f -executable -not -name "*.sh" 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
                            if (searchResult && existsSync(searchResult)) {
                                foundChromePath = searchResult;
                                console.log(`[INFO] Found Chrome via filesystem search: ${searchResult}`);
                            }
                        }
                    } catch (err) {
                        console.log('[INFO] Filesystem search failed:', err.message);
                    }
                }
                
                // If still not found, try to install Puppeteer browsers
                if (!foundChromePath) {
                    console.log('[INFO] Chrome not found, attempting to install Puppeteer browsers...');
                    try {
                        // Install Puppeteer browsers
                        execSync('npx puppeteer browsers install chrome --force', { stdio: 'pipe' });
                        
                        // Check if installation was successful
                        try {
                            const puppeteerPath = puppeteer.executablePath();
                            if (puppeteerPath && existsSync(puppeteerPath)) {
                                foundChromePath = puppeteerPath;
                                console.log(`[INFO] Found Chrome via Puppeteer installation: ${puppeteerPath}`);
                            }
                        } catch (puppeteerError) {
                            console.log('[INFO] Puppeteer executablePath failed:', puppeteerError.message);
                        }
                    } catch (installError) {
                        console.log('[INFO] Puppeteer browser installation failed:', installError.message);
                    }
                }
                
                if (!foundChromePath) {
                    console.log('[ERROR] No Chrome executable found for residential proxy authentication');
                    throw new Error('Chrome executable not found');
                }
            } else {
                // Development environment - use Puppeteer's default
                foundChromePath = puppeteer.executablePath();
                console.log(`[INFO] Using Puppeteer's default Chrome path: ${foundChromePath}`);
            }
            
            // Parse ResiProx proxy string
            console.log('[INFO] Parsing ResiProx proxy configuration...');
            const proxyParts = apiKey.split(':');
            
            if (proxyParts.length !== 4) {
                throw new Error('Invalid ResiProx proxy format. Expected: host:port:username:password');
            }
            
            const [host, port, username, password] = proxyParts;
            const proxyUrl = `http://${username}:${password}@${host}:${port}`;
            
            console.log(`[INFO] Using ResiProx proxy: ${host}:${port}`);
            
            const launchOptions = {
                headless: true,
                executablePath: foundChromePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--disable-default-apps',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--ignore-certificate-errors',
                    '--ignore-ssl-errors',
                    '--ignore-certificate-errors-spki-list',
                    '--disable-blink-features=AutomationControlled',
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    '--window-size=1920,1080',
                    '--start-maximized',
                    '--disable-software-rasterizer',
                    '--disable-background-networking',
                    '--disable-sync',
                    '--disable-translate',
                    '--hide-scrollbars',
                    '--mute-audio',
                    '--safebrowsing-disable-auto-update',
                    '--disable-features=site-per-process',
                    '--disable-site-isolation-trials',
                    '--proxy-server=' + proxyUrl
                ]
            };

            console.log('[INFO] Launching browser with residential proxy...');
            browser = await puppeteer.launch(launchOptions);
            
            console.log('[INFO] Browser launched successfully with residential proxy');
            
            const page = await browser.newPage();
            
            // Enhanced stealth techniques
            await page.evaluateOnNewDocument(() => {
                // Remove webdriver property
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
                
                // Override permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                
                // Override plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                
                // Override languages
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
                
                // Override chrome
                window.chrome = {
                    runtime: {},
                };
            });
            
            // Set additional headers to look more like a real browser
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            console.log('[INFO] Navigating to Alpha.Date login page via residential proxy...');
            
            // Try multiple navigation strategies for Cloudflare bypass
            let navigationSuccess = false;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (!navigationSuccess && retryCount < maxRetries) {
                try {
                    console.log(`[INFO] Navigation attempt ${retryCount + 1}/${maxRetries}...`);
                    
                    await page.goto('https://alpha.date/login', { 
                        waitUntil: 'networkidle2',
                        timeout: 30000 
                    });
                    
                    navigationSuccess = true;
                    console.log('[INFO] Navigation successful');
                    
                } catch (navigationError) {
                    retryCount++;
                    console.log(`[INFO] Navigation attempt ${retryCount} failed:`, navigationError.message);
                    
                    if (retryCount < maxRetries) {
                        console.log(`[INFO] Waiting 5 seconds before retry...`);
                        await this.safeDelay(page, 5000);
                    }
                }
            }
            
            if (!navigationSuccess) {
                throw new Error('Failed to navigate to Alpha.Date after multiple attempts');
            }

            // Wait for page to load and check for Cloudflare
            await this.safeDelay(page, 5000);
            
            const currentUrl = page.url();
            console.log('[INFO] Current URL after navigation:', currentUrl);
            
            // Check if we hit a Cloudflare challenge
            const cloudflareDetected = await page.evaluate(() => {
                return document.title.includes('Cloudflare') || 
                       document.body.textContent.includes('Checking your browser') ||
                       document.body.textContent.includes('Please wait while we verify');
            });
            
            if (cloudflareDetected) {
                console.log('[INFO] Cloudflare challenge detected, waiting for manual resolution...');
                console.log('[INFO] Please manually solve the Cloudflare challenge in the browser window...');
                
                // Wait for Cloudflare to be resolved (up to 60 seconds)
                await page.waitForFunction(() => {
                    return !document.title.includes('Cloudflare') && 
                           !document.body.textContent.includes('Checking your browser') &&
                           !document.body.textContent.includes('Please wait while we verify');
                }, { timeout: 60000 });
                
                console.log('[INFO] Cloudflare challenge appears to be resolved');
            }

            // Handle any popup modals
            await this.handlePopupModals(page);

            console.log('[INFO] Filling login form...');
            
            // Wait for login form elements with specific Alpha.Date selectors
            const emailSelector = 'input[name="login"][data-testid="email"]';
            const passwordSelector = 'input[name="password"][data-testid="password"]';
            const submitSelector = 'button[data-testid="submit-btn"]';
            
            await page.waitForSelector(emailSelector, { timeout: 10000 });
            await page.waitForSelector(passwordSelector, { timeout: 10000 });
            
            // Fill in the form
            await page.type(emailSelector, email);
            await page.type(passwordSelector, password);
            
            // Click submit button
            await page.click(submitSelector);
            
            // Wait for navigation or response
            await this.safeDelay(page, 5000);
            
            // Check if login was successful
            const loginSuccess = await page.evaluate(() => {
                // Check for error messages
                const errorElements = document.querySelectorAll('.error, .alert, .message, [class*="error"], [class*="alert"]');
                for (const element of errorElements) {
                    if (element.textContent.toLowerCase().includes('invalid') || 
                        element.textContent.toLowerCase().includes('incorrect') ||
                        element.textContent.toLowerCase().includes('failed')) {
                        return false;
                    }
                }
                
                // Check if we're redirected to dashboard or main page
                return window.location.href.includes('/dashboard') || 
                       window.location.href.includes('/profile') ||
                       !window.location.href.includes('/login');
            });
            
            if (!loginSuccess) {
                throw new Error('Login failed - invalid credentials or login form not found');
            }
            
            console.log('[INFO] Login successful via residential proxy');
            
            // Extract token from cookies or localStorage
            const token = await page.evaluate(() => {
                // Try to get token from localStorage
                const localToken = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('accessToken');
                if (localToken) return localToken;
                
                // Try to get token from sessionStorage
                const sessionToken = sessionStorage.getItem('token') || sessionStorage.getItem('authToken') || sessionStorage.getItem('accessToken');
                if (sessionToken) return localToken;
                
                // Try to get token from cookies
                const cookies = document.cookie.split(';');
                for (const cookie of cookies) {
                    const [name, value] = cookie.trim().split('=');
                    if (name === 'token' || name === 'authToken' || name === 'accessToken') {
                        return value;
                    }
                }
                
                return null;
            });
            
            if (!token) {
                throw new Error('Could not extract authentication token');
            }
            
            // Extract operator ID
            const operatorId = await this.extractOperatorId(page, token);
            
            console.log('[INFO] Authentication successful via residential proxy');
            
            // Store browser session
            const sessionId = await browserSessionManager.storeBrowserSession(browser, page, email, token, operatorId);
            
            return {
                success: true,
                token,
                operatorId,
                sessionId,
                message: 'Authentication successful via residential proxy'
            };
            
        } catch (error) {
            console.error('[ERROR] Residential proxy authentication error:', error);
            
            // Fallback to API method
            console.log('[INFO] Falling back to API authentication method...');
            if (browser) {
                await browser.close();
            }
            return await this.authenticateWithAPI(email, password);
        }
    }

};

export default authService;