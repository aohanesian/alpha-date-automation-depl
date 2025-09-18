#!/bin/bash

# Cloudflare Tunnel Monitor Script
# Monitors tunnel health and automatically restarts if needed

TUNNEL_ID="b40b4382-13e7-48c0-987a-ee7b8e9905f3"
TUNNEL_NAME="alpha-auto"
MANAGE_SCRIPT="$(pwd)/manage-cloudflare-tunnel.sh"
LOG_FILE="/tmp/tunnel-monitor.log"
CHECK_INTERVAL=30  # seconds

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_message() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

log_status() {
    log_message "🔍 $1"
}

log_success() {
    log_message "✅ $1"
}

log_warning() {
    log_message "⚠️  $1"
}

log_error() {
    log_message "❌ $1"
}

check_tunnel_health() {
    # Check if tunnel process is running
    if ! bash "$MANAGE_SCRIPT" status | grep -q "RUNNING"; then
        return 1
    fi
    
    # Check if local server is responding
    if ! curl -s --max-time 5 http://localhost:3000 > /dev/null; then
        log_warning "Local server not responding"
        return 2
    fi
    
    return 0
}

restart_tunnel() {
    log_status "Attempting to restart tunnel..."
    
    if bash "$MANAGE_SCRIPT" restart; then
        log_success "Tunnel restarted successfully"
        return 0
    else
        log_error "Failed to restart tunnel"
        return 1
    fi
}

monitor_loop() {
    log_status "Starting tunnel monitor for $TUNNEL_NAME"
    log_status "Check interval: ${CHECK_INTERVAL}s"
    log_status "Log file: $LOG_FILE"
    
    local consecutive_failures=0
    local max_failures=3
    
    while true; do
        if check_tunnel_health; then
            if [ $consecutive_failures -gt 0 ]; then
                log_success "Tunnel health restored"
                consecutive_failures=0
            fi
            
            # Silent success - only log every 10 minutes when healthy
            local minute=$(date +%M)
            if [ $((minute % 10)) -eq 0 ] && [ $(date +%S) -lt $CHECK_INTERVAL ]; then
                log_success "Tunnel is healthy"
            fi
        else
            consecutive_failures=$((consecutive_failures + 1))
            log_error "Tunnel health check failed (attempt $consecutive_failures/$max_failures)"
            
            if [ $consecutive_failures -ge $max_failures ]; then
                log_warning "Multiple failures detected, attempting restart..."
                restart_tunnel
                consecutive_failures=0
                sleep 10  # Extra wait after restart
            fi
        fi
        
        sleep $CHECK_INTERVAL
    done
}

show_help() {
    echo "Cloudflare Tunnel Monitor"
    echo "========================"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start      - Start monitoring (runs in foreground)"
    echo "  daemon     - Start monitoring as background daemon"
    echo "  stop       - Stop monitoring daemon"
    echo "  status     - Show monitor status"
    echo "  logs       - Show monitor logs"
    echo "  help       - Show this help"
    echo ""
}

start_daemon() {
    local pid_file="/tmp/tunnel-monitor.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log_warning "Monitor daemon is already running (PID: $pid)"
            return 0
        else
            rm -f "$pid_file"
        fi
    fi
    
    log_status "Starting monitor daemon..."
    
    # Start monitor in background
    nohup bash "$0" start > /dev/null 2>&1 &
    echo $! > "$pid_file"
    
    log_success "Monitor daemon started (PID: $(cat $pid_file))"
}

stop_daemon() {
    local pid_file="/tmp/tunnel-monitor.pid"
    
    if [ ! -f "$pid_file" ]; then
        log_warning "Monitor daemon is not running"
        return 0
    fi
    
    local pid=$(cat "$pid_file")
    
    if kill -0 "$pid" 2>/dev/null; then
        log_status "Stopping monitor daemon (PID: $pid)..."
        kill "$pid"
        
        # Wait for graceful shutdown
        for i in {1..10}; do
            if ! kill -0 "$pid" 2>/dev/null; then
                break
            fi
            sleep 1
        done
        
        # Force kill if still running
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null
        fi
        
        rm -f "$pid_file"
        log_success "Monitor daemon stopped"
    else
        rm -f "$pid_file"
        log_warning "Monitor daemon was not running"
    fi
}

show_daemon_status() {
    local pid_file="/tmp/tunnel-monitor.pid"
    
    echo "Tunnel Monitor Status"
    echo "===================="
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Status: RUNNING (PID: $pid)"
            echo "Log file: $LOG_FILE"
        else
            echo "Status: STOPPED (stale PID file)"
            rm -f "$pid_file"
        fi
    else
        echo "Status: STOPPED"
    fi
    
    echo ""
    echo "Recent log entries:"
    if [ -f "$LOG_FILE" ]; then
        tail -10 "$LOG_FILE"
    else
        echo "No log file found"
    fi
}

show_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo "Monitor logs (last 50 lines):"
        echo "============================="
        tail -50 "$LOG_FILE"
    else
        echo "No log file found"
    fi
}

# Trap signals for graceful shutdown
trap 'log_status "Monitor stopped by signal"; exit 0' SIGTERM SIGINT

# Main script logic
case "$1" in
    "start")
        monitor_loop
        ;;
    "daemon")
        start_daemon
        ;;
    "stop")
        stop_daemon
        ;;
    "status")
        show_daemon_status
        ;;
    "logs")
        show_logs
        ;;
    "help"|"")
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
