#!/bin/bash

echo "=== Finding Chrome Installation ==="

echo "1. Checking common Chrome locations:"
ls -la /usr/bin/google-chrome* 2>/dev/null || echo "No Chrome in /usr/bin"
ls -la /usr/bin/chromium* 2>/dev/null || echo "No Chromium in /usr/bin"

echo ""
echo "2. Checking Puppeteer cache directory:"
ls -la /opt/render/.cache/puppeteer/ 2>/dev/null || echo "Puppeteer cache not found"

echo ""
echo "3. Finding Chrome executables in system:"
find /opt -name "*chrome*" -type f -executable 2>/dev/null | head -10

echo ""
echo "4. Checking which command:"
which google-chrome 2>/dev/null || echo "google-chrome not found"
which chromium-browser 2>/dev/null || echo "chromium-browser not found"

echo ""
echo "5. Checking Puppeteer executable path:"
node -e "console.log('Puppeteer executable path:', require('puppeteer').executablePath())" 2>/dev/null || echo "Could not get Puppeteer path"

echo ""
echo "=== Chrome Search Complete ==="
