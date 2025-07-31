chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'loginWithExtension') {
        loginWithExtension(request.token).then(success => {
            sendResponse({ success });
        });
        return true;
    }
});

async function loginWithExtension(token) {
    try {
        console.log('[CONTENT] Attempting to login with extension');
        console.log('[CONTENT] Current URL:', window.location.href);
        console.log('[CONTENT] Token length:', token ? token.length : 0);
        
        // Use the current page's origin for the API call
        const apiUrl = `${window.location.origin}/api/auth/login-extension`;
        console.log('[CONTENT] API URL:', apiUrl);
        
        console.log('[CONTENT] Making fetch request...');
        const response = await fetch(apiUrl, {
            method: 'POST',
            credentials: 'include', // Include cookies for session
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                jwtToken: token
            })
        });
        
        console.log('[CONTENT] Fetch request completed');
        console.log('[CONTENT] Response status:', response.status);
        console.log('[CONTENT] Response headers:', response.headers);

        console.log('[CONTENT] Login response status:', response.status);
        const data = await response.json();
        console.log('[CONTENT] Login response data:', data);

        if (data.success) {
            console.log('[CONTENT] Extension login successful');
            return true;
        } else {
            console.error('[CONTENT] Extension login failed:', data.message);
            return false;
        }

    } catch (error) {
        console.error('Error logging in with extension:', error);
        return false;
    }
}

async function loginWithExtensionOnPage(token) {
    return await loginWithExtension(token);
} 