// services/sharedChromeManager.js
import puppeteer from 'puppeteer-extra';
import puppeteerCore from 'puppeteer-core';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { platform } from 'os';
import path from 'path';

// Apply the stealth plugin
puppeteer.use(StealthPlugin({
    // Enhanced stealth options
    runOnEveryFrame: false,
    webglVendor: 'Intel Inc.',
    webglRenderer: 'Intel Iris OpenGL Engine',
    hardwareConcurrency: Math.floor(Math.random() * 8) + 4,
    deviceMemory: Math.floor(Math.random() * 8) + 4,
    platform: ['Win32', 'MacIntel', 'Linux x86_64'][Math.floor(Math.random() * 3)]
}));

class SharedChromeManager {
    constructor() {
        this.browser = null;
        this.isLaunching = false;
        this.launchPromise = null;
        this.chromePath = null;
        this.userSessions = new Map(); // Track user sessions using the shared browser
        this.lastActivity = Date.now();
    }

    async initialize() {
        if (this.browser && !this.browser.isConnected()) {
            this.browser = null;
        }

        if (this.browser) {
            console.log('[SHARED CHROME] Browser already initialized');
            return this.browser;
        }

        if (this.isLaunching) {
            console.log('[SHARED CHROME] Browser launch in progress, waiting...');
            return await this.launchPromise;
        }

        this.isLaunching = true;
        this.launchPromise = this._launchBrowser();
        
        try {
            const browser = await this.launchPromise;
            return browser;
        } finally {
            this.isLaunching = false;
            this.launchPromise = null;
        }
    }

    async _launchBrowser() {
        try {
            console.log('[SHARED CHROME] Initializing shared Chrome instance...');
            
            // Find system Chrome
            this.chromePath = await this._findSystemChrome();
            
            if (!this.chromePath) {
                throw new Error('System Chrome not found - application requires Chrome to be installed');
            }

            console.log(`[SHARED CHROME] Using Chrome at: ${this.chromePath}`);

            // Launch browser with platform-specific configuration
            const currentPlatform = platform();
            const baseArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--no-default-browser-check',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-background-networking'
            ];

            // Platform-specific arguments
            let platformArgs = [];
            if (currentPlatform === 'win32') {
                platformArgs = [
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-hang-monitor',
                    '--disable-prompt-on-repost',
                    '--no-first-run'
                ];
            } else {
                // Linux/macOS specific args
                platformArgs = [
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--hide-scrollbars',
                    '--mute-audio',
                    '--no-pings',
                    '--disable-domain-reliability',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection'
                ];
            }

            const launchOptions = {
                headless: process.env.NODE_ENV === 'production' ? 'new' : false,
                executablePath: this.chromePath,
                timeout: 60000,
                args: [...baseArgs, ...platformArgs]
            };

            // Create shared user data directory
            const userDataDir = currentPlatform === 'win32' 
                ? path.join(process.env.TEMP || 'C:\\temp', 'shared-chrome-user-data')
                : '/tmp/shared-chrome-user-data';
            
            // Ensure directory exists
            try {
                const fs = await import('fs');
                if (!fs.existsSync(userDataDir)) {
                    fs.mkdirSync(userDataDir, { recursive: true });
                }
            } catch (dirError) {
                console.log('[SHARED CHROME] Warning: Could not create user data directory:', dirError.message);
            }
            
            launchOptions.args.push(`--user-data-dir=${userDataDir}`);
            launchOptions.args.push('--remote-debugging-port=0');

            console.log('[SHARED CHROME] Launching Chrome with shared configuration...');
            console.log('[SHARED CHROME] User data directory:', userDataDir);
            console.log('[SHARED CHROME] Launch args:', launchOptions.args);
            
            try {
                this.browser = await puppeteer.launch(launchOptions);
            } catch (launchError) {
                console.log('[SHARED CHROME] Initial launch failed, trying with minimal args...');
                
                // Fallback with minimal arguments for Windows
                const minimalArgs = [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-gpu',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-extensions',
                    '--no-first-run',
                    '--disable-web-security'
                ];
                
                const fallbackOptions = {
                    headless: process.env.NODE_ENV === 'production' ? 'new' : false,
                    executablePath: this.chromePath,
                    timeout: 60000,
                    args: [...minimalArgs, `--user-data-dir=${userDataDir}`, '--remote-debugging-port=0']
                };
                
                console.log('[SHARED CHROME] Fallback args:', fallbackOptions.args);
                this.browser = await puppeteer.launch(fallbackOptions);
            }

            // Verify browser is connected
            if (!this.browser.isConnected()) {
                throw new Error('Chrome launched but is not connected');
            }

            // Set up browser event handlers
            this.browser.on('disconnected', () => {
                console.log('[SHARED CHROME] Browser disconnected, will reinitialize on next request');
                this.browser = null;
                this.userSessions.clear();
            });

            // Start activity monitoring
            this._startActivityMonitoring();

            console.log('[SHARED CHROME] ✅ Shared Chrome instance initialized successfully');
            console.log('[SHARED CHROME] Browser connected:', this.browser.isConnected());
            return this.browser;

        } catch (error) {
            console.error('[SHARED CHROME] ❌ Failed to initialize shared Chrome:', error);
            throw new Error(`Failed to initialize Chrome: ${error.message}`);
        }
    }

    async _findSystemChrome() {
        const currentPlatform = platform();
        let chromePaths = [];

        if (currentPlatform === 'linux') {
            chromePaths = [
                '/usr/bin/google-chrome-stable',
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium'
            ];
        } else if (currentPlatform === 'win32') {
            chromePaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
                process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
            ];
        } else if (currentPlatform === 'darwin') {
            chromePaths = [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Chromium.app/Contents/MacOS/Chromium'
            ];
        }

        console.log('[SHARED CHROME] Checking system Chrome paths...');
        for (const path of chromePaths) {
            if (existsSync(path)) {
                try {
                    // Test if Chrome works
                    const testCommand = currentPlatform === 'win32' 
                        ? `"${path}" --version`
                        : `${path} --version --no-sandbox`;
                    execSync(testCommand, { stdio: 'ignore', timeout: 5000 });
                    console.log(`[SHARED CHROME] ✅ Found working Chrome at: ${path}`);
                    return path;
                } catch (err) {
                    console.log(`[SHARED CHROME] Chrome at ${path} not working`);
                }
            }
        }

        console.error('[SHARED CHROME] ❌ No working system Chrome found');
        return null;
    }

    async createUserPage(userId, email) {
        try {
            const browser = await this.initialize();
            
            // Create a new page for this user
            const page = await browser.newPage();

            // Set up page with user-specific configuration
            await this._configurePage(page, userId, email);

            // Store user session
            this.userSessions.set(userId, {
                page: page,
                email: email,
                createdAt: Date.now(),
                lastActivity: Date.now()
            });

            console.log(`[SHARED CHROME] Created page for user: ${email} (${userId})`);
            return page;

        } catch (error) {
            console.error(`[SHARED CHROME] Failed to create page for user ${userId}:`, error);
            throw error;
        }
    }

    async _configurePage(page, userId, email) {
        // Set realistic user agent
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        await page.setUserAgent(randomUserAgent);

        // Set random viewport
        const viewports = [
            { width: 1366, height: 768 },
            { width: 1920, height: 1080 },
            { width: 1440, height: 900 },
            { width: 1536, height: 864 }
        ];
        const randomViewport = viewports[Math.floor(Math.random() * viewports.length)];
        await page.setViewport(randomViewport);

        // Set additional headers
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

        // Navigate to Alpha.Date to establish session
        console.log(`[SHARED CHROME] Establishing session for user ${email}...`);
        await page.goto('https://alpha.date/', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for any Cloudflare challenges to resolve
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check for Cloudflare challenge
        const currentUrl = page.url();
        if (currentUrl.includes('cloudflare') || currentUrl.includes('challenge')) {
            console.log(`[SHARED CHROME] Cloudflare challenge detected for user ${email}, waiting for resolution...`);
            try {
                await page.waitForFunction(() => {
                    return !window.location.href.includes('cloudflare') && 
                           !window.location.href.includes('challenge') &&
                           !document.body.innerHTML.includes('Just a moment');
                }, { timeout: 30000 });
                console.log(`[SHARED CHROME] Cloudflare challenge resolved for user ${email}`);
            } catch (timeoutError) {
                console.log(`[SHARED CHROME] Cloudflare challenge timeout for user ${email}, continuing...`);
            }
        }

        // Navigate to login page to establish login session
        await page.goto('https://alpha.date/login', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check for cf_clearance cookie
        const cookies = await page.cookies();
        const cfClearance = cookies.find(cookie => cookie.name === 'cf_clearance');
        console.log(`[SHARED CHROME] cf_clearance cookie for user ${email}: ${!!cfClearance}`);
    }

    async getUserPage(userId) {
        const userSession = this.userSessions.get(userId);
        if (userSession && !userSession.page.isClosed()) {
            userSession.lastActivity = Date.now();
            this.lastActivity = Date.now();
            return userSession.page;
        }

        // Page doesn't exist or is closed, create new one
        if (userSession) {
            this.userSessions.delete(userId);
        }

        throw new Error(`No active page found for user ${userId}. Please re-authenticate.`);
    }

    async authenticateUser(userId, email, password) {
        try {
            const page = await this.getUserPage(userId);
            
            console.log(`[SHARED CHROME] Authenticating user ${email}...`);

            // Try browser-based API authentication first
            const apiResult = await this._authenticateWithAPI(page, email, password);
            if (apiResult.success) {
                console.log(`[SHARED CHROME] API authentication successful for user ${email}`);
                return apiResult;
            }

            // Fallback to form-based authentication
            console.log(`[SHARED CHROME] Falling back to form authentication for user ${email}`);
            return await this._authenticateWithForm(page, email, password);

        } catch (error) {
            console.error(`[SHARED CHROME] Authentication failed for user ${email}:`, error);
            throw error;
        }
    }

    async _authenticateWithAPI(page, email, password) {
        try {
            const result = await page.evaluate(async (email, password) => {
                try {
                    const response = await fetch('https://alpha.date/api/login/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
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

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const data = await response.json();
                    return { success: true, data };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }, email, password);

            if (result.success && result.data.token) {
                return {
                    success: true,
                    token: result.data.token,
                    operatorId: result.data.operator_id || this._decodeJWTToken(result.data.token),
                    method: 'API'
                };
            }

            return { success: false, message: result.error || 'API authentication failed' };

        } catch (error) {
            return { success: false, message: `API authentication error: ${error.message}` };
        }
    }

    async _authenticateWithForm(page, email, password) {
        try {
            // Fill email field
            const emailSelectors = [
                'input[name="login"]',
                'input[data-testid="email"]',
                'input[type="email"]',
                'input[name="email"]'
            ];

            let emailField = null;
            for (const selector of emailSelectors) {
                try {
                    emailField = await page.waitForSelector(selector, { timeout: 2000 });
                    if (emailField) break;
                } catch (err) {
                    // Continue to next selector
                }
            }

            if (!emailField) {
                throw new Error('Email field not found');
            }

            // Fill password field
            const passwordSelectors = [
                'input[name="password"]',
                'input[data-testid="password"]',
                'input[type="password"]'
            ];

            let passwordField = null;
            for (const selector of passwordSelectors) {
                try {
                    passwordField = await page.waitForSelector(selector, { timeout: 2000 });
                    if (passwordField) break;
                } catch (err) {
                    // Continue to next selector
                }
            }

            if (!passwordField) {
                throw new Error('Password field not found');
            }

            // Fill form with human-like delays
            await emailField.type(email, { delay: 100 });
            await new Promise(resolve => setTimeout(resolve, 500));
            await passwordField.type(password, { delay: 100 });
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Submit form
            const submitSelectors = [
                'button[data-testid="submit-btn"]',
                'button[type="submit"]',
                'input[type="submit"]'
            ];

            let submitButton = null;
            for (const selector of submitSelectors) {
                try {
                    submitButton = await page.waitForSelector(selector, { timeout: 2000 });
                    if (submitButton) break;
                } catch (err) {
                    // Continue to next selector
                }
            }

            if (!submitButton) {
                throw new Error('Submit button not found');
            }

            await submitButton.click();
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Extract token
            const token = await this._extractAuthToken(page);
            if (token) {
                return {
                    success: true,
                    token: token,
                    operatorId: this._decodeJWTToken(token),
                    method: 'Form'
                };
            }

            throw new Error('Authentication token not found');

        } catch (error) {
            return { success: false, message: `Form authentication error: ${error.message}` };
        }
    }

    async _extractAuthToken(page) {
        try {
            // Try localStorage first
            const token = await page.evaluate(() => {
                return localStorage.getItem('token') || 
                       localStorage.getItem('authToken') || 
                       localStorage.getItem('accessToken') ||
                       sessionStorage.getItem('token') ||
                       sessionStorage.getItem('authToken') ||
                       sessionStorage.getItem('accessToken');
            });

            if (token) return token;

            // Try cookies
            const cookies = await page.cookies();
            const tokenCookie = cookies.find(cookie => 
                cookie.name.toLowerCase().includes('token') ||
                cookie.name.toLowerCase().includes('auth')
            );

            if (tokenCookie) return tokenCookie.value;

            return null;
        } catch (error) {
            console.error('[SHARED CHROME] Error extracting token:', error);
            return null;
        }
    }

    _decodeJWTToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            
            const payload = parts[1];
            const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
            const decodedPayload = Buffer.from(paddedPayload, 'base64').toString('utf8');
            const tokenData = JSON.parse(decodedPayload);
            
            return tokenData.id ? tokenData.id.toString() : null;
        } catch (error) {
            return null;
        }
    }

    async makeApiCall(userId, url, options = {}) {
        try {
            const page = await this.getUserPage(userId);
            
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
                return result.data;
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error(`[SHARED CHROME] API call failed for user ${userId}:`, error);
            throw error;
        }
    }

    _startActivityMonitoring() {
        // Monitor activity and close inactive sessions
        setInterval(() => {
            const now = Date.now();
            const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

            for (const [userId, session] of this.userSessions.entries()) {
                if (now - session.lastActivity > inactiveThreshold) {
                    console.log(`[SHARED CHROME] Closing inactive session for user: ${userId}`);
                    if (!session.page.isClosed()) {
                        session.page.close().catch(console.error);
                    }
                    this.userSessions.delete(userId);
                }
            }
        }, 5 * 60 * 1000); // Check every 5 minutes
    }

    async closeUserSession(userId) {
        const session = this.userSessions.get(userId);
        if (session && !session.page.isClosed()) {
            await session.page.close();
        }
        this.userSessions.delete(userId);
        console.log(`[SHARED CHROME] Closed session for user: ${userId}`);
    }

    async shutdown() {
        console.log('[SHARED CHROME] Shutting down shared Chrome instance...');
        
        // Close all user sessions
        for (const [userId, session] of this.userSessions.entries()) {
            if (!session.page.isClosed()) {
                await session.page.close();
            }
        }
        this.userSessions.clear();

        // Close browser
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }

        console.log('[SHARED CHROME] Shared Chrome instance shut down');
    }

    getStats() {
        return {
            browserConnected: !!this.browser && this.browser.isConnected(),
            activeUserSessions: this.userSessions.size,
            lastActivity: this.lastActivity,
            chromePath: this.chromePath
        };
    }
}

// Export singleton instance
const sharedChromeManager = new SharedChromeManager();
export default sharedChromeManager;
