import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';

async function testChrome() {
    console.log('=== Chrome Installation Test ===');
    console.log('Platform:', platform());
    
    try {
        // Test 1: Check system Chrome installation
        console.log('\n1. Checking system Chrome installation...');
        try {
            let chromeVersion;
            if (platform() === 'win32') {
                // Windows Chrome check
                const chromePaths = [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
                ];
                
                for (const path of chromePaths) {
                    if (existsSync(path)) {
                        chromeVersion = execSync(`"${path}" --version`, { encoding: 'utf8' });
                        console.log('System Chrome version:', chromeVersion.trim());
                        break;
                    }
                }
                
                if (!chromeVersion) {
                    console.log('System Chrome not found or not accessible');
                }
            } else {
                // Linux Chrome check
                chromeVersion = execSync('google-chrome --version', { encoding: 'utf8' });
                console.log('System Chrome version:', chromeVersion.trim());
            }
        } catch (err) {
            console.log('System Chrome not found or not accessible');
        }
        
        // Test 2: Check Puppeteer executable path
        console.log('\n2. Checking Puppeteer executable path...');
        const executablePath = puppeteer.executablePath();
        console.log('Puppeteer executable path:', executablePath);
        
        // Test 3: Check if the path exists
        if (executablePath) {
            console.log('Path exists:', existsSync(executablePath));
        }
        
        // Test 4: Check environment variables
        console.log('\n3. Environment variables:');
        console.log('NODE_ENV:', process.env.NODE_ENV);
        console.log('PUPPETEER_CACHE_DIR:', process.env.PUPPETEER_CACHE_DIR);
        console.log('PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
        console.log('PUPPETEER_ARGS:', process.env.PUPPETEER_ARGS);
        
        // Test 5: Check multiple possible Chrome paths
        console.log('\n4. Checking multiple Chrome paths...');
        let possiblePaths = [];
        
        if (platform() === 'win32') {
            possiblePaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
                process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
            ].filter(Boolean);
        } else {
            possiblePaths = [
                '/usr/bin/google-chrome-stable',
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium'
            ].filter(Boolean);
        }
        
        for (const path of possiblePaths) {
            console.log(`${path}: ${existsSync(path) ? 'EXISTS' : 'NOT FOUND'}`);
        }
        
        // Test 6: Try to launch Chrome
        console.log('\n5. Attempting to launch Chrome...');
        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        };
        
        // Add Windows-specific args if needed
        if (platform() === 'win32') {
            launchOptions.args.push('--disable-web-security', '--disable-features=VizDisplayCompositor');
        }
        
        // Find system Chrome executable path
        let chromePath = null;
        for (const path of possiblePaths) {
            if (existsSync(path)) {
                chromePath = path;
                break;
            }
        }
        
        if (chromePath) {
            launchOptions.executablePath = chromePath;
            console.log('Using system Chrome path:', launchOptions.executablePath);
        } else {
            throw new Error('No system Chrome found - application requires Chrome to be installed');
        }
        
        const browser = await puppeteer.launch(launchOptions);
        console.log('Chrome launched successfully!');
        
        // Test 7: Create a page and navigate
        console.log('\n6. Testing page navigation...');
        const page = await browser.newPage();
        await page.goto('https://example.com', { waitUntil: 'networkidle2' });
        
        const title = await page.title();
        console.log('Page title:', title);
        
        await browser.close();
        console.log('\n✅ All tests passed! Chrome is working correctly.');
        
    } catch (error) {
        console.error('\n❌ Chrome test failed:', error.message);
        console.error('Full error:', error);
        
        // Additional debugging
        console.log('\n=== Additional Debugging ===');
        try {
            console.log('Puppeteer version:', require('puppeteer/package.json').version);
        } catch (err) {
            console.log('Could not get Puppeteer version');
        }
        
        process.exit(1);
    }
}

testChrome();
