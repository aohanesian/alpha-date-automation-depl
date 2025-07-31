# Alpha Date Token Extractor - Chrome Extension

A Chrome extension that makes it easy to extract JWT tokens from Alpha.Date and auto-fill them into the automation tool.

## 🚀 Features

- **Token Extraction**: Automatically extract JWT tokens from Alpha.Date
- **Auto-Fill**: Automatically fill tokens into the automation tool
- **Cross-Domain Support**: Works on Alpha.Date and automation tool domains
- **Secure Storage**: Tokens are stored locally in the extension

## 📦 Installation

### Method 1: Load Unpacked Extension (Development)

1. **Download the extension files** to your computer
2. **Open Chrome** and go to `chrome://extensions/`
3. **Enable "Developer mode"** (toggle in top right)
4. **Click "Load unpacked"** and select the `extension` folder
5. **The extension is now installed!**

### Method 2: Install from Chrome Web Store (Coming Soon)

1. **Search for "Alpha Date Token Extractor"** in Chrome Web Store
2. **Click "Add to Chrome"**
3. **Confirm installation**

## 🎯 How to Use

### Step 1: Extract Token from Alpha.Date

1. **Go to Alpha.Date** and log in to your account
2. **Click the extension icon** in your Chrome toolbar
3. **Click "🔍 Extract JWT Token"**
4. **The token will be extracted and stored** in the extension

### Step 2: Auto-Fill on Automation Tool

1. **Go to the automation tool** (alpha-date-automation-depl.onrender.com)
2. **Click the extension icon** in your Chrome toolbar
3. **Click "🚀 Auto-Fill Token"**
4. **The token will be automatically filled** into the JWT login form

## 🔧 Supported Domains

- **Alpha.Date**: `https://alpha.date/*`
- **Automation Tool**: `https://alpha-date-automation-depl.onrender.com/*`
- **Alternative Domain**: `https://www.alpha-bot.date/*`
- **Local Development**: `http://localhost:5173/*`

## 🛡️ Security

- **Local Storage**: Tokens are stored only in your browser
- **No External Servers**: No data is sent to external servers
- **Automatic Cleanup**: Tokens are cleared when you close the browser
- **Manual Control**: You can clear tokens anytime from the extension

## 🔍 Troubleshooting

### "No token found" error:
- Make sure you're logged into Alpha.Date
- Try refreshing the Alpha.Date page
- Check if you're on the correct domain

### "Auto-fill failed" error:
- Make sure you're on the automation tool page
- Check if the JWT login form is visible
- Try refreshing the page

### Extension not working:
- Check if the extension is enabled in `chrome://extensions/`
- Try reloading the extension
- Check the browser console for errors

## 📁 File Structure

```
extension/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup interface
├── popup.js              # Popup logic
├── content.js            # Content script for automation tool
├── background.js         # Background service worker
├── icons/                # Extension icons
└── README.md            # This file
```

## 🔄 Updates

To update the extension:
1. **Download the latest files**
2. **Go to `chrome://extensions/`**
3. **Click the refresh icon** on the extension
4. **The extension will be updated**

## 🐛 Bug Reports

If you encounter any issues:
1. **Check the browser console** for error messages
2. **Try reloading the extension**
3. **Report the issue** with details about your browser and the error

## 📝 License

This extension is provided as-is for use with the Alpha Date automation tool. 