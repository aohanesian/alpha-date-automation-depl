#!/bin/bash

# Tunnel script for exposing local server to the internet
echo "Starting ngrok tunnel for local server..."

# Start ngrok tunnel on port 3000 (adjust if your server runs on different port)
ngrok http 3000 --log=stdout

echo "Tunnel started! Use the HTTPS URL provided by ngrok"
echo "Update your Render environment variables with the new API URL"
