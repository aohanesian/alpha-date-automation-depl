// content.js - Content script for automation tool pages
console.log('Alpha Date Token Extractor: Content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'loginWithExtension') {
        loginWithExtension(request.token).then(success => {
            sendResponse({ success });
        });
        return true; // Keep message channel open for async response
    }
});

// Function to login with extension
async function loginWithExtension(token) {
    try {
        console.log('Attempting to login with extension');
        
        // Call the extension login endpoint
        const response = await fetch('/api/auth/login-extension', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                jwtToken: token
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('Extension login successful');
            return true;
        } else {
            console.error('Extension login failed:', data.message);
            return false;
        }
        
    } catch (error) {
        console.error('Error logging in with extension:', error);
        return false;
    }
}

// Login function that can be called from popup
async function loginWithExtensionOnPage(token) {
    return await loginWithExtension(token);
} 