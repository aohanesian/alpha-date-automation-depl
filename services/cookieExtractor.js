// services/cookieExtractor.js
import puppeteer from 'puppeteer';

class CookieExtractor {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        this.browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
    }

    async extractCookies() {
        try {
            await this.initialize();
            
            console.log('=== COOKIE EXTRACTOR - NAVIGATING TO ALPHA.DATE ===');
            
            // Navigate to Alpha.Date
            await this.page.goto('https://alpha.date', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Wait for any Cloudflare challenges
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Check if we need to complete a challenge manually
            const pageContent = await this.page.content();
            if (pageContent.includes('Just a moment') || pageContent.includes('Checking your browser')) {
                console.log('=== COOKIE EXTRACTOR - CLOUDFLARE CHALLENGE DETECTED ===');
                console.log('Please complete the challenge manually in the browser window...');
                
                // Wait for user to complete the challenge
                await this.page.waitForFunction(() => {
                    return !document.body.innerHTML.includes('Just a moment') && 
                           !document.body.innerHTML.includes('Checking your browser');
                }, { timeout: 120000 }); // Wait up to 2 minutes
                
                console.log('=== COOKIE EXTRACTOR - CHALLENGE COMPLETED ===');
            }

            // Get all cookies
            const cookies = await this.page.cookies();
            
            console.log('=== COOKIE EXTRACTOR - ALL COOKIES ===');
            cookies.forEach(cookie => {
                console.log(`${cookie.name}: ${cookie.value}`);
            });

            // Find cf_clearance cookies
            const cfCookies = cookies.filter(cookie => cookie.name === 'cf_clearance');
            
            console.log('=== COOKIE EXTRACTOR - CF_CLEARANCE COOKIES ===');
            if (cfCookies.length === 0) {
                console.log('No cf_clearance cookies found!');
            } else {
                cfCookies.forEach((cookie, index) => {
                    console.log(`cf_clearance ${index + 1}: ${cookie.value}`);
                });
            }

            // Keep the browser open for manual inspection
            console.log('=== COOKIE EXTRACTOR - BROWSER KEPT OPEN ===');
            console.log('You can manually inspect cookies in Dev Tools → Application → Cookies');
            console.log('Press Ctrl+C to close the browser when done');

            return {
                allCookies: cookies,
                cfClearanceCookies: cfCookies
            };
        } catch (error) {
            console.error('=== COOKIE EXTRACTOR - ERROR ===', error);
            throw error;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

export default CookieExtractor;
