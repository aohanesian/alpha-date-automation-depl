#!/bin/bash

echo "=== Fast Build Process ==="

# Set production environment
export NODE_ENV=production
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
export PUPPETEER_EXECUTABLE_PATH=/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
export PUPPETEER_DISABLE_HEADLESS_WARNING=true

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# Install Puppeteer browsers (skip if already installed)
echo "Installing Puppeteer browsers..."
npx puppeteer browsers install chrome --force

# Quick Chrome test (non-blocking)
echo "Quick Chrome test..."
timeout 30s npm run test:chrome || echo "Chrome test timed out, but continuing"

# Check what Chrome files actually exist
echo "Checking Chrome installation..."
find /opt/render/.cache/puppeteer -name "*chrome*" -type f 2>/dev/null | head -5 || echo "No Chrome files found in Puppeteer cache"
ls -la /usr/bin/google-chrome* 2>/dev/null || echo "No Chrome in /usr/bin"

# Build the application
echo "Building application..."
npm run build

echo "=== Fast build completed ==="
