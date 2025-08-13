// extractCookies.js
import CookieExtractor from './services/cookieExtractor.js';

async function main() {
    const extractor = new CookieExtractor();
    
    try {
        console.log('=== COOKIE EXTRACTION TOOL ===');
        console.log('This tool will help you get a fresh cf_clearance cookie');
        console.log('A browser window will open - complete any Cloudflare challenges manually');
        console.log('');
        
        const result = await extractor.extractCookies();
        
        console.log('');
        console.log('=== EXTRACTION COMPLETE ===');
        console.log('Copy the cf_clearance cookie value and use it in the login form');
        
        // Keep the process running
        process.stdin.resume();
        console.log('Press Ctrl+C to exit');
        
    } catch (error) {
        console.error('Extraction failed:', error);
        await extractor.close();
        process.exit(1);
    }
}

main();
