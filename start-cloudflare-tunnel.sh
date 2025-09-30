#!/bin/bash

echo "🚀 Starting Cloudflare Tunnel..."
echo "📡 This will create a public HTTPS URL for your local server"
echo ""

# Start cloudflared tunnel and capture the URL
cloudflared tunnel --url http://localhost:5000 2>&1 | while IFS= read -r line; do
    echo "$line"
    
    # Look for the tunnel URL in the output
    if [[ $line == *"https://"* ]]; then
        echo ""
        echo "✅ TUNNEL URL FOUND:"
        echo "🌐 $line"
        echo ""
        echo "📋 Copy this URL to your Render environment variables:"
        echo "   VITE_API_URL = $line"
        echo ""
        echo "💡 To stop the tunnel, press Ctrl+C"
    fi
done
