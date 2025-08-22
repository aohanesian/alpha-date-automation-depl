# 🧩 Captcha Solver Service

This service provides advanced captcha solving capabilities using Puppeteer with stealth plugin to avoid bot detection. It supports multiple types of captchas including Cloudflare challenges, hCaptcha, reCAPTCHA, and generic captchas.

## 🚀 Features

- **Multiple Captcha Types**: Supports Cloudflare, hCaptcha, reCAPTCHA, and generic captchas
- **Stealth Mode**: Uses puppeteer-extra with stealth plugin to avoid bot detection
- **Manual Solving**: Opens browser window for manual captcha solving
- **Automatic Detection**: Automatically detects the type of captcha present
- **Fallback Support**: Falls back to API authentication if browser method fails
- **Screenshot Capture**: Saves debug screenshots for troubleshooting
- **RESTful API**: Complete REST API for integration

## 📦 Installation

The required dependencies are already installed:

```bash
npm install puppeteer-extra puppeteer-extra-plugin-stealth
```

## 🔧 Configuration

The service uses the following configuration options:

- **headless**: Set to `false` to show browser window for manual solving
- **timeout**: Maximum time to wait for captcha resolution (default: 5 minutes)
- **waitForManual**: Whether to wait for manual solving (default: true)

## 🌐 API Endpoints

### Main Captcha Solving
```
POST /api/captcha/solve
```

**Request Body:**
```json
{
  "url": "https://alpha.date/login",
  "email": "user@example.com",
  "password": "password123",
  "timeout": 300000,
  "headless": false,
  "waitForManual": true
}
```

**Response:**
```json
{
  "success": true,
  "type": "cloudflare",
  "message": "Cloudflare challenge resolved"
}
```

### Cloudflare-Specific
```
POST /api/captcha/cloudflare
```

### hCaptcha-Specific
```
POST /api/captcha/hcaptcha
```

### reCAPTCHA-Specific
```
POST /api/captcha/recaptcha
```

### Verify Captcha Presence
```
GET /api/captcha/verify?url=https://example.com
```

**Response:**
```json
{
  "success": true,
  "found": true,
  "type": "cloudflare",
  "message": "Cloudflare challenge detected"
}
```

### Service Status
```
GET /api/captcha/status
```

**Response:**
```json
{
  "success": true,
  "status": "ready",
  "supportedTypes": ["cloudflare", "hcaptcha", "recaptcha", "generic"],
  "features": [
    "Manual captcha solving with browser window",
    "Automatic captcha detection",
    "Stealth mode to avoid bot detection",
    "Screenshot capture for debugging",
    "Multiple captcha type support"
  ]
}
```

## 🧪 Testing

### Command Line Testing

Run the test script to verify functionality:

```bash
# Basic test (headless)
npm run test:captcha

# Manual test (opens browser window)
npm run test:captcha:manual
```

### Web Interface Testing

Access the web-based test interface:

```
http://localhost:3000/captcha-test
```

This provides a user-friendly interface to test all captcha solving features.

## 🔍 How It Works

### 1. Captcha Detection

The service automatically detects different types of captchas:

- **Cloudflare**: Looks for "Just a moment...", "cf-mitigated", etc.
- **hCaptcha**: Detects hCaptcha iframes and elements
- **reCAPTCHA**: Detects reCAPTCHA iframes and elements
- **Generic**: Looks for general captcha indicators

### 2. Stealth Configuration

Uses puppeteer-extra with stealth plugin to avoid detection:

```javascript
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());
```

### 3. Browser Configuration

Launches browser with anti-detection settings:

```javascript
const browser = await puppeteer.launch({
    headless: false, // Avoid headless mode
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
    ]
});
```

### 4. Human-like Behavior

- Random viewport dimensions
- Realistic user agent
- Human-like typing delays
- Proper headers and cookies

## 🔧 Integration with Authentication

The captcha solver is integrated into the authentication service:

```javascript
// In authService.js
async authenticateWithAlphaDate(email, password) {
    // Uses puppeteer with stealth plugin
    // Automatically handles captchas
    // Falls back to API method if needed
}
```

## 📁 File Structure

```
services/
├── authService.js          # Enhanced with puppeteer support
├── captchaService.js       # Dedicated captcha solving service
controllers/
├── captchaController.js    # API endpoints for captcha solving
test-captcha.js            # Command line test script
captcha-test.html          # Web-based test interface
```

## 🐛 Debugging

### Screenshots

The service automatically saves screenshots when challenges are detected:

```
debug-screenshots/
├── cloudflare-user@example.com-1234567890.png
├── hcaptcha-user@example.com-1234567891.png
└── ...
```

### Cloudflare Challenges

Cloudflare challenge pages are saved for analysis:

```
cloudflare-challenges/
├── cloudflare-challenge-user@example.com-2025-01-21_12-34-56.html
└── ...
```

### Logging

Comprehensive logging is provided:

```
[CAPTCHA] Attempting to solve captcha for: https://alpha.date/login
[CAPTCHA] Cloudflare challenge detected
[CAPTCHA] Please manually solve the Cloudflare challenge in the browser window...
[CAPTCHA] Cloudflare challenge resolved successfully
```

## ⚠️ Important Notes

1. **Manual Solving**: For best results, use manual solving mode (`headless: false`, `waitForManual: true`)
2. **Timeouts**: Set appropriate timeouts for manual solving (5-10 minutes recommended)
3. **Browser Windows**: The service will open browser windows for manual interaction
4. **Fallback**: Always falls back to API authentication if browser method fails
5. **Stealth**: Uses advanced stealth techniques but may still be detected by sophisticated systems

## 🚀 Usage Examples

### Basic Usage

```javascript
import captchaService from './services/captchaService.js';

const result = await captchaService.solveCaptcha('https://alpha.date/login', {
    email: 'user@example.com',
    password: 'password123',
    timeout: 300000,
    headless: false,
    waitForManual: true
});

if (result.success) {
    console.log(`Captcha solved: ${result.type}`);
} else {
    console.log(`Failed: ${result.error}`);
}
```

### API Usage

```javascript
const response = await fetch('/api/captcha/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        url: 'https://alpha.date/login',
        email: 'user@example.com',
        password: 'password123',
        timeout: 300000,
        headless: false,
        waitForManual: true
    })
});

const result = await response.json();
```

## 🔒 Security Considerations

- Credentials are handled securely
- Browser sessions are properly closed
- No sensitive data is logged
- Screenshots are saved locally only
- Timeouts prevent infinite waiting

## 📈 Performance

- **Detection Time**: ~2-5 seconds for captcha detection
- **Manual Solving**: Depends on user interaction (typically 30-120 seconds)
- **Memory Usage**: ~100-200MB per browser instance
- **Concurrent Usage**: Supports multiple simultaneous sessions

## 🆘 Troubleshooting

### Common Issues

1. **Browser won't open**: Check if Chrome/Chromium is installed
2. **Captcha not detected**: Verify URL is accessible and contains captcha
3. **Timeout errors**: Increase timeout value for manual solving
4. **Detection issues**: Try different user agents or viewport sizes

### Debug Steps

1. Check logs for detailed error messages
2. Review saved screenshots in `debug-screenshots/`
3. Examine Cloudflare challenge files in `cloudflare-challenges/`
4. Test with web interface at `/captcha-test`

## 🤝 Contributing

To improve the captcha solver:

1. Add new captcha type detection
2. Enhance stealth techniques
3. Improve error handling
4. Add new API endpoints
5. Update documentation

## 📄 License

This captcha solver is part of the Alpha Date Automation project.
