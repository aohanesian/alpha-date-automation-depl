// services/puppeteerService.js
import puppeteer from 'puppeteer';

class PuppeteerService {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            console.log('=== PUPPETEER - INITIALIZING ===');
            
            // Launch browser with stealth settings
            this.browser = await puppeteer.launch({
                headless: false, // Set to true in production
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
                    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
                ]
            });

            this.page = await this.browser.newPage();
            
            // Set viewport and user agent
            await this.page.setViewport({ width: 1920, height: 1080 });
            await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36');

            // Set extra headers
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept': 'application/json, text/plain, */*',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-CH-UA': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
                'Sec-CH-UA-Mobile': '?0',
                'Sec-CH-UA-Platform': '"macOS"'
            });

            this.isInitialized = true;
            console.log('=== PUPPETEER - INITIALIZED SUCCESSFULLY ===');
        } catch (error) {
            console.error('=== PUPPETEER - INITIALIZATION FAILED ===', error);
            throw error;
        }
    }

    async loginWithToken(token, cfClearance) {
        try {
            await this.initialize();
            
            console.log('=== PUPPETEER - LOGGING IN WITH TOKEN ===');
            
            // Clear any existing cf_clearance cookies first
            const existingCookies = await this.page.cookies();
            const cfCookies = existingCookies.filter(cookie => cookie.name === 'cf_clearance');
            
            if (cfCookies.length > 0) {
                console.log('=== PUPPETEER - CLEARING EXISTING CF COOKIES ===', cfCookies.length);
                for (const cookie of cfCookies) {
                    await this.page.deleteCookie(cookie);
                }
            }
            
            // Set the fresh cf_clearance cookie
            await this.page.setCookie({
                name: 'cf_clearance',
                value: cfClearance,
                domain: '.alpha.date',
                path: '/',
                secure: true,
                httpOnly: false
            });
            
            console.log('=== PUPPETEER - CF CLEARANCE COOKIE SET ===', cfClearance.substring(0, 50) + '...');

            // Navigate to Alpha.Date
            await this.page.goto('https://alpha.date', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Wait for any Cloudflare challenges to complete
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Check if we're still on a Cloudflare challenge page
            const pageContent = await this.page.content();
            
            const currentUrl = this.page.url();
            console.log('=== PUPPETEER - CURRENT URL ===', currentUrl);
            
            if (pageContent.includes('Just a moment') || pageContent.includes('Checking your browser') || currentUrl.includes('challenges.cloudflare.com')) {
                console.log('=== PUPPETEER - CLOUDFLARE CHALLENGE DETECTED ===');
                console.log('Waiting for manual challenge completion...');
                
                // Wait for user to complete the challenge manually
                await this.page.waitForFunction(() => {
                    return !document.body.innerHTML.includes('Just a moment') && 
                           !document.body.innerHTML.includes('Checking your browser') &&
                           !window.location.href.includes('challenges.cloudflare.com');
                }, { timeout: 60000 }); // Wait up to 60 seconds
                
                console.log('=== PUPPETEER - CLOUDFLARE CHALLENGE COMPLETED ===');
            }

            // Check if we're on a login page or if we need to set the token
            const updatedUrl = this.page.url();
            console.log('=== PUPPETEER - CURRENT URL ===', updatedUrl);

            // Set the token in localStorage
            await this.page.evaluate((token) => {
                localStorage.setItem('token', token);
                console.log('Token set in localStorage:', token.substring(0, 50) + '...');
            }, token);

            // Wait a moment for localStorage to be set
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Refresh the page to apply the token
            await this.page.reload({ waitUntil: 'networkidle2' });
            
            // Wait for the page to load after refresh
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log('=== PUPPETEER - LOGIN COMPLETED ===');
            return true;
        } catch (error) {
            console.error('=== PUPPETEER - LOGIN FAILED ===', error);
            throw error;
        }
    }

    async getProfiles() {
        try {
            if (!this.isInitialized) {
                throw new Error('Puppeteer not initialized. Call loginWithToken first.');
            }

            console.log('=== PUPPETEER - FETCHING PROFILES ===');
            
            // Use page.evaluate to make the API call from the browser context
            const profiles = await this.page.evaluate(async () => {
                try {
                    const token = localStorage.getItem('token');
                    if (!token) {
                        throw new Error('No token found in localStorage');
                    }

                    console.log('Making API call with token:', token.substring(0, 50) + '...');
                    
                    const response = await fetch('https://alpha.date/api/operator/profiles', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/json, text/plain, */*',
                            'Content-Type': 'application/json'
                        }
                    });

                    console.log('API Response status:', response.status);
                    console.log('API Response headers:', Object.fromEntries(response.headers.entries()));

                    if (response.ok) {
                        const data = await response.json();
                        console.log('Profiles fetched successfully:', data.length);
                        return data;
                    } else {
                        const errorText = await response.text();
                        console.log('API Error response:', errorText.substring(0, 500));
                        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
                    }
                } catch (error) {
                    console.error('Error in page.evaluate:', error);
                    throw error;
                }
            });
            
            console.log('=== PUPPETEER - PROFILES FETCHED SUCCESSFULLY ===', profiles.length);
            return profiles;
        } catch (error) {
            console.error('=== PUPPETEER - FETCH PROFILES FAILED ===', error);
            throw error;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.isInitialized = false;
            console.log('=== PUPPETEER - CLOSED ===');
        }
    }
}

// Create singleton instance
const puppeteerService = new PuppeteerService();

export default puppeteerService;
