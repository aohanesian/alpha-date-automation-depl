# Tunnel Options for Alpha Date Automation

This project supports multiple tunneling solutions to expose your local server to the internet.

## 🚀 Quick Start

### Option 1: Bore CLI (Recommended)
```bash
# Install
brew install bore-cli

# Start tunnel
./bore-tunnel.sh
# or
bore local 3000 --to bore.pub
```

**Why Bore CLI?**
- ✅ **No HTTPS request limits**
- ✅ **Free and open source**
- ✅ **Simple setup**
- ✅ **Reliable tunneling**
- ✅ **No authentication required**

### Option 2: Cloudflare Tunnel (Persistent)
```bash
# Install
brew install cloudflared

# Setup credentials (one-time)
./manage-cloudflare-tunnel.sh setup

# Start tunnel
./cloudflare-tunnel.sh
# or use the management script
./manage-cloudflare-tunnel.sh start
```

**🌟 Why Cloudflare Tunnel?**
- ✅ **Persistent tunnel** (alpha-auto)
- ✅ **Custom domain support**
- ✅ **Enterprise-grade security**
- ✅ **Advanced configuration options**
- ✅ **Built-in monitoring**
- ✅ **No request limits**

### Option 3: Ngrok (Limited)
```bash
# Install
brew install ngrok

# Authenticate (required)
ngrok config add-authtoken YOUR_TOKEN

# Start tunnel
./tunnel.sh
# or
ngrok http 3000
```

**⚠️ Ngrok Limitations:**
- 40 connections/minute on free tier
- Requires authentication
- Rate limiting

## 📋 Comparison

| Feature | Bore CLI | Cloudflare | Ngrok |
|---------|----------|------------|-------|
| **Cost** | Free | Free | Free (limited) |
| **Request Limits** | None | None | 40/min (free) |
| **Authentication** | Not required | Not required | Required |
| **Setup** | Simple | Simple | Requires token |
| **Reliability** | High | High | High |
| **Dashboard** | No | Yes | Yes |

## 🛠️ Management Scripts

### Start Tunnels
```bash
./bore-tunnel.sh          # Bore CLI
./cloudflare-tunnel.sh    # Cloudflare (simple)
./manage-cloudflare-tunnel.sh start  # Cloudflare (advanced)
./tunnel.sh              # Ngrok
./tunnel-options.sh      # Interactive menu
```

### Check Status
```bash
./manage-bore-tunnel.sh   # Bore CLI status
./manage-cloudflare-tunnel.sh status  # Cloudflare status
./manage-tunnel.sh        # Ngrok status
```

### Stop Tunnels
```bash
pkill -f 'bore local'     # Stop Bore CLI
./manage-cloudflare-tunnel.sh stop  # Stop Cloudflare (recommended)
pkill cloudflared        # Stop Cloudflare (force)
pkill ngrok              # Stop Ngrok
```

## 🔧 Usage Workflow

1. **Start your server:**
   ```bash
   ./start-local-server.sh
   ```

2. **Start a tunnel:**
   ```bash
   ./bore-tunnel.sh  # Recommended
   ```

3. **Copy the tunnel URL** (e.g., `https://abc123.bore.pub`)

4. **Update Render environment:**
   - Set `VITE_API_URL` to your tunnel URL
   - Redeploy frontend

## 🚨 Troubleshooting

### Bore CLI Issues
```bash
# Check if bore is installed
bore --version

# Reinstall if needed
brew install bore-cli

# Check if port 3000 is available
lsof -i :3000
```

### General Issues
- **Port 3000 in use:** Stop other services using port 3000
- **Firewall blocking:** Check macOS firewall settings
- **Server not running:** Ensure `./start-local-server.sh` is running

## 📝 Notes

- **Bore CLI** is the recommended solution for this project
- **No authentication** required for Bore CLI or Cloudflare
- **Update your Render environment variables** when tunnel URL changes
- **Keep tunnel URLs private** for security

## 🌐 Cloudflare Tunnel (alpha-auto) - Detailed Setup

### Current Tunnel Configuration
- **Tunnel Name**: alpha-auto
- **Tunnel ID**: b40b4382-13e7-48c0-987a-ee7b8e9905f3
- **Connector ID**: 4defea4b-c04d-47ef-934e-d82265f9e922
- **Status**: HEALTHY

### First-Time Setup
1. **Install cloudflared**:
   ```bash
   ./manage-cloudflare-tunnel.sh install
   ```

2. **Setup credentials**:
   ```bash
   ./manage-cloudflare-tunnel.sh setup
   ```

3. **Start tunnel**:
   ```bash
   ./manage-cloudflare-tunnel.sh start
   ```

### Management Commands
```bash
# Basic operations
./manage-cloudflare-tunnel.sh start      # Start tunnel
./manage-cloudflare-tunnel.sh stop       # Stop tunnel
./manage-cloudflare-tunnel.sh restart    # Restart tunnel
./manage-cloudflare-tunnel.sh status     # Show status

# Advanced operations
./manage-cloudflare-tunnel.sh logs       # Show logs
./manage-cloudflare-tunnel.sh config     # Show configuration
./manage-cloudflare-tunnel.sh test       # Test connectivity
./manage-cloudflare-tunnel.sh routes     # Show routes

# Monitoring
./cloudflare-tunnel-monitor.sh daemon    # Start monitor daemon
./cloudflare-tunnel-monitor.sh status    # Check monitor status
./cloudflare-tunnel-monitor.sh stop      # Stop monitor
```

### Configuration Files
- **Main Config**: `cloudflare-tunnel-config.yaml`
- **Credentials**: `~/.cloudflared/b40b4382-13e7-48c0-987a-ee7b8e9905f3.json`
- **Template**: `cloudflare-credentials-template.json`

### Monitoring Features
The tunnel includes built-in monitoring that:
- ✅ Automatically checks tunnel health every 30 seconds
- ✅ Restarts tunnel if failures detected
- ✅ Monitors local server connectivity
- ✅ Logs all activities
- ✅ Can run as background daemon

### Troubleshooting
```bash
# Check tunnel status
./manage-cloudflare-tunnel.sh status

# View logs
./manage-cloudflare-tunnel.sh logs

# Test connectivity
./manage-cloudflare-tunnel.sh test

# Reset tunnel
./manage-cloudflare-tunnel.sh stop
./manage-cloudflare-tunnel.sh start
```

## 🔗 Resources

- [Bore CLI Documentation](https://github.com/ekzhang/bore)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Ngrok Documentation](https://ngrok.com/docs)
