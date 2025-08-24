#!/bin/bash

echo "🚀 Starting LocalTunnel..."
echo "📡 This will create a public HTTPS URL for your local server"
echo "✅ No request limits"
echo "✅ Free and reliable"
echo ""

# Start LocalTunnel on port 3000
lt --port 3000 --subdomain alpha-date-automation

echo ""
echo "✅ LocalTunnel started!"
echo "🌐 Your public URL will be displayed above"
echo "📋 Copy the HTTPS URL to your Render environment variables:"
echo "   VITE_API_URL = [localtunnel-URL]"
echo ""
echo "💡 To stop the tunnel, press Ctrl+C"
