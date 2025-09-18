#!/usr/bin/env node

import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    // Read puppeteer package.json for version
    const puppeteerPkg = JSON.parse(
        readFileSync(join(__dirname, 'node_modules', 'puppeteer', 'package.json'), 'utf8')
    );
    
    console.log('Puppeteer version:', puppeteerPkg.version);
    console.log('Chrome executable path:', puppeteer.executablePath());
} catch (error) {
    console.error('Debug Chrome error:', error.message);
    process.exit(1);
}
