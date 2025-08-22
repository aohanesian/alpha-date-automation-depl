# Deployment Guide for Alpha Date Automation

## Render Deployment

### Prerequisites
- Render account
- GitHub repository with the code

### Configuration

The `render.yaml` file is configured to:
1. Install Node.js dependencies
2. Install Chrome browser for Puppeteer
3. Set proper environment variables
4. Build the application

### Environment Variables

The following environment variables are automatically set:
- `NODE_ENV=production`
- `PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer`
- `PUPPETEER_EXECUTABLE_PATH=/opt/render/.cache/puppeteer/chrome-linux/chrome`

### Troubleshooting

#### Chrome Not Found Error
If you see "Could not find Chrome" errors:

1. **Check the build logs** in Render dashboard
2. **Verify Chrome installation** - the build command should show Chrome installation path
3. **Check environment variables** - ensure PUPPETEER_EXECUTABLE_PATH is set correctly

#### Fallback Mechanism
The application has a fallback mechanism:
- If Puppeteer fails to launch, it automatically falls back to API authentication
- This ensures the application works even if Chrome installation fails

#### Manual Debugging
To debug Chrome installation issues:

1. Check the build logs for:
   ```
   Chrome installed at: [path]
   Puppeteer version: [version]
   Chrome paths: [path]
   ```

2. If Chrome installation fails, the application will still work using API authentication

### Local Development vs Production

- **Local**: Uses non-headless browser for manual captcha solving
- **Production**: Uses headless browser with fallback to API authentication

### Monitoring

Monitor the application logs for:
- `[INFO] Puppeteer test launch successful` - Puppeteer is working
- `[INFO] Skipping Puppeteer authentication, using API method directly` - Fallback activated
- `[ERROR] Puppeteer authentication error` - Puppeteer failed, but fallback should work

### Performance Notes

- First deployment may take longer due to Chrome installation
- Subsequent deployments are faster
- API fallback ensures the application remains functional even if Puppeteer fails
