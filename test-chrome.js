import puppeteer from 'puppeteer';

async function testChrome() {
    console.log('Testing Chrome installation...');
    
    try {
        // Test 1: Check if Puppeteer can find Chrome
        console.log('1. Checking Puppeteer executable path...');
        const executablePath = puppeteer.executablePath();
        console.log('Puppeteer executable path:', executablePath);
        
        // Test 2: Try to launch Chrome
        console.log('2. Attempting to launch Chrome...');
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        
        console.log('Chrome launched successfully!');
        
        // Test 3: Create a page and navigate
        console.log('3. Testing page navigation...');
        const page = await browser.newPage();
        await page.goto('https://example.com', { waitUntil: 'networkidle2' });
        
        const title = await page.title();
        console.log('Page title:', title);
        
        await browser.close();
        console.log('All tests passed! Chrome is working correctly.');
        
    } catch (error) {
        console.error('Chrome test failed:', error.message);
        console.error('Full error:', error);
        
        // Try to provide helpful debugging info
        console.log('\nDebugging information:');
        console.log('NODE_ENV:', process.env.NODE_ENV);
        console.log('PUPPETEER_CACHE_DIR:', process.env.PUPPETEER_CACHE_DIR);
        console.log('PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
        
        process.exit(1);
    }
}

testChrome();
