#!/bin/bash

# Local server startup script for Mac deployment
echo "Starting Alpha Date Automation server on Mac..."

# Set environment variables for local deployment
export NODE_ENV=production
export PORT=3000

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the server
echo "Starting server on port 3000..."
echo "Server will be available at: http://localhost:3000"
echo ""
echo "To expose to internet, run: ./tunnel.sh"
echo ""

npm start
