#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';

export async function ensureChrome() {
    if (platform() !== 'linux' || process.env.NODE_ENV !== 'production') {
        return null;
    }

    console.log('[CHROME] Checking Chrome availability...');

    // Check if Chrome is already installed
    const chromePaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
    ];

    for (const path of chromePaths) {
        if (existsSync(path)) {
            try {
                // Test if Chrome works
                execSync(`${path} --version --no-sandbox`, { stdio: 'ignore', timeout: 5000 });
                console.log(`[CHROME] ✅ Working Chrome found: ${path}`);
                return path;
            } catch {
                console.log(`[CHROME] Chrome at ${path} not working`);
            }
        }
    }

    console.log('[CHROME] No working system Chrome found');

    // Try to install Chrome (this might fail if no root access)
    try {
        console.log('[CHROME] Attempting Chrome installation...');
        
        // Simple installation without complex repository setup
        execSync(`
            wget -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb &&
            dpkg -i /tmp/chrome.deb
        `, { stdio: 'pipe', timeout: 60000 });
        
        console.log('[CHROME] ✅ Chrome installed successfully');
        return '/usr/bin/google-chrome-stable';
        
    } catch (installError) {
        console.log('[CHROME] Chrome installation failed (expected if no root access)');
        console.log('[CHROME] Will use Puppeteer Chrome or ZenRows fallback');
        
        // Check if Puppeteer Chrome exists
        const puppeteerPath = '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
        if (existsSync(puppeteerPath)) {
            console.log(`[CHROME] Using Puppeteer Chrome: ${puppeteerPath}`);
            return puppeteerPath;
        }
        
        return null;
    }
}

// If called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    ensureChrome().then(path => {
        if (path) {
            console.log(`Chrome available at: ${path}`);
        } else {
            console.log('No Chrome available');
        }
    });
}
