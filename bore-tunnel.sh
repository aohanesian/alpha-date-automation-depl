#!/bin/bash

# Bore tunnel script for exposing local server to the internet
echo "Starting bore tunnel for local server..."

# Check if bore-cli is installed
if ! command -v bore &> /dev/null; then
    echo "❌ bore-cli is not installed. Installing..."
    brew install bore-cli
fi

# Start bore tunnel on port 5000
echo "🚀 Starting bore tunnel on port 5000..."
echo "📡 This will create a public HTTPS URL for your local server"
echo ""

# Start bore tunnel
bore local 5000 --to bore.pub

echo ""
echo "✅ Bore tunnel started!"
echo "🌐 Your public URL will be displayed above"
echo "📋 Copy the HTTPS URL to your Render environment variables:"
echo "   VITE_API_URL = [bore-URL]"
echo ""
echo "💡 To stop the tunnel, press Ctrl+C"
