# PowerShell script to install Chrome on Windows Server 2019
# Run with: powershell -ExecutionPolicy Bypass -File install-chrome-windows.ps1

Write-Host "=== Installing Google Chrome on Windows Server 2019 ===" -ForegroundColor Green

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "Warning: Not running as administrator. Chrome installation may fail." -ForegroundColor Yellow
}

# Check if Chrome is already installed
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

$chromeInstalled = $false
$chromePath = ""

foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromeInstalled = $true
        $chromePath = $path
        Write-Host "Chrome already installed at: $path" -ForegroundColor Green
        break
    }
}

if (-not $chromeInstalled) {
    Write-Host "Chrome not found. Installing..." -ForegroundColor Yellow
    
    # Create temp directory
    $tempDir = $env:TEMP
    $installerPath = Join-Path $tempDir "chrome_installer.exe"
    
    try {
        # Download Chrome installer
        Write-Host "Downloading Chrome installer..." -ForegroundColor Yellow
        $chromeUrl = "https://dl.google.com/chrome/install/375.126/chrome_installer.exe"
        Invoke-WebRequest -Uri $chromeUrl -OutFile $installerPath -UseBasicParsing
        
        if (Test-Path $installerPath) {
            Write-Host "Installing Chrome silently..." -ForegroundColor Yellow
            
            # Install Chrome with silent parameters
            $process = Start-Process -FilePath $installerPath -ArgumentList "/silent", "/install" -Wait -PassThru
            
            if ($process.ExitCode -eq 0) {
                Write-Host "Chrome installed successfully!" -ForegroundColor Green
            } else {
                Write-Host "Chrome installation failed with exit code: $($process.ExitCode)" -ForegroundColor Red
            }
            
            # Clean up installer
            Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        } else {
            Write-Host "Failed to download Chrome installer" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "Error during Chrome installation: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Verify installation
Write-Host "`n=== Verifying Chrome Installation ===" -ForegroundColor Green

foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        try {
            $version = & $path --version 2>$null
            Write-Host "Chrome found at: $path" -ForegroundColor Green
            Write-Host "Version: $version" -ForegroundColor Green
            
            # Set environment variable for Puppeteer
            $env:PUPPETEER_EXECUTABLE_PATH = $path
            Write-Host "Set PUPPETEER_EXECUTABLE_PATH to: $path" -ForegroundColor Green
            break
        }
        catch {
            Write-Host "Chrome found at $path but failed to get version" -ForegroundColor Yellow
        }
    }
}

# Test Puppeteer
Write-Host "`n=== Testing Puppeteer ===" -ForegroundColor Green

try {
    $nodeScript = @"
const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
        });
        console.log('Puppeteer test successful!');
        await browser.close();
    } catch (error) {
        console.error('Puppeteer test failed:', error.message);
    }
})();
"@
    
    $nodeScript | node
    Write-Host "Puppeteer test completed" -ForegroundColor Green
}
catch {
    Write-Host "Failed to run Puppeteer test: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Chrome Installation Complete ===" -ForegroundColor Green

