#!/bin/bash

# Tunnel management script
echo "=== Alpha Date Automation Tunnel Manager ==="
echo ""

# Check if ngrok is running
if pgrep -x "ngrok" > /dev/null; then
    echo "✅ ngrok is running"
    
    # Get tunnel URL
    TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | cut -d'"' -f4)
    
    if [ ! -z "$TUNNEL_URL" ]; then
        echo "🌐 Tunnel URL: $TUNNEL_URL"
        echo ""
        echo "📋 Copy this URL to your Render environment variables:"
        echo "   VITE_API_URL = $TUNNEL_URL"
        echo ""
        echo "🔗 Test your tunnel:"
        echo "   curl $TUNNEL_URL"
        echo ""
        echo "📊 ngrok dashboard: http://localhost:4040"
    else
        echo "❌ Could not get tunnel URL"
    fi
else
    echo "❌ ngrok is not running"
    echo ""
    echo "To start the tunnel:"
    echo "   ./tunnel.sh"
    echo ""
    echo "To start the server:"
    echo "   ./start-local-server.sh"
fi

echo ""
echo "=== Commands ==="
echo "Start server:     ./start-local-server.sh"
echo "Start tunnel:     ./tunnel.sh"
echo "Stop tunnel:      pkill ngrok"
echo "Check status:     ./manage-tunnel.sh"
echo "View dashboard:   open http://localhost:4040"
