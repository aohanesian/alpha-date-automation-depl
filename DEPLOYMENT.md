# Deployment Guide for Alpha Date Automation

## Supported Platforms
- **Linux** (Ubuntu/CentOS) - Primary platform
- **macOS** - Development platform  
- **Windows Server 2019** - Full support with Chrome installation
- **Render** - Cloud deployment platform

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

#### System Chrome Requirement
The application now **requires** system Chrome to be installed:
- If Chrome is not found, the application will exit with an error
- No fallback mechanisms - clean, predictable behavior
- Shared Chrome instance handles all user sessions

#### Manual Debugging
To debug Chrome installation issues:

1. Check the build logs for:
   ```
   [STARTUP] ✅ Shared Chrome instance initialized successfully
   [SHARED CHROME] ✅ Found working Chrome at: [path]
   ```

2. If Chrome installation fails, the application will exit with an error - Chrome is required

### Local Development vs Production

- **Local**: Uses non-headless browser for manual captcha solving
- **Production**: Uses headless browser with shared Chrome instance for all users

### Monitoring

Monitor the application logs for:
- `[STARTUP] ✅ Shared Chrome instance initialized successfully` - Chrome is working
- `[SHARED CHROME] Created page for user: [email]` - User session created
- `[SHARED CHROME] Authentication successful for user: [email]` - User authenticated
- `[SHARED CHROME] Closing inactive session for user: [userId]` - Session cleanup

### Performance Notes

- First deployment may take longer due to Chrome installation
- Subsequent deployments are faster
- Shared Chrome instance provides better performance and resource usage
- All user sessions share the same Chrome instance for efficiency

## Windows Server 2019 Deployment

For detailed Windows Server 2019 deployment instructions, see [WINDOWS-DEPLOYMENT.md](WINDOWS-DEPLOYMENT.md).

### Quick Windows Setup
```cmd
# Clone and build
git clone <repository-url>
cd alpha-date-automation-depl
npm run build:windows
npm start
```

### Windows-Specific Features
- Automated Chrome installation via PowerShell
- Windows-compatible build scripts (`build-windows.bat`)
- Platform-specific Chrome path detection
- Windows Server 2019 optimizations

### Chrome Installation on Windows
The application automatically installs Chrome on Windows Server 2019:
- Downloads Chrome installer
- Installs silently in the background
- Configures shared Chrome manager to use the installed Chrome
- **Requires** Chrome to be installed - no fallback mechanisms

## Architecture Changes

For detailed information about the recent architecture refactor, see [ARCHITECTURE-REFACTOR.md](ARCHITECTURE-REFACTOR.md).

**Key Changes:**
- **Shared Chrome Instance**: Single Chrome instance for all users
- **System Chrome Only**: No Puppeteer or API fallbacks
- **Improved Performance**: Better resource usage and session management
- **Simplified Architecture**: Cleaner codebase with predictable behavior

