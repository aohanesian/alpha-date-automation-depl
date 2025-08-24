#!/bin/bash

echo "=== Active Browser Sessions ==="
echo ""

# Check running Chrome processes
echo "Chrome processes:"
ps aux | grep -i chrome | grep -v grep | wc -l

echo ""
echo "Chrome user data directories:"
ls -la /tmp/chrome-user-* 2>/dev/null | wc -l

echo ""
echo "Active sessions in browser session manager:"
curl -s https://ee3e9af900a3.ngrok-free.app/api/mac-server-test | jq '.message' 2>/dev/null || echo "Server is running"

echo ""
echo "To see detailed Chrome processes:"
echo "ps aux | grep -i chrome | grep -v grep"
