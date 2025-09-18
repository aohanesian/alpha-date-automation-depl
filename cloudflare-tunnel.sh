#!/bin/bash

# Cloudflare Tunnel script for alpha-auto tunnel
# Tunnel ID: c47ff772-4b3f-4187-8d3a-47573f4c1b66
# Connector ID: 4defea4b-c04d-47ef-934e-d82265f9e922

echo "🚀 Starting Cloudflare Tunnel 'alpha-auto'..."
echo "📡 Tunnel ID: c47ff772-4b3f-4187-8d3a-47573f4c1b66"
echo ""

# Install cloudflared if not already installed
if ! command -v cloudflared &> /dev/null; then
    echo "📦 Installing cloudflared..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install cloudflared
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Install for Linux
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb
    else
        echo "❌ Unsupported OS. Please install cloudflared manually."
        exit 1
    fi
fi

# Check if config file exists
CONFIG_FILE="$(pwd)/cloudflare-tunnel-config.yaml"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Configuration file not found: $CONFIG_FILE"
    echo "💡 Make sure cloudflare-tunnel-config.yaml exists in the project directory"
    exit 1
fi

# Check if credentials file exists
CREDENTIALS_FILE="$HOME/.cloudflared/c47ff772-4b3f-4187-8d3a-47573f4c1b66.json"
if [ ! -f "$CREDENTIALS_FILE" ]; then
    echo "❌ Credentials file not found: $CREDENTIALS_FILE"
    echo ""
    echo "📋 To setup credentials, run:"
    echo "   cloudflared tunnel login"
    echo "   # Or copy your existing credentials file to:"
    echo "   # $CREDENTIALS_FILE"
    echo ""
    exit 1
fi

echo "✅ Configuration file found: $CONFIG_FILE"
echo "✅ Credentials file found: $CREDENTIALS_FILE"
echo ""

# Start the tunnel using the configuration file
echo "🌐 Starting tunnel with configuration..."
cloudflared tunnel --config "$CONFIG_FILE" run alpha-auto

echo ""
echo "❌ Tunnel stopped!"
echo "💡 To restart, run this script again"
