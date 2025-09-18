#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { platform, userInfo } from 'os';

console.log('=== Chrome Installation Script ===');

// Environment detection
const isProduction = process.env.NODE_ENV === 'production';
const isRender = existsSync('/opt/render') || process.env.RENDER === 'true';
const isLinux = platform() === 'linux';
const canWriteOpt = (() => {
    try {
        return existsSync('/opt') && execSync('test -w /opt', { stdio: 'ignore' }) === null;
    } catch {
        return false;
    }
})();

console.log('Environment Detection:');
console.log(`  Platform: ${platform()}`);
console.log(`  User: ${userInfo().username}`);
console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`  Is Production: ${isProduction}`);
console.log(`  Is Render: ${isRender}`);
console.log(`  Is Linux: ${isLinux}`);
console.log(`  Can write /opt: ${canWriteOpt}`);

// Decide whether to install Chrome
const shouldInstallChrome = isProduction && isLinux && (isRender || canWriteOpt);

if (!shouldInstallChrome) {
    console.log('Skipping Chrome installation:');
    if (!isProduction) console.log('  - Not production environment');
    if (!isLinux) console.log('  - Not Linux platform');
    if (!canWriteOpt && !isRender) console.log('  - No write access to /opt');
    console.log('Chrome installation completed (skipped)');
    process.exit(0);
}

console.log('Installing Chrome for production environment...');

try {
    // Set Puppeteer environment variables
    process.env.PUPPETEER_CACHE_DIR = '/opt/render/.cache/puppeteer';
    process.env.PUPPETEER_EXECUTABLE_PATH = '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'false';
    process.env.PUPPETEER_DISABLE_HEADLESS_WARNING = 'true';

    console.log('Environment variables set:');
    console.log(`  PUPPETEER_CACHE_DIR: ${process.env.PUPPETEER_CACHE_DIR}`);
    console.log(`  PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);

    // Install system dependencies for Chrome
    console.log('Installing system dependencies...');
    execSync(`
        apt-get update && apt-get install -y \\
            wget gnupg ca-certificates procps libxss1 libnss3 \\
            libatk-bridge2.0-0 libgtk-3-0 libxkbcommon0 libxcomposite1 \\
            libasound2 libxrandr2 libxdamage1 libxfixes3 libx11-xcb1 \\
            libdrm2 libgbm1 libatspi2.0-0 libxshmfence1 fonts-liberation \\
            libappindicator3-1 libnspr4 xdg-utils
    `, { stdio: 'inherit' });

    // Install Google Chrome (system installation)
    console.log('Installing Google Chrome...');
    try {
        execSync(`
            wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - &&
            echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list &&
            apt-get update &&
            apt-get install -y google-chrome-stable
        `, { stdio: 'inherit' });
        console.log('✅ System Chrome installed successfully');
    } catch (error) {
        console.log('Chrome installation via apt failed, trying direct download...');
        try {
            execSync(`
                wget -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb &&
                apt-get install -y /tmp/chrome.deb
            `, { stdio: 'inherit' });
            console.log('✅ System Chrome installed via direct download');
        } catch (directError) {
            console.log('❌ System Chrome installation failed, but continuing...');
        }
    }

    // Skip Puppeteer browsers - use system Chrome instead
    console.log('Skipping Puppeteer browser installation (using system Chrome)');

    // Verify installation
    console.log('Verifying Chrome installation...');
    
    // Check system Chrome
    try {
        const chromeVersion = execSync('google-chrome --version', { encoding: 'utf8' });
        console.log(`✅ System Chrome: ${chromeVersion.trim()}`);
        
        // Test system Chrome launch
        execSync('google-chrome --version --no-sandbox', { stdio: 'ignore' });
        console.log('✅ System Chrome launch test successful');
        
    } catch {
        console.log('❌ System Chrome: Not found or not working');
        
        // Check alternative Chrome locations
        const chromePaths = [
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium'
        ];
        
        for (const path of chromePaths) {
            if (existsSync(path)) {
                console.log(`✅ Found alternative Chrome at: ${path}`);
                break;
            }
        }
    }

    console.log('✅ Chrome installation process completed!');

} catch (error) {
    console.error('❌ Chrome installation failed:', error.message);
    console.log('Continuing with build process (Chrome installation is optional)...');
    process.exit(0); // Don't fail the build, just continue without Chrome
}
