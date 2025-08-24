# Mac-Based Deployment Guide

This guide explains how to deploy the Alpha Date Automation with your Mac as the server and Render hosting the frontend.

## Architecture

- **Frontend**: Deployed on Render (static files)
- **Backend**: Running on your Mac (with tunnel)
- **Cost**: Much cheaper than ZenRows!

## Tunneling Options

### Option 1: Bore CLI (Recommended)
```bash
# Install bore-cli
brew install bore-cli

# Start tunnel
./bore-tunnel.sh
# or
bore local 3000 --to bore.pub
```

**Benefits:**
- ✅ No HTTPS request limits
- ✅ Free and open source
- ✅ Simple setup
- ✅ Reliable tunneling

### Option 2: Cloudflare Tunnel
```bash
# Install cloudflared
brew install cloudflared

# Start tunnel
./cloudflare-tunnel.sh
# or
cloudflared tunnel --url http://localhost:3000
```

### Option 3: Ngrok (Limited)
```bash
# Install ngrok
brew install ngrok

# Sign up for a free account to get your authtoken
ngrok config add-authtoken YOUR_TOKEN

# Start tunnel
./tunnel.sh
# or
ngrok http 3000
```

**Note:** Ngrok free tier has 40 connections/minute limit.

## Setup Instructions

### 1. Choose and Install Your Tunnel Solution

### 2. Start the local server

```bash
# Start the server on your Mac
./start-local-server.sh
```

The server will be available at `http://localhost:3000`

### 3. Create tunnel

```bash
# In a new terminal window, choose one:

# Option 1: Bore CLI (Recommended)
./bore-tunnel.sh

# Option 2: Cloudflare Tunnel
./cloudflare-tunnel.sh

# Option 3: Ngrok
./tunnel.sh

# Or use the interactive menu:
./tunnel-options.sh
```

This will give you a public HTTPS URL like:
- Bore: `https://abc123.bore.pub`
- Cloudflare: `https://abc123.trycloudflare.com`
- Ngrok: `https://abc123.ngrok.io`

### 4. Update Render configuration

1. Go to your Render dashboard
2. Update the environment variable `VITE_API_URL` with your tunnel URL
3. Redeploy the frontend

### 5. Deploy frontend to Render

Use the `render-frontend.yaml` configuration:

```bash
# Update the VITE_API_URL in render-frontend.yaml with your ngrok URL
# Then deploy to Render
```

## Benefits

- ✅ **Cost-effective**: No expensive ZenRows subscription
- ✅ **Reliable**: Works on your local machine
- ✅ **Secure**: HTTPS tunnel via your chosen solution
- ✅ **Scalable**: Multiple tunneling options available
- ✅ **No limits**: Bore CLI has no request limits

## Troubleshooting

### Tunnel issues
- Make sure your chosen tunnel solution is installed
- Check if port 3000 is available
- Restart the tunnel if needed
- For ngrok: ensure it's authenticated
- For bore: no authentication needed

### Server connection issues
- Verify the tunnel URL is correct in Render environment variables
- Check if your Mac's firewall is blocking connections
- Ensure the server is running on port 3000

### Performance
- Bore CLI: No limits, best for high traffic
- Cloudflare: Reliable and fast
- Ngrok: Limited on free tier, consider paid plan for production
- Monitor your Mac's performance

## Quick Commands

```bash
# Start server
./start-local-server.sh

# Start tunnel (choose one)
./bore-tunnel.sh          # Recommended
./cloudflare-tunnel.sh    # Alternative
./tunnel.sh              # Ngrok
./tunnel-options.sh      # Interactive menu

# Check tunnel status
./manage-bore-tunnel.sh   # For bore
./manage-tunnel.sh        # For ngrok

# Stop tunnel
pkill -f 'bore local'     # For bore
pkill ngrok              # For ngrok
pkill cloudflared        # For cloudflare
```

## Security Notes

- Keep your ngrok URL private
- Monitor tunnel access logs
- Consider using ngrok's authentication features
- Regularly update your local server
