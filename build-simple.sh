#!/bin/bash

echo "=== Simple Build Process ==="

# Set environment
export NODE_ENV=production

# Install Chrome dependencies
echo "Installing Chrome dependencies..."
apt-get update
apt-get install -y wget gnupg ca-certificates

# Install Chrome
echo "Installing Chrome..."
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt-get update
apt-get install -y google-chrome-stable

# Install Node dependencies
echo "Installing Node dependencies..."
npm install

# Install Puppeteer browsers
echo "Installing Puppeteer browsers..."
npx puppeteer browsers install chrome

# Build the app
echo "Building application..."
npm run build

echo "=== Build completed ==="
