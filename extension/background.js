
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Alpha Date Token Extractor installed');
    } else if (details.reason === 'update') {
        console.log('Alpha Date Token Extractor updated');
    }
});

chrome.action.onClicked.addListener((tab) => {
    console.log('');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === 'getStoredToken') {
        chrome.storage.local.get(['alphaDateToken'], (result) => {
            sendResponse({ token: result.alphaDateToken });
        });
        return true; 
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