#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';

export async function ensureChrome() {
    const currentPlatform = platform();
    if ((currentPlatform !== 'linux' && currentPlatform !== 'win32') || process.env.NODE_ENV !== 'production') {
        return null;
    }

    console.log('[CHROME] Checking Chrome availability...');

    // Check if Chrome is already installed
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
    }

    for (const path of chromePaths) {
        if (existsSync(path)) {
            try {
                // Test if Chrome works - different commands for different platforms
                const testCommand = currentPlatform === 'win32' 
                    ? `"${path}" --version`
                    : `${path} --version --no-sandbox`;
                execSync(testCommand, { stdio: 'ignore', timeout: 5000 });
                console.log(`[CHROME] ✅ Working Chrome found: ${path}`);
                return path;
            } catch {
                console.log(`[CHROME] Chrome at ${path} not working`);
            }
        }
    }

    console.log('[CHROME] No working system Chrome found');

    // Try to install Chrome (this might fail if no admin access)
    try {
        console.log('[CHROME] Attempting Chrome installation...');
        
        if (currentPlatform === 'linux') {
            // Simple installation without complex repository setup
            execSync(`
                wget -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb &&
                dpkg -i /tmp/chrome.deb
            `, { stdio: 'pipe', timeout: 60000 });
            
            console.log('[CHROME] ✅ Chrome installed successfully');
            return '/usr/bin/google-chrome-stable';
        } else if (currentPlatform === 'win32') {
            // Windows Chrome installation using PowerShell
            const installScript = `
                $url = 'https://dl.google.com/chrome/install/375.126/chrome_installer.exe'
                $output = '$env:TEMP\\chrome_installer.exe'
                Invoke-WebRequest -Uri $url -OutFile $output
                Start-Process -FilePath $output -ArgumentList '/silent', '/install' -Wait
                Remove-Item $output -Force
            `;
            execSync(`powershell -Command "${installScript}"`, { stdio: 'pipe', timeout: 120000 });
            
            console.log('[CHROME] ✅ Chrome installed successfully');
            // Return the most likely installation path
            const winChromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
            return existsSync(winChromePath) ? winChromePath : 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
        }
        
    } catch (installError) {
        console.log('[CHROME] Chrome installation failed (expected if no admin access)');
        console.log('[CHROME] No system Chrome available - application requires Chrome to be installed');
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
