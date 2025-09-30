# Windows Server 2019 Deployment Guide

This guide covers deploying the Alpha Date Automation application on Windows Server 2019 with Chrome support.

## Prerequisites

### System Requirements
- Windows Server 2019 or Windows 10/11
- Node.js 14.0.0 or higher
- PowerShell 5.1 or higher
- Administrator privileges (for Chrome installation)

### Software Installation
1. **Node.js**: Download and install from [nodejs.org](https://nodejs.org/)
2. **Git**: Download and install from [git-scm.com](https://git-scm.com/)

## Quick Start

### Option 1: Automated Setup
```cmd
# Clone the repository
git clone https://github.com/your-repo/alpha-date-automation-depl.git
cd alpha-date-automation-depl

# Run the Windows build script
npm run build:windows

# Start the application
npm start
```

### Option 2: Manual Setup
```cmd
# Install dependencies
npm install

# Install Chrome manually
npm run install:chrome:windows

# Build the application
npm run build

# Start the application
npm start
```

## Chrome Installation

### Automated Installation
The build script (`build-windows.bat`) automatically installs Chrome if it's not present.

### Manual Installation
```cmd
# Using npm script
npm run install:chrome:windows

# Using PowerShell script
powershell -ExecutionPolicy Bypass -File install-chrome-windows.ps1

# Using PowerShell directly
powershell -Command "Invoke-WebRequest -Uri 'https://dl.google.com/chrome/install/375.126/chrome_installer.exe' -OutFile '$env:TEMP\chrome_installer.exe'; Start-Process -FilePath '$env:TEMP\chrome_installer.exe' -ArgumentList '/silent', '/install' -Wait; Remove-Item '$env:TEMP\chrome_installer.exe' -Force"
```

### Chrome Installation Paths
The application checks for Chrome in these locations:
- `C:\Program Files\Google\Chrome\Application\chrome.exe`
- `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`

## Configuration

### Environment Variables
Set these environment variables for production:

```cmd
set NODE_ENV=production
set PUPPETEER_CACHE_DIR=%USERPROFILE%\.cache\puppeteer
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
set PUPPETEER_DISABLE_HEADLESS_WARNING=true
set PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

### Package.json Scripts
Available scripts for Windows:

```json
{
  "build:windows": "build-windows.bat",
  "install:chrome:windows": "powershell -Command \"...\"",
  "test:chrome": "node test-chrome.js",
  "test:api": "node test-api-only.js"
}
```

## Testing

### Test Chrome Installation
```cmd
npm run test:chrome
```

This will:
1. Check system Chrome installation
2. Verify Puppeteer executable path
3. Test Chrome launch
4. Navigate to a test page

### Test API Endpoints
```cmd
npm run test:api
```

### Test Chrome via HTTP
Visit: `http://localhost:5000/api/chrome-test`

## Deployment Options

### Local Development
```cmd
npm run dev
```

### Production Build
```cmd
npm run build:windows
npm start
```

### Using PM2 (Process Manager)
```cmd
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start server.js --name "alpha-date-automation"

# Save PM2 configuration
pm2 save
pm2 startup
```

## Troubleshooting

### Chrome Not Found
If you see "Could not find Chrome" errors:

1. **Check Chrome installation**:
   ```cmd
   dir "C:\Program Files\Google\Chrome\Application\chrome.exe"
   dir "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
   ```

2. **Verify environment variables**:
   ```cmd
   echo %PUPPETEER_EXECUTABLE_PATH%
   ```

3. **Reinstall Chrome**:
   ```cmd
   npm run install:chrome:windows
   ```

### Permission Issues
If Chrome installation fails:

1. **Run as Administrator**:
   - Right-click Command Prompt
   - Select "Run as administrator"

2. **Check PowerShell execution policy**:
   ```cmd
   powershell -Command "Get-ExecutionPolicy"
   powershell -Command "Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser"
   ```

### Puppeteer Issues
If Puppeteer fails to launch Chrome:

1. **Check Chrome version compatibility**:
   ```cmd
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --version
   ```

2. **Clear Puppeteer cache**:
   ```cmd
   npx puppeteer browsers install chrome --force
   ```

3. **Test with minimal options**:
   ```cmd
   node -e "const puppeteer = require('puppeteer'); puppeteer.launch({headless: true, args: ['--no-sandbox']}).then(b => {console.log('Success'); b.close();}).catch(console.error);"
   ```

## Performance Optimization

### Memory Management
- Chrome uses significant memory in headless mode
- Consider restarting the application periodically
- Monitor memory usage with Task Manager

### Startup Time
- First startup may be slower due to Chrome initialization
- Subsequent requests are faster
- Consider keeping a browser instance alive for multiple requests

## Security Considerations

### Chrome Security
- Chrome runs in headless mode with disabled security features
- This is intentional for automation purposes
- Only run in trusted environments

### Network Security
- Ensure proper firewall configuration
- Use HTTPS in production
- Validate all inputs

## Monitoring

### Logs
Monitor these log messages:
- `[CHROME] ✅ Working Chrome found` - Chrome is working
- `[CHROME] Chrome installation failed` - Installation issues
- `[STARTUP] ✅ Chrome found at` - Startup detection
- `[STARTUP] ⚠️ No Chrome found` - Fallback mode

### Health Checks
- `GET /api/health` - Basic health check
- `GET /api/chrome-test` - Chrome functionality test

## Fallback Mechanism

The application includes a fallback mechanism:
1. **Primary**: Use Puppeteer with Chrome for automation
2. **Fallback**: Use API authentication if Chrome fails
3. **Graceful degradation**: Application remains functional

This ensures the application works even if Chrome installation fails or has issues.

## Support

For issues specific to Windows deployment:
1. Check the troubleshooting section above
2. Review the application logs
3. Test Chrome installation manually
4. Verify all environment variables

## Comparison with Linux Deployment

| Feature | Windows | Linux |
|---------|---------|-------|
| Chrome Installation | Manual/Automated | Package Manager |
| Path Separators | `\` | `/` |
| Environment Variables | `%VAR%` | `$VAR` |
| Scripts | `.bat` / `.ps1` | `.sh` |
| Process Management | Task Manager/PM2 | systemd/PM2 |

Both platforms support the same functionality with platform-specific optimizations.

