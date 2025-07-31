// popup.js - Main extension popup logic
document.addEventListener('DOMContentLoaded', async () => {
    const currentUrl = await getCurrentTabUrl();
    const domain = getDomainFromUrl(currentUrl);
    
    console.log('Current URL:', currentUrl);
    console.log('Domain:', domain);
    
    // Show appropriate interface based on domain
    if (domain === 'alpha.date') {
        showAlphaDateInterface();
    } else if (isAutomationDomain(domain)) {
        showAutomationInterface();
    } else {
        showErrorInterface();
    }
});

// Get current tab URL
async function getCurrentTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab.url;
}

// Extract domain from URL
function getDomainFromUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (error) {
        console.error('Error parsing URL:', error);
        return '';
    }
}

// Check if domain is automation tool
function isAutomationDomain(domain) {
    return domain === 'alpha-date-automation-depl.onrender.com' || 
           domain === 'www.alpha-bot.date' ||
           domain === 'alpha-bot.date' ||
           domain === 'localhost';
}

// Show Alpha.Date interface
function showAlphaDateInterface() {
    hideAllInterfaces();
    document.getElementById('alpha-date-interface').classList.remove('hidden');
    
    // Add event listeners
    document.getElementById('extract-token-btn').addEventListener('click', extractTokenFromAlphaDate);
}

// Show automation tool interface
function showAutomationInterface() {
    hideAllInterfaces();
    document.getElementById('automation-interface').classList.remove('hidden');
    
    // Add event listeners
    document.getElementById('login-extension-btn').addEventListener('click', loginWithExtension);
    document.getElementById('test-connectivity-btn').addEventListener('click', testServerConnectivity);
}

// Show error interface
function showErrorInterface() {
    hideAllInterfaces();
    document.getElementById('error-interface').classList.remove('hidden');
}

// Hide all interfaces
function hideAllInterfaces() {
    const interfaces = [
        'alpha-date-interface',
        'automation-interface',
        'loading-interface',
        'error-interface'
    ];
    
    interfaces.forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
}

// Extract token from Alpha.Date
async function extractTokenFromAlphaDate() {
            const button = document.getElementById('extract-token-btn');
        button.disabled = true;
        button.textContent = '🔄 Getting credentials...';
    
    try {
        // Execute content script to extract token
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: extractTokenFromPage
        });
        
        const token = result[0].result;
        
        if (token) {
            // Store token in extension storage
            await chrome.storage.local.set({ 'alphaDateToken': token });
            
            // Show success
            document.getElementById('token-result').classList.remove('hidden');
            document.getElementById('extract-token-btn').classList.add('hidden');
        } else {
            throw new Error('No token found');
        }
        
    } catch (error) {
        console.error('Error extracting token:', error);
        showError('Failed to get credentials. Make sure you are logged into Alpha.Date.');
    } finally {
        button.disabled = false;
        button.textContent = '🔑 Get Credentials';
    }
}

// Content script function to extract token
function extractTokenFromPage() {
    // Try multiple methods to find the JWT token
    
    // Method 1: Check localStorage
    const localStorageKeys = Object.keys(localStorage);
    for (const key of localStorageKeys) {
        const value = localStorage.getItem(key);
        if (value && value.includes('eyJ') && value.split('.').length === 3) {
            return value;
        }
    }
    
    // Method 2: Check sessionStorage
    const sessionStorageKeys = Object.keys(sessionStorage);
    for (const key of sessionStorageKeys) {
        const value = sessionStorage.getItem(key);
        if (value && value.includes('eyJ') && value.split('.').length === 3) {
            return value;
        }
    }
    
    // Method 3: Look for token in script tags
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
        const content = script.textContent || script.innerHTML;
        const tokenMatch = content.match(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/);
        if (tokenMatch) {
            return tokenMatch[0];
        }
    }
    
    // Method 4: Look for token in meta tags
    const metaTags = document.querySelectorAll('meta[name*="token"], meta[property*="token"]');
    for (const meta of metaTags) {
        const content = meta.getAttribute('content');
        if (content && content.includes('eyJ') && content.split('.').length === 3) {
            return content;
        }
    }
    
    return null;
}

// Login with extension on automation tool
async function loginWithExtension() {
    const button = document.getElementById('login-extension-btn');
    button.disabled = true;
    button.textContent = '🔄 Logging in...';
    
    try {
        // Get stored token
        const { alphaDateToken } = await chrome.storage.local.get(['alphaDateToken']);
        
        if (!alphaDateToken) {
            throw new Error('No credentials found. Please get credentials from Alpha.Date first.');
        }
        
        // Execute content script to login with extension
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: loginWithExtensionOnPage,
            args: [alphaDateToken]
        });
        
        if (result[0].result) {
            document.getElementById('login-result').classList.remove('hidden');
            button.textContent = '✅ Login successful!';
            
            // Refresh the page after a longer delay to ensure session is established
            setTimeout(() => {
                console.log('[EXTENSION] Refreshing page after extension login');
                chrome.tabs.reload(tab.id);
            }, 3000);
        } else {
            throw new Error('Failed to login with extension');
        }
        
    } catch (error) {
        console.error('Error logging in with extension:', error);
        showError(error.message);
    } finally {
        button.disabled = false;
        button.textContent = '🔐 Login with Extension';
    }
}

// Content script function to login with extension
function loginWithExtensionOnPage(token) {
    try {
        console.log('[EXTENSION] Attempting to login with extension');
        console.log('[EXTENSION] Token length:', token ? token.length : 0);
        
        // Call the new extension login endpoint
        const apiUrl = `${window.location.origin}/api/auth/login-extension`;
        console.log('[EXTENSION] API URL:', apiUrl);
        
        return fetch(apiUrl, {
            method: 'POST',
            credentials: 'include', // Include cookies for session
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                jwtToken: token
            })
        })
        .then(response => {
            console.log('[EXTENSION] Login response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('[EXTENSION] Login response data:', data);
            if (data.success) {
                console.log('[EXTENSION] Extension login successful');
                return true;
            } else {
                console.error('[EXTENSION] Extension login failed:', data.message);
                return false;
            }
        })
        .catch(error => {
            console.error('[EXTENSION] Extension login error:', error);
            return false;
        });
    } catch (error) {
        console.error('[EXTENSION] Error logging in with extension:', error);
        return false;
    }
}

// Test server connectivity
async function testServerConnectivity() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                return fetch('/api/auth/extension-test', {
                    method: 'GET',
                    credentials: 'include'
                })
                .then(response => response.json())
                .then(data => {
                    console.log('[CONTENT] Extension test response:', data);
                    return data;
                })
                .catch(error => {
                    console.error('[CONTENT] Extension test error:', error);
                    return { error: error.message };
                });
            }
        });
        
        console.log('[EXTENSION] Test result:', result[0].result);
        return result[0].result;
    } catch (error) {
        console.error('[EXTENSION] Test error:', error);
        return { error: error.message };
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'status error';
    errorDiv.textContent = message;
    
    // Remove any existing error messages
    const existingErrors = document.querySelectorAll('.status.error');
    existingErrors.forEach(error => error.remove());
    
    // Add new error message
    document.body.insertBefore(errorDiv, document.body.firstChild);
    
    // Remove error after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
} 