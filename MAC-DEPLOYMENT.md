# Mac-Based Deployment Guide

This guide explains how to deploy the Alpha Date Automation with your Mac as the server and Render hosting the frontend.

## Architecture

- **Frontend**: Deployed on Render (static files)
- **Backend**: Running on your Mac (with ngrok tunnel)
- **Cost**: Much cheaper than ZenRows!

## Setup Instructions

### 1. Install ngrok on your Mac

```bash
# Install ngrok
brew install ngrok

# Or download from https://ngrok.com/
# Sign up for a free account to get your authtoken
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### 2. Start the local server

```bash
# Start the server on your Mac
./start-local-server.sh
```

The server will be available at `http://localhost:3000`

### 3. Create ngrok tunnel

```bash
# In a new terminal window
./tunnel.sh
```

This will give you a public HTTPS URL like `https://abc123.ngrok.io`

### 4. Update Render configuration

1. Go to your Render dashboard
2. Update the environment variable `VITE_API_URL` with your ngrok URL
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
- ✅ **Secure**: HTTPS tunnel via ngrok
- ✅ **Scalable**: Can upgrade to paid ngrok plan if needed

## Troubleshooting

### ngrok tunnel issues
- Make sure ngrok is authenticated
- Check if port 3000 is available
- Restart the tunnel if needed

### Server connection issues
- Verify the ngrok URL is correct in Render environment variables
- Check if your Mac's firewall is blocking connections
- Ensure the server is running on port 3000

### Performance
- ngrok free tier has limitations
- Consider paid ngrok plan for production use
- Monitor your Mac's performance

## Alternative: Cloudflare Tunnel

If ngrok doesn't work well, you can use Cloudflare Tunnel:

```bash
# Install cloudflared
brew install cloudflared

# Create tunnel
cloudflared tunnel create alpha-date-automation

# Start tunnel
cloudflared tunnel --url http://localhost:3000
```

## Security Notes

- Keep your ngrok URL private
- Monitor tunnel access logs
- Consider using ngrok's authentication features
- Regularly update your local server
