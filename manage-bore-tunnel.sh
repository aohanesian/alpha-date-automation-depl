#!/bin/bash

# Bore tunnel management script
echo "=== Alpha Date Automation Bore Tunnel Manager ==="
echo ""

# Check if bore is running
if pgrep -f "bore local" > /dev/null; then
    echo "✅ Bore tunnel is running"
    echo ""
    echo "🌐 Bore tunnels are typically accessible at:"
    echo "   https://[random-id].bore.pub"
    echo ""
    echo "📋 To get your tunnel URL, check the bore output or run:"
    echo "   bore local 5000 --to bore.pub"
    echo ""
    echo "🔗 Test your tunnel:"
    echo "   curl https://[your-bore-url]"
    echo ""
    echo "📊 Bore doesn't have a web dashboard like ngrok"
else
    echo "❌ Bore tunnel is not running"
    echo ""
    echo "To start the tunnel:"
    echo "   ./bore-tunnel.sh"
    echo ""
    echo "To start the server:"
    echo "   ./start-local-server.sh"
fi

echo ""
echo "=== Commands ==="
echo "Start server:     ./start-local-server.sh"
echo "Start tunnel:     ./bore-tunnel.sh"
echo "Stop tunnel:      pkill -f 'bore local'"
echo "Check status:     ./manage-bore-tunnel.sh"
echo ""
echo "=== Bore CLI Benefits ==="
echo "✅ No HTTPS request limits"
echo "✅ Free and open source"
echo "✅ Simple setup"
echo "✅ Reliable tunneling"
