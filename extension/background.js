// background.js - Background service worker
console.log('Alpha Date Token Extractor: Background script loaded');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Alpha Date Token Extractor installed');
    } else if (details.reason === 'update') {
        console.log('Alpha Date Token Extractor updated');
    }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // This will open the popup automatically due to manifest configuration
    console.log('Extension icon clicked on tab:', tab.url);
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    if (request.action === 'getStoredToken') {
        chrome.storage.local.get(['alphaDateToken'], (result) => {
            sendResponse({ token: result.alphaDateToken });
        });
        return true; // Keep message channel open for async response
    }
    
    if (request.action === 'storeToken') {
        chrome.storage.local.set({ 'alphaDateToken': request.token }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    if (request.action === 'clearToken') {
        chrome.storage.local.remove(['alphaDateToken'], () => {
            sendResponse({ success: true });
        });
        return true;
    }
}); 