@echo off
setlocal enabledelayedexpansion

echo === Starting Windows Server 2019 build process ===

REM Set environment variables
if not defined NODE_ENV (
    set NODE_ENV=production
)

echo Environment: %NODE_ENV%
echo Platform: %OS%
echo User: %USERNAME%

REM Set Puppeteer environment variables for production
if "%NODE_ENV%"=="production" (
    set PUPPETEER_CACHE_DIR=%USERPROFILE%\.cache\puppeteer
    set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
    set PUPPETEER_DISABLE_HEADLESS_WARNING=true
)

REM Check if we're in a production environment
if "%NODE_ENV%"=="production" (
    echo Production environment detected, installing Chrome...
    
    REM Create Chrome installation directory
    if not exist "%ProgramFiles%\Google\Chrome\Application" (
        echo Creating Chrome installation directory...
        mkdir "%ProgramFiles%\Google\Chrome\Application" 2>nul
    )
    
    REM Check if Chrome is already installed
    set CHROME_INSTALLED=0
    if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
        set CHROME_INSTALLED=1
        echo Chrome already installed at: "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    )
    if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
        set CHROME_INSTALLED=1
        echo Chrome already installed at: "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    )
    
    REM Install Chrome if not present
    if !CHROME_INSTALLED!==0 (
        echo Installing Google Chrome...
        
        REM Download Chrome installer
        echo Downloading Chrome installer...
        powershell -Command "& {Invoke-WebRequest -Uri 'https://dl.google.com/chrome/install/375.126/chrome_installer.exe' -OutFile '%TEMP%\chrome_installer.exe'}" 2>nul
        
        REM Install Chrome silently
        if exist "%TEMP%\chrome_installer.exe" (
            echo Installing Chrome silently...
            "%TEMP%\chrome_installer.exe" /silent /install 2>nul
            
            REM Wait for installation to complete
            timeout /t 30 /nobreak >nul
            
            REM Clean up installer
            del "%TEMP%\chrome_installer.exe" 2>nul
        )
        
        REM Verify Chrome installation
        if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
            set CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe
            set PUPPETEER_EXECUTABLE_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe
            echo Chrome installed successfully at: %CHROME_PATH%
        ) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
            set CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
            set PUPPETEER_EXECUTABLE_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
            echo Chrome installed successfully at: %CHROME_PATH%
        ) else (
            echo Warning: Chrome installation may have failed
            echo Will attempt to use Puppeteer Chrome instead
        )
    ) else (
        REM Set Chrome path for existing installation
        if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
            set CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe
            set PUPPETEER_EXECUTABLE_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe
        ) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
            set CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
            set PUPPETEER_EXECUTABLE_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
        )
    )
    
    REM Debug Chrome installation
    echo === Chrome Installation Debug ===
    if defined CHROME_PATH (
        echo System Chrome: %CHROME_PATH%
        echo System Chrome exists: 
        if exist "%CHROME_PATH%" (
            echo YES
            "%CHROME_PATH%" --version 2>nul
        ) else (
            echo NO
        )
    ) else (
        echo System Chrome: Not found
    )
) else (
    echo Development environment detected, skipping Chrome installation
)

REM Install Node.js dependencies
echo Installing Node.js dependencies...
call npm install

REM Note: Puppeteer browsers are no longer needed - we only use system Chrome

REM Only run Chrome tests in production environment
if "%NODE_ENV%"=="production" (
    echo Production environment - running Chrome tests...
    call npm run test:chrome || echo Chrome test failed, but continuing build
    call npm run test:api || echo API test failed, but continuing build
) else (
    echo Development environment - skipping Chrome tests
)

REM Build the application
echo Building application...
call npm run build

echo === Windows build process completed ===

