#!/bin/bash

# Comprehensive tunnel options script
echo "=== Alpha Date Automation - Tunnel Options ==="
echo ""

echo "Choose your tunneling solution:"
echo "1. Bore CLI (Recommended - No limits, free)"
echo "2. Cloudflare Tunnel (Reliable, free)"
echo "3. Ngrok (Limited free tier)"
echo "4. Exit"
echo ""

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting Bore CLI tunnel..."
        echo "✅ No HTTPS request limits"
        echo "✅ Free and open source"
        echo ""
        
        # Check if bore-cli is installed
        if ! command -v bore &> /dev/null; then
            echo "Installing bore-cli..."
            brew install bore-cli
        fi
        
        # Start bore tunnel
        bore local 3000 --to bore.pub
        ;;
    2)
        echo ""
        echo "🚀 Starting Cloudflare Tunnel..."
        echo "✅ Reliable and fast"
        echo "✅ Free tier available"
        echo ""
        
        # Check if cloudflared is installed
        if ! command -v cloudflared &> /dev/null; then
            echo "Installing cloudflared..."
            brew install cloudflared
        fi
        
        # Start cloudflare tunnel
        cloudflared tunnel --url http://localhost:3000
        ;;
    3)
        echo ""
        echo "🚀 Starting Ngrok tunnel..."
        echo "⚠️  Limited to 40 connections/minute on free tier"
        echo ""
        
        # Check if ngrok is installed
        if ! command -v ngrok &> /dev/null; then
            echo "❌ Ngrok not found. Please install ngrok first."
            echo "Visit: https://ngrok.com/download"
            exit 1
        fi
        
        # Start ngrok tunnel
        ngrok http 3000 --log=stdout
        ;;
    4)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo "Invalid choice. Please run the script again."
        exit 1
        ;;
esac
