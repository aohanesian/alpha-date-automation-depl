#!/bin/bash

# Advanced Cloudflare Tunnel Management Script
# Tunnel: alpha-auto (c47ff772-4b3f-4187-8d3a-47573f4c1b66)

TUNNEL_ID="c47ff772-4b3f-4187-8d3a-47573f4c1b66"
TUNNEL_NAME="alpha-auto"
CONFIG_FILE="$(pwd)/cloudflare-tunnel-config.yaml"
CREDENTIALS_FILE="$HOME/.cloudflared/$TUNNEL_ID.json"
PID_FILE="/tmp/cloudflare-tunnel.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    echo "Cloudflare Tunnel Management Script"
    echo "Tunnel: $TUNNEL_NAME ($TUNNEL_ID)"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start      - Start the tunnel"
    echo "  stop       - Stop the tunnel"
    echo "  restart    - Restart the tunnel"
    echo "  status     - Show tunnel status"
    echo "  logs       - Show tunnel logs"
    echo "  config     - Show tunnel configuration"
    echo "  test       - Test tunnel connectivity"
    echo "  routes     - Show tunnel routes"
    echo "  install    - Install cloudflared"
    echo "  setup      - Setup credentials"
    echo "  help       - Show this help"
    echo ""
}

check_requirements() {
    # Check if cloudflared is installed
    if ! command -v cloudflared &> /dev/null; then
        print_error "cloudflared is not installed. Run: $0 install"
        return 1
    fi

    # Check if config file exists
    if [ ! -f "$CONFIG_FILE" ]; then
        print_error "Configuration file not found: $CONFIG_FILE"
        return 1
    fi

    # Check if credentials file exists
    if [ ! -f "$CREDENTIALS_FILE" ]; then
        print_error "Credentials file not found: $CREDENTIALS_FILE"
        print_warning "Run: $0 setup"
        return 1
    fi

    return 0
}

install_cloudflared() {
    print_status "Installing cloudflared..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install cloudflared
        else
            print_error "Homebrew not found. Please install Homebrew first."
            return 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb
    else
        print_error "Unsupported OS. Please install cloudflared manually."
        return 1
    fi
    
    if command -v cloudflared &> /dev/null; then
        print_success "cloudflared installed successfully"
        cloudflared version
    else
        print_error "Failed to install cloudflared"
        return 1
    fi
}

setup_credentials() {
    print_status "Setting up Cloudflare credentials..."
    print_warning "You need to authenticate with Cloudflare first."
    echo ""
    echo "Choose an option:"
    echo "1. Run cloudflared tunnel login (recommended)"
    echo "2. Manually copy credentials file"
    echo ""
    read -p "Enter choice (1 or 2): " choice
    
    case $choice in
        1)
            print_status "Running cloudflared tunnel login..."
            cloudflared tunnel login
            if [ $? -eq 0 ]; then
                print_success "Authentication completed"
                # The login command creates a cert.pem file, we need to create the specific tunnel credentials
                print_status "Creating tunnel credentials..."
                mkdir -p "$HOME/.cloudflared"
                cloudflared tunnel create "$TUNNEL_NAME" 2>/dev/null || true
            else
                print_error "Authentication failed"
                return 1
            fi
            ;;
        2)
            print_status "Manual credentials setup:"
            echo "1. Copy your tunnel credentials to: $CREDENTIALS_FILE"
            echo "2. Set proper permissions: chmod 600 $CREDENTIALS_FILE"
            echo "3. Use the template in: cloudflare-credentials-template.json"
            ;;
        *)
            print_error "Invalid choice"
            return 1
            ;;
    esac
}

start_tunnel() {
    if ! check_requirements; then
        return 1
    fi

    if is_tunnel_running; then
        print_warning "Tunnel is already running (PID: $(cat $PID_FILE))"
        return 0
    fi

    print_status "Starting Cloudflare tunnel '$TUNNEL_NAME'..."
    
    # Start tunnel in background and save PID
    nohup cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME" > /tmp/cloudflare-tunnel.log 2>&1 &
    echo $! > "$PID_FILE"
    
    sleep 3
    
    if is_tunnel_running; then
        print_success "Tunnel started successfully (PID: $(cat $PID_FILE))"
        print_status "Log file: /tmp/cloudflare-tunnel.log"
    else
        print_error "Failed to start tunnel. Check logs: /tmp/cloudflare-tunnel.log"
        return 1
    fi
}

stop_tunnel() {
    if ! is_tunnel_running; then
        print_warning "Tunnel is not running"
        return 0
    fi

    local pid=$(cat $PID_FILE)
    print_status "Stopping tunnel (PID: $pid)..."
    
    kill $pid 2>/dev/null
    
    # Wait for graceful shutdown
    for i in {1..10}; do
        if ! kill -0 $pid 2>/dev/null; then
            break
        fi
        sleep 1
    done
    
    # Force kill if still running
    if kill -0 $pid 2>/dev/null; then
        print_warning "Force killing tunnel..."
        kill -9 $pid 2>/dev/null
    fi
    
    rm -f "$PID_FILE"
    print_success "Tunnel stopped"
}

is_tunnel_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat $PID_FILE)
        if kill -0 $pid 2>/dev/null; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

show_status() {
    print_status "Cloudflare Tunnel Status"
    echo "=========================="
    echo "Tunnel Name: $TUNNEL_NAME"
    echo "Tunnel ID: $TUNNEL_ID"
    echo "Config File: $CONFIG_FILE"
    echo "Credentials: $CREDENTIALS_FILE"
    echo ""
    
    if is_tunnel_running; then
        local pid=$(cat $PID_FILE)
        print_success "Status: RUNNING (PID: $pid)"
        echo "Log file: /tmp/cloudflare-tunnel.log"
    else
        print_warning "Status: STOPPED"
    fi
    
    echo ""
    print_status "Configuration:"
    if [ -f "$CONFIG_FILE" ]; then
        echo "✅ Config file exists"
    else
        echo "❌ Config file missing"
    fi
    
    if [ -f "$CREDENTIALS_FILE" ]; then
        echo "✅ Credentials file exists"
    else
        echo "❌ Credentials file missing"
    fi
    
    if command -v cloudflared &> /dev/null; then
        echo "✅ cloudflared installed ($(cloudflared version | head -1))"
    else
        echo "❌ cloudflared not installed"
    fi
}

show_logs() {
    if [ -f "/tmp/cloudflare-tunnel.log" ]; then
        print_status "Showing tunnel logs (last 50 lines):"
        echo "======================================"
        tail -50 /tmp/cloudflare-tunnel.log
    else
        print_warning "No log file found"
    fi
}

show_config() {
    if [ -f "$CONFIG_FILE" ]; then
        print_status "Current tunnel configuration:"
        echo "============================="
        cat "$CONFIG_FILE"
    else
        print_error "Configuration file not found: $CONFIG_FILE"
    fi
}

test_tunnel() {
    print_status "Testing tunnel connectivity..."
    
    if ! check_requirements; then
        return 1
    fi
    
    # Test local server
    if curl -s http://localhost:3000 > /dev/null; then
        print_success "✅ Local server (localhost:3000) is responding"
    else
        print_error "❌ Local server (localhost:3000) is not responding"
        print_warning "Make sure your application is running on port 3000"
    fi
    
    # Test tunnel status via cloudflared
    print_status "Checking tunnel information..."
    cloudflared tunnel info "$TUNNEL_ID"
}

show_routes() {
    print_status "Tunnel routes and domains:"
    echo "=========================="
    cloudflared tunnel route dns "$TUNNEL_ID" 2>/dev/null || print_warning "Unable to fetch routes"
}

# Main script logic
case "$1" in
    "start")
        start_tunnel
        ;;
    "stop")
        stop_tunnel
        ;;
    "restart")
        stop_tunnel
        sleep 2
        start_tunnel
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "config")
        show_config
        ;;
    "test")
        test_tunnel
        ;;
    "routes")
        show_routes
        ;;
    "install")
        install_cloudflared
        ;;
    "setup")
        setup_credentials
        ;;
    "help"|"")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
