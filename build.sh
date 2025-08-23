#!/bin/bash

echo "=== Starting build process ==="

# Set production environment
export NODE_ENV=production
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
export PUPPETEER_EXECUTABLE_PATH=/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
export PUPPETEER_DISABLE_HEADLESS_WARNING=true

# Check if we're in a production environment
if [ "$NODE_ENV" = "production" ]; then
    echo "Production environment detected, installing Chrome..."
    
    # Install system dependencies for Chrome
    echo "Installing system dependencies..."
    apt-get update && apt-get install -y \
        wget \
        gnupg \
        ca-certificates \
        procps \
        libxss1 \
        libnss3 \
        libatk-bridge2.0-0 \
        libgtk-3-0 \
        libxkbcommon0 \
        libxcomposite1 \
        libasound2 \
        libxrandr2 \
        libxdamage1 \
        libxfixes3 \
        libx11-xcb1 \
        libdrm2 \
        libgbm1 \
        libasound2 \
        libatspi2.0-0 \
        libxshmfence1 \
        fonts-liberation \
        libappindicator3-1 \
        libnspr4 \
        xdg-utils
    
    # Install Chrome
    echo "Installing Google Chrome..."
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - || echo "Warning: Could not add Chrome signing key"
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
    apt-get update
    apt-get install -y google-chrome-stable || echo "Warning: Could not install Chrome via apt"
    
    # Alternative: Download Chrome directly if apt install fails
    if ! command -v google-chrome &> /dev/null; then
        echo "Chrome not found via apt, downloading directly..."
        wget -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
        apt-get install -y /tmp/chrome.deb || echo "Warning: Could not install Chrome from deb file"
    fi
    
    # Debug Chrome installation
    echo "=== Chrome Installation Debug ==="
    echo "System Chrome: $(which google-chrome || echo 'Not found')"
    echo "System Chrome version: $(google-chrome --version || echo 'Not found')"
else
    echo "Development environment detected, skipping Chrome installation"
fi

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# Install Puppeteer browsers
echo "Installing Puppeteer browsers..."
npx puppeteer browsers install chrome --force

# Debug Puppeteer installation
echo "=== Puppeteer Debug ==="
echo "Puppeteer browsers: $(npx puppeteer browsers list || echo 'Failed to list')"
npm run debug:chrome

# Test Chrome functionality (non-blocking)
echo "Testing Chrome functionality..."
npm run test:chrome || echo "Chrome test failed, but continuing build"

# Test API functionality (non-blocking)
echo "Testing API functionality..."
npm run test:api || echo "API test failed, but continuing build"

# Test ZenRows functionality (non-blocking)
echo "Testing ZenRows functionality..."
npm run test:zenrows || echo "ZenRows test failed, but continuing build"

# Build the application
echo "Building application..."
npm run build

echo "=== Build process completed ==="
