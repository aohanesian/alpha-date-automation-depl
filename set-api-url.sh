#!/bin/bash

echo "🔧 Setting up VITE_API_URL for LocalTunnel"
echo ""

# Get the current tunnel URL
CURRENT_TUNNEL_URL="https://alpha-date-automation-delp.loca.lt"

echo "✅ Current tunnel URL: $CURRENT_TUNNEL_URL"
echo ""

# Set the environment variable
export VITE_API_URL="$CURRENT_TUNNEL_URL"

echo "🌐 VITE_API_URL has been set to: $VITE_API_URL"
echo ""

echo "📋 To use this in your development environment:"
echo "1. Export the variable: export VITE_API_URL=\"$CURRENT_TUNNEL_URL\""
echo "2. Or add to your shell profile (~/.zshrc or ~/.bash_profile):"
echo "   echo 'export VITE_API_URL=\"$CURRENT_TUNNEL_URL\"' >> ~/.zshrc"
echo ""

echo "🚀 To start your development server with this URL:"
echo "VITE_API_URL=\"$CURRENT_TUNNEL_URL\" npm run dev"
echo ""

echo "💡 For production deployment (Render), set this environment variable:"
echo "VITE_API_URL = $CURRENT_TUNNEL_URL"
echo ""

# Test the tunnel connection
echo "🔍 Testing tunnel connection..."
if curl -s -H "bypass-tunnel-reminder: true" "$CURRENT_TUNNEL_URL" > /dev/null 2>&1; then
    echo "✅ Tunnel is accessible!"
else
    echo "❌ Tunnel connection failed. Make sure LocalTunnel is running."
fi

echo ""
echo "🎯 Your app should now use the correct API URL!"
