// services/captchaService.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

// Apply the stealth plugin
puppeteer.use(StealthPlugin());

const captchaService = {
    async solveCaptcha(url, options = {}) {
        let browser = null;
        try {
            console.log(`[CAPTCHA] Attempting to solve captcha for: ${url}`);
            
            const {
                email = '',
                password = '',
                timeout = 300000, // 5 minutes
                headless = false,
                waitForManual = true
            } = options;

            // Launch browser with stealth settings
            browser = await puppeteer.launch({
                headless: headless,
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
                    '--disable-features=VizDisplayCompositor'
                ]
            });

            const page = await browser.newPage();

            // Set realistic user agent
            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );

            // Randomize viewport
            await page.setViewport({
                width: Math.floor(1024 + Math.random() * 100),
                height: Math.floor(768 + Math.random() * 100),
            });

            // Set additional headers
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            });

            console.log('[CAPTCHA] Navigating to page...');
            
            // Navigate to the page
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for page to load
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Check for different types of challenges
            const challengeResult = await this.detectAndSolveChallenge(page, {
                email,
                password,
                timeout,
                waitForManual
            });

            return challengeResult;

        } catch (error) {
            console.error('[CAPTCHA] Error solving captcha:', error);
            return {
                success: false,
                error: error.message,
                type: 'unknown'
            };
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    },

    async detectAndSolveChallenge(page, options) {
        const { email, password, timeout, waitForManual } = options;

        // Check for Cloudflare challenge first
        const cloudflareDetected = await this.checkForCloudflareChallenge(page);
        if (cloudflareDetected) {
            console.log('[CAPTCHA] Cloudflare challenge detected');
            return await this.solveCloudflareChallenge(page, timeout, waitForManual);
        }

        // Check for hCaptcha
        const hcaptchaDetected = await this.checkForHCaptcha(page);
        if (hcaptchaDetected) {
            console.log('[CAPTCHA] hCaptcha detected');
            return await this.solveHCaptcha(page, timeout, waitForManual);
        }

        // Check for reCAPTCHA
        const recaptchaDetected = await this.checkForRecaptcha(page);
        if (recaptchaDetected) {
            console.log('[CAPTCHA] reCAPTCHA detected');
            return await this.solveRecaptcha(page, timeout, waitForManual);
        }

        // Check for generic captcha
        const genericCaptchaDetected = await this.checkForGenericCaptcha(page);
        if (genericCaptchaDetected) {
            console.log('[CAPTCHA] Generic captcha detected');
            return await this.solveGenericCaptcha(page, timeout, waitForManual);
        }

        // If no captcha detected, try to proceed with login if credentials provided
        if (email && password) {
            console.log('[CAPTCHA] No captcha detected, proceeding with login...');
            return await this.proceedWithLogin(page, email, password, timeout);
        }

        return {
            success: true,
            type: 'none',
            message: 'No captcha detected'
        };
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
                'cf-browser-verification',
                'cf_chl_',
                'cf_challenge'
            ];

            return cloudflareIndicators.some(indicator => 
                content.toLowerCase().includes(indicator.toLowerCase())
            );
        } catch (error) {
            console.error('[CAPTCHA] Error checking for Cloudflare challenge:', error);
            return false;
        }
    },

    async checkForHCaptcha(page) {
        try {
            const hcaptchaSelectors = [
                'iframe[src*="hcaptcha"]',
                '.h-captcha',
                '#hcaptcha',
                '[data-sitekey]'
            ];

            for (const selector of hcaptchaSelectors) {
                const element = await page.$(selector);
                if (element) {
                    return true;
                }
            }

            const content = await page.content();
            return content.toLowerCase().includes('hcaptcha');
        } catch (error) {
            console.error('[CAPTCHA] Error checking for hCaptcha:', error);
            return false;
        }
    },

    async checkForRecaptcha(page) {
        try {
            const recaptchaSelectors = [
                'iframe[src*="recaptcha"]',
                '.g-recaptcha',
                '#recaptcha',
                '[data-sitekey]'
            ];

            for (const selector of recaptchaSelectors) {
                const element = await page.$(selector);
                if (element) {
                    return true;
                }
            }

            const content = await page.content();
            return content.toLowerCase().includes('recaptcha');
        } catch (error) {
            console.error('[CAPTCHA] Error checking for reCAPTCHA:', error);
            return false;
        }
    },

    async checkForGenericCaptcha(page) {
        try {
            const captchaSelectors = [
                'iframe[src*="captcha"]',
                '#captcha',
                '[class*="captcha"]',
                'input[name*="captcha"]',
                'img[src*="captcha"]'
            ];

            for (const selector of captchaSelectors) {
                const element = await page.$(selector);
                if (element) {
                    return true;
                }
            }

            const content = await page.content();
            const captchaIndicators = [
                'captcha',
                'verify you are human',
                'prove you are human',
                'human verification'
            ];

            return captchaIndicators.some(indicator => 
                content.toLowerCase().includes(indicator.toLowerCase())
            );
        } catch (error) {
            console.error('[CAPTCHA] Error checking for generic captcha:', error);
            return false;
        }
    },

    async solveCloudflareChallenge(page, timeout, waitForManual) {
        try {
            console.log('[CAPTCHA] Waiting for Cloudflare challenge resolution...');
            
            if (waitForManual) {
                console.log('[CAPTCHA] Please manually solve the Cloudflare challenge in the browser window...');
                
                // Wait for the challenge to be resolved
                await page.waitForFunction(() => {
                    return !document.body.innerHTML.includes('Just a moment') && 
                           !document.body.innerHTML.includes('cf-mitigated') &&
                           !document.body.innerHTML.includes('checking your browser') &&
                           document.readyState === 'complete';
                }, { timeout: timeout });
            } else {
                // Try automatic resolution by waiting
                await new Promise(resolve => setTimeout(resolve, 10000));
            }

            // Check if challenge was resolved
            const isResolved = await page.evaluate(() => {
                return !document.body.innerHTML.includes('Just a moment') && 
                       !document.body.innerHTML.includes('cf-mitigated') &&
                       !document.body.innerHTML.includes('checking your browser');
            });

            if (isResolved) {
                console.log('[CAPTCHA] Cloudflare challenge resolved successfully');
                return {
                    success: true,
                    type: 'cloudflare',
                    message: 'Cloudflare challenge resolved'
                };
            } else {
                throw new Error('Cloudflare challenge not resolved within timeout');
            }
        } catch (error) {
            console.error('[CAPTCHA] Error solving Cloudflare challenge:', error);
            return {
                success: false,
                type: 'cloudflare',
                error: error.message
            };
        }
    },

    async solveHCaptcha(page, timeout, waitForManual) {
        try {
            console.log('[CAPTCHA] Waiting for hCaptcha resolution...');
            
            if (waitForManual) {
                console.log('[CAPTCHA] Please manually solve the hCaptcha in the browser window...');
                
                // Wait for hCaptcha to be solved
                await page.waitForFunction(() => {
                    const hcaptchaElements = document.querySelectorAll('iframe[src*="hcaptcha"], .h-captcha');
                    return hcaptchaElements.length === 0 || 
                           window.location.href.includes('/dashboard') ||
                           window.location.href.includes('/login') === false;
                }, { timeout: timeout });
            } else {
                // Try automatic resolution
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            // Check if captcha was resolved
            const isResolved = await page.evaluate(() => {
                const hcaptchaElements = document.querySelectorAll('iframe[src*="hcaptcha"], .h-captcha');
                return hcaptchaElements.length === 0;
            });

            if (isResolved) {
                console.log('[CAPTCHA] hCaptcha resolved successfully');
                return {
                    success: true,
                    type: 'hcaptcha',
                    message: 'hCaptcha resolved'
                };
            } else {
                throw new Error('hCaptcha not resolved within timeout');
            }
        } catch (error) {
            console.error('[CAPTCHA] Error solving hCaptcha:', error);
            return {
                success: false,
                type: 'hcaptcha',
                error: error.message
            };
        }
    },

    async solveRecaptcha(page, timeout, waitForManual) {
        try {
            console.log('[CAPTCHA] Waiting for reCAPTCHA resolution...');
            
            if (waitForManual) {
                console.log('[CAPTCHA] Please manually solve the reCAPTCHA in the browser window...');
                
                // Wait for reCAPTCHA to be solved
                await page.waitForFunction(() => {
                    const recaptchaElements = document.querySelectorAll('iframe[src*="recaptcha"], .g-recaptcha');
                    return recaptchaElements.length === 0 || 
                           window.location.href.includes('/dashboard') ||
                           window.location.href.includes('/login') === false;
                }, { timeout: timeout });
            } else {
                // Try automatic resolution
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            // Check if captcha was resolved
            const isResolved = await page.evaluate(() => {
                const recaptchaElements = document.querySelectorAll('iframe[src*="recaptcha"], .g-recaptcha');
                return recaptchaElements.length === 0;
            });

            if (isResolved) {
                console.log('[CAPTCHA] reCAPTCHA resolved successfully');
                return {
                    success: true,
                    type: 'recaptcha',
                    message: 'reCAPTCHA resolved'
                };
            } else {
                throw new Error('reCAPTCHA not resolved within timeout');
            }
        } catch (error) {
            console.error('[CAPTCHA] Error solving reCAPTCHA:', error);
            return {
                success: false,
                type: 'recaptcha',
                error: error.message
            };
        }
    },

    async solveGenericCaptcha(page, timeout, waitForManual) {
        try {
            console.log('[CAPTCHA] Waiting for generic captcha resolution...');
            
            if (waitForManual) {
                console.log('[CAPTCHA] Please manually solve the captcha in the browser window...');
                
                // Wait for captcha to be solved
                await page.waitForFunction(() => {
                    const captchaElements = document.querySelectorAll('iframe[src*="captcha"], #captcha, [class*="captcha"]');
                    return captchaElements.length === 0 || 
                           window.location.href.includes('/dashboard') ||
                           window.location.href.includes('/login') === false;
                }, { timeout: timeout });
            } else {
                // Try automatic resolution
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            // Check if captcha was resolved
            const isResolved = await page.evaluate(() => {
                const captchaElements = document.querySelectorAll('iframe[src*="captcha"], #captcha, [class*="captcha"]');
                return captchaElements.length === 0;
            });

            if (isResolved) {
                console.log('[CAPTCHA] Generic captcha resolved successfully');
                return {
                    success: true,
                    type: 'generic',
                    message: 'Generic captcha resolved'
                };
            } else {
                throw new Error('Generic captcha not resolved within timeout');
            }
        } catch (error) {
            console.error('[CAPTCHA] Error solving generic captcha:', error);
            return {
                success: false,
                type: 'generic',
                error: error.message
            };
        }
    },

    async proceedWithLogin(page, email, password, timeout) {
        try {
            console.log('[CAPTCHA] Proceeding with login...');
            
            // Wait for login form to be available
            await page.waitForSelector('input[name="login"], input[data-testid="email"]', { timeout: 10000 });
            await page.waitForSelector('input[name="password"], input[data-testid="password"]', { timeout: 10000 });

            // Fill in credentials with human-like delays
            await page.type('input[name="login"], input[data-testid="email"]', email, { delay: 100 });
            await new Promise(resolve => setTimeout(resolve, 500));
            await page.type('input[name="password"], input[data-testid="password"]', password, { delay: 100 });

            // Wait a bit before submitting
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Submit the form
            await page.click('button[data-testid="submit-btn"], button[type="submit"], input[type="submit"]');
            
            console.log('[CAPTCHA] Login form submitted, waiting for response...');

            // Wait for navigation or response
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Check if login was successful
            const isLoggedIn = await page.evaluate(() => {
                return window.location.href.includes('/dashboard') || 
                       localStorage.getItem('token') || 
                       sessionStorage.getItem('token');
            });

            if (isLoggedIn) {
                console.log('[CAPTCHA] Login successful');
                return {
                    success: true,
                    type: 'login',
                    message: 'Login successful'
                };
            } else {
                throw new Error('Login failed');
            }
        } catch (error) {
            console.error('[CAPTCHA] Error during login:', error);
            return {
                success: false,
                type: 'login',
                error: error.message
            };
        }
    },

    async saveChallengeScreenshot(page, type, email) {
        try {
            // Create screenshots directory if it doesn't exist
            const screenshotsDir = path.join(process.cwd(), 'debug-screenshots');
            if (!fs.existsSync(screenshotsDir)) {
                fs.mkdirSync(screenshotsDir, { recursive: true });
            }

            // Generate filename with timestamp
            const timestamp = Date.now();
            const filename = `${type}-${email.replace('@', '_at_')}-${timestamp}.png`;
            const filepath = path.join(screenshotsDir, filename);

            // Take screenshot
            await page.screenshot({ 
                path: filepath, 
                fullPage: true 
            });

            console.log(`[CAPTCHA] Challenge screenshot saved: ${filepath}`);
            return filepath;
        } catch (error) {
            console.error('[CAPTCHA] Failed to save challenge screenshot:', error);
            return null;
        }
    }
};

export default captchaService;
