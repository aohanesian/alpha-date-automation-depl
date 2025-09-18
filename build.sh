#!/bin/bash

echo "=== Starting build process ==="

# Detect environment - don't override if already set
if [ -z "$NODE_ENV" ]; then
    export NODE_ENV=production
fi

echo "Environment: $NODE_ENV"
echo "Platform: $(uname -s)"
echo "User: $(whoami)"

# Set Puppeteer environment variables for production
if [ "$NODE_ENV" = "production" ]; then
    export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
    export PUPPETEER_EXECUTABLE_PATH=/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome
    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
    export PUPPETEER_DISABLE_HEADLESS_WARNING=true
fi

# Check if we're in a production environment (Render or similar)
if [ "$NODE_ENV" = "production" ] && [ -w "/opt" ]; then
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

# Install Puppeteer browsers (only in production with proper permissions)
if [ "$NODE_ENV" = "production" ] && [ -w "/opt" ]; then
    echo "Installing Puppeteer browsers..."
    npx puppeteer browsers install chrome --force
    
    echo "=== Puppeteer Debug ==="
    echo "Puppeteer browsers: $(npx puppeteer browsers list || echo 'Failed to list')"
else
    echo "Skipping Puppeteer browser installation (not production environment or no /opt write access)"
fi

# Only run Chrome tests in production environment with proper setup
if [ "$NODE_ENV" = "production" ] && [ -w "/opt" ]; then
    echo "Production environment - running Chrome tests..."
    npm run debug:chrome || echo "Chrome debug failed, but continuing build"
    npm run test:chrome || echo "Chrome test failed, but continuing build"
    npm run test:api || echo "API test failed, but continuing build"
else
    echo "Development environment - skipping Chrome tests (Chrome not installed locally)"
fi

# Build the application
echo "Building application..."
npm run build

echo "=== Build process completed ==="
