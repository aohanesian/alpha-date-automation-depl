// Test Chrome launch with different configurations
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { platform } from 'os';
import path from 'path';

// Apply the stealth plugin
puppeteer.use(StealthPlugin());

async function testChromeLaunch() {
    console.log('=== Chrome Launch Test ===');
    console.log('Platform:', platform());
    
    // Find Chrome
    const currentPlatform = platform();
    let chromePaths = [];
    
    if (currentPlatform === 'win32') {
        chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
            process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
        ];
    } else {
        chromePaths = [
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium'
        ];
    }
    
    let chromePath = null;
    for (const path of chromePaths) {
        if (existsSync(path)) {
            try {
                const testCommand = currentPlatform === 'win32' 
                    ? `"${path}" --version`
                    : `${path} --version --no-sandbox`;
                execSync(testCommand, { stdio: 'ignore', timeout: 5000 });
                chromePath = path;
                console.log('✅ Found working Chrome at:', chromePath);
                break;
            } catch (err) {
                console.log('❌ Chrome at', path, 'not working');
            }
        }
    }
    
    if (!chromePath) {
        console.error('❌ No working Chrome found');
        return;
    }
    
    // Test 1: Minimal launch
    console.log('\n=== Test 1: Minimal Launch ===');
    try {
        const minimalArgs = [
            '--no-sandbox',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled'
        ];
        
        console.log('Launching with minimal args:', minimalArgs);
        const browser = await puppeteer.launch({
            headless: false,
            executablePath: chromePath,
            args: minimalArgs,
            timeout: 30000
        });
        
        console.log('✅ Minimal launch successful');
        console.log('Browser connected:', browser.isConnected());
        
        const page = await browser.newPage();
        await page.goto('https://example.com');
        console.log('✅ Page navigation successful');
        
        await browser.close();
        console.log('✅ Browser closed successfully');
        
    } catch (error) {
        console.error('❌ Minimal launch failed:', error.message);
    }
    
    // Test 2: With user data directory
    console.log('\n=== Test 2: With User Data Directory ===');
    try {
        const userDataDir = currentPlatform === 'win32' 
            ? path.join(process.env.TEMP || 'C:\\temp', 'test-chrome-user-data')
            : '/tmp/test-chrome-user-data';
        
        // Ensure directory exists
        const fs = await import('fs');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }
        
        const argsWithUserData = [
            '--no-sandbox',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--no-first-run',
            '--disable-web-security',
            `--user-data-dir=${userDataDir}`,
            '--remote-debugging-port=0'
        ];
        
        console.log('Launching with user data dir:', userDataDir);
        console.log('Args:', argsWithUserData);
        
        const browser = await puppeteer.launch({
            headless: false,
            executablePath: chromePath,
            args: argsWithUserData,
            timeout: 30000
        });
        
        console.log('✅ Launch with user data successful');
        console.log('Browser connected:', browser.isConnected());
        
        const page = await browser.newPage();
        await page.goto('https://example.com');
        console.log('✅ Page navigation successful');
        
        await browser.close();
        console.log('✅ Browser closed successfully');
        
        // Clean up test directory
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.log('Warning: Could not clean up test directory:', cleanupError.message);
        }
        
    } catch (error) {
        console.error('❌ Launch with user data failed:', error.message);
    }
    
    // Test 3: Production-like launch
    console.log('\n=== Test 3: Production-like Launch ===');
    try {
        const userDataDir = currentPlatform === 'win32' 
            ? path.join(process.env.TEMP || 'C:\\temp', 'prod-chrome-user-data')
            : '/tmp/prod-chrome-user-data';
        
        const fs = await import('fs');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }
        
        const productionArgs = [
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
            '--disable-background-networking',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--no-first-run',
            `--user-data-dir=${userDataDir}`,
            '--remote-debugging-port=0'
        ];
        
        console.log('Launching with production args...');
        
        const browser = await puppeteer.launch({
            headless: 'new',
            executablePath: chromePath,
            args: productionArgs,
            timeout: 60000
        });
        
        console.log('✅ Production-like launch successful');
        console.log('Browser connected:', browser.isConnected());
        
        const page = await browser.newPage();
        await page.goto('https://example.com');
        console.log('✅ Page navigation successful');
        
        await browser.close();
        console.log('✅ Browser closed successfully');
        
        // Clean up test directory
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.log('Warning: Could not clean up test directory:', cleanupError.message);
        }
        
    } catch (error) {
        console.error('❌ Production-like launch failed:', error.message);
        console.error('Full error:', error);
    }
    
    console.log('\n=== Chrome Launch Test Complete ===');
}

testChromeLaunch().catch(console.error);

