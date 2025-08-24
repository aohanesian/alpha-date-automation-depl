#!/bin/bash

# Cloudflare Tunnel script for exposing local server to the internet
echo "Starting Cloudflare Tunnel for local server..."

# Install cloudflared if not already installed
if ! command -v cloudflared &> /dev/null; then
    echo "Installing cloudflared..."
    brew install cloudflared
fi

# Create tunnel if it doesn't exist
echo "Creating tunnel..."
cloudflared tunnel create alpha-date-automation

# Start tunnel
echo "Starting tunnel..."
cloudflared tunnel --url http://localhost:3000

echo "Tunnel started! Use the HTTPS URL provided by Cloudflare"
echo "Update your Render environment variables with the new API URL"
