document.addEventListener('DOMContentLoaded', function() {
  const statusDiv = document.getElementById('status');
  const extractBtn = document.getElementById('extractBtn');
  const tokenSection = document.getElementById('tokenSection');
  const tokenPreview = document.getElementById('tokenPreview');
  const copyBtn = document.getElementById('copyBtn');
  const domainBtns = document.querySelectorAll('.domain-btn');
  const cfClearanceInput = document.getElementById('cfClearance');
  
  let currentToken = null;
  let currentCfClearance = null;
  
  // Update status display
  function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }
  
  // Extract token from Alpha.Date
  extractBtn.addEventListener('click', async () => {
    try {
      updateStatus('Extracting token from Alpha.Date...', 'info');
      
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('alpha.date')) {
        updateStatus('Please navigate to Alpha.Date first', 'error');
        return;
      }
      
      // Execute script to get token from localStorage
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const token = localStorage.getItem('token');
          return { token };
        }
      });
      
      const { token } = results[0].result;
      
      if (!token) {
        updateStatus('No token found in localStorage. Please log in to Alpha.Date first.', 'error');
        return;
      }
      
      currentToken = token;
      updateStatus('✅ Token extracted successfully!', 'success');
      
      // Store the token for later use
      chrome.storage.local.set({ 
        extractedToken: token
      });
      
    } catch (error) {
      console.error('Error extracting token:', error);
      updateStatus('Error extracting token: ' + error.message, 'error');
    }
  });
  
  // Copy token to clipboard
  copyBtn.addEventListener('click', async () => {
    if (!currentToken) {
      updateStatus('No token to copy', 'error');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(currentToken);
      updateStatus('✅ Token copied to clipboard!', 'success');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      updateStatus('Error copying to clipboard: ' + error.message, 'error');
    }
  });
  
  // Create session on automation domains
  domainBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!currentToken) {
        updateStatus('No token available. Extract token first.', 'error');
        return;
      }
      
      // Get cf_clearance from input field
      currentCfClearance = cfClearanceInput.value.trim();
      if (!currentCfClearance) {
        updateStatus('Please enter the cf_clearance cookie value.', 'error');
        return;
      }
      
      const domain = btn.dataset.domain;
      const domainName = btn.textContent.trim();
      
      try {
        updateStatus(`Creating session on ${domainName}...`, 'info');
        
        // Create session using the token
        const response = await fetch(`${domain}/api/auth/create-session-from-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: currentToken
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
          updateStatus(`✅ Session created on ${domainName}!`, 'success');
          
          // Open the domain in a new tab
          chrome.tabs.create({ url: domain });
        } else {
          throw new Error(result.error || 'Unknown error');
        }
        
      } catch (error) {
        console.error('Error creating session:', error);
        updateStatus(`Error creating session on ${domainName}: ${error.message}`, 'error');
      }
    });
  });
  
  // Check if we're on Alpha.Date and auto-extract
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (tab.url.includes('alpha.date')) {
      updateStatus('On Alpha.Date - ready to extract token', 'info');
    } else if (tab.url.includes('alpha-bot.date') || tab.url.includes('alpha-date-automation-depl.onrender.com') || tab.url.includes('localhost:5173')) {
      // Check if we have a stored token
      chrome.storage.local.get(['extractedToken'], function(result) {
        if (result.extractedToken) {
          currentToken = result.extractedToken;
          updateStatus('✅ Token available - ready to login', 'success');
          // Show login button instead of extract button
          extractBtn.textContent = '🔐 Login with Extension';
          extractBtn.onclick = loginWithExtension;
          // Show the token section with cookie input
          tokenSection.style.display = 'block';
          tokenPreview.textContent = result.extractedToken.substring(0, 50) + '...';
        } else {
          updateStatus('Please navigate to Alpha.Date first', 'info');
        }
      });
    } else {
      updateStatus('Navigate to Alpha.Date to extract token', 'info');
    }
  });
  
  // Function to login with extension (creates session and logs in)
  async function loginWithExtension() {
    if (!currentToken) {
      updateStatus('No token available. Extract token first.', 'error');
      return;
    }
    
    try {
      updateStatus('Creating session and logging in...', 'info');
      
      // Get current tab URL to determine the domain
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = new URL(tab.url);
      
      // Determine the correct API URL based on the current domain
      let apiUrl;
      if (currentUrl.hostname === 'localhost' && currentUrl.port === '5173') {
        // Frontend is on localhost:5173, API is on localhost:3000
        apiUrl = 'http://localhost:3000';
      } else if (currentUrl.hostname === 'localhost' && currentUrl.port === '3000') {
        // Both frontend and API on localhost:3000
        apiUrl = currentUrl.origin;
      } else {
        // Production domains - use the same origin
        apiUrl = currentUrl.origin;
      }
      
              // Get cf_clearance from input field
      currentCfClearance = cfClearanceInput.value.trim();
      if (!currentCfClearance) {
        updateStatus('Please enter the cf_clearance cookie value.', 'error');
        return;
      }
      
      // Create session using the token
        const response = await fetch(`${apiUrl}/api/auth/create-session-from-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: currentToken,
            cfClearance: currentCfClearance
          })
        });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        updateStatus('✅ Session created! Logging you in...', 'success');
        
        // Inject session data into the current page
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (sessionToken, userData) => {
            // Store the session data in localStorage
            const alphaAutoData = {
              email: userData.email,
              token: 'session-based',
              operatorId: userData.operatorId,
              sessionToken: sessionToken
            };
            localStorage.setItem('alphaAutoData', JSON.stringify(alphaAutoData));
            
            // Show a brief success message
            const successMsg = document.createElement('div');
            successMsg.style.cssText = `
              position: fixed;
              top: 20px;
              right: 20px;
              background: #4CAF50;
              color: white;
              padding: 15px 20px;
              border-radius: 8px;
              z-index: 10000;
              font-family: Arial, sans-serif;
              box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            `;
            successMsg.textContent = '✅ Logged in successfully!';
            document.body.appendChild(successMsg);
            
            // Reload the page after a brief delay
            setTimeout(() => {
              window.location.reload();
            }, 1500);
          },
          args: [result.sessionToken, result.userData]
        });
      } else {
        throw new Error(result.error || 'Unknown error');
      }
      
    } catch (error) {
      console.error('Error logging in with extension:', error);
      updateStatus(`Error logging in: ${error.message}`, 'error');
    }
  }
});
