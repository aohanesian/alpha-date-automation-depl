#!/bin/bash

# Cloudflare Tunnel Setup Test Script
# Tests all components of the Cloudflare tunnel implementation

echo "🧪 Cloudflare Tunnel Setup Test"
echo "================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

TUNNEL_ID="b40b4382-13e7-48c0-987a-ee7b8e9905f3"
CONFIG_FILE="$(pwd)/cloudflare-tunnel-config.yaml"
CREDENTIALS_FILE="$HOME/.cloudflared/$TUNNEL_ID.json"
MANAGE_SCRIPT="$(pwd)/manage-cloudflare-tunnel.sh"

total_tests=0
passed_tests=0

run_test() {
    total_tests=$((total_tests + 1))
    print_test "$1"
    
    if eval "$2"; then
        print_pass "$3"
        passed_tests=$((passed_tests + 1))
        return 0
    else
        print_fail "$4"
        return 1
    fi
}

echo "Testing Cloudflare tunnel implementation..."
echo ""

# Test 1: Check if cloudflared is installed
run_test "Checking cloudflared installation" \
    "command -v cloudflared &> /dev/null" \
    "cloudflared is installed" \
    "cloudflared is not installed - run: ./manage-cloudflare-tunnel.sh install"

# Test 2: Check configuration file
run_test "Checking configuration file" \
    "[ -f '$CONFIG_FILE' ]" \
    "Configuration file exists: $CONFIG_FILE" \
    "Configuration file missing: $CONFIG_FILE"

# Test 3: Check credentials file
run_test "Checking credentials file" \
    "[ -f '$CREDENTIALS_FILE' ]" \
    "Credentials file exists: $CREDENTIALS_FILE" \
    "Credentials file missing: $CREDENTIALS_FILE - run: ./manage-cloudflare-tunnel.sh setup"

# Test 4: Check management script
run_test "Checking management script" \
    "[ -x '$MANAGE_SCRIPT' ]" \
    "Management script is executable: $MANAGE_SCRIPT" \
    "Management script not found or not executable: $MANAGE_SCRIPT"

# Test 5: Check monitor script
run_test "Checking monitor script" \
    "[ -x '$(pwd)/cloudflare-tunnel-monitor.sh' ]" \
    "Monitor script is executable" \
    "Monitor script not found or not executable"

# Test 6: Validate configuration file syntax
if [ -f "$CONFIG_FILE" ]; then
    run_test "Validating configuration syntax" \
        "grep -q 'tunnel: $TUNNEL_ID' '$CONFIG_FILE'" \
        "Configuration contains correct tunnel ID" \
        "Configuration missing tunnel ID or incorrect"
fi

# Test 7: Check if local server port is available
run_test "Checking if port 3000 is available for local server" \
    "! lsof -i :3000 &> /dev/null" \
    "Port 3000 is available" \
    "Port 3000 is in use - make sure your server is running"

# Test 8: Test tunnel info (if credentials exist)
if [ -f "$CREDENTIALS_FILE" ] && command -v cloudflared &> /dev/null; then
    run_test "Testing tunnel connectivity" \
        "timeout 10 cloudflared tunnel info $TUNNEL_ID &> /dev/null" \
        "Tunnel info retrieved successfully" \
        "Failed to retrieve tunnel info - check credentials"
fi

echo ""
echo "================================="
echo "Test Results: $passed_tests/$total_tests tests passed"

if [ $passed_tests -eq $total_tests ]; then
    print_pass "All tests passed! ✨"
    echo ""
    echo "🚀 Your Cloudflare tunnel is ready to use!"
    echo ""
    echo "Next steps:"
    echo "1. Start your local server: ./start-local-server.sh"
    echo "2. Start the tunnel: ./manage-cloudflare-tunnel.sh start"
    echo "3. Or start with monitoring: ./cloudflare-tunnel-monitor.sh daemon"
    echo ""
    echo "💡 Use './manage-cloudflare-tunnel.sh status' to check tunnel health"
else
    print_fail "Some tests failed. Please fix the issues above."
    echo ""
    echo "Common fixes:"
    echo "- Install cloudflared: ./manage-cloudflare-tunnel.sh install"
    echo "- Setup credentials: ./manage-cloudflare-tunnel.sh setup"
    echo "- Check file permissions: chmod +x *.sh"
fi

echo ""
echo "📁 Files created:"
echo "- cloudflare-tunnel-config.yaml (tunnel configuration)"
echo "- manage-cloudflare-tunnel.sh (management script)"
echo "- cloudflare-tunnel-monitor.sh (monitoring script)"
echo "- cloudflare-credentials-template.json (credentials template)"
echo ""
echo "📖 See TUNNEL-README.md for detailed documentation"
