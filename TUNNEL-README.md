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

### Option 2: Cloudflare Tunnel
```bash
# Install
brew install cloudflared

# Start tunnel
./cloudflare-tunnel.sh
# or
cloudflared tunnel --url http://localhost:3000
```

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
./cloudflare-tunnel.sh    # Cloudflare
./tunnel.sh              # Ngrok
./tunnel-options.sh      # Interactive menu
```

### Check Status
```bash
./manage-bore-tunnel.sh   # Bore CLI status
./manage-tunnel.sh        # Ngrok status
```

### Stop Tunnels
```bash
pkill -f 'bore local'     # Stop Bore CLI
pkill cloudflared        # Stop Cloudflare
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

## 🔗 Resources

- [Bore CLI Documentation](https://github.com/ekzhang/bore)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Ngrok Documentation](https://ngrok.com/docs)
