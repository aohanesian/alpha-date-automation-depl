document.addEventListener('DOMContentLoaded', function() {
  const statusDiv = document.getElementById('status');
  const extractBtn = document.getElementById('extractBtn');
  const tokenSection = document.getElementById('tokenSection');
  const tokenPreview = document.getElementById('tokenPreview');
  const copyBtn = document.getElementById('copyBtn');
  const domainBtns = document.querySelectorAll('.domain-btn');
  
  let currentToken = null;
  
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
          return token;
        }
      });
      
      const token = results[0].result;
      
      if (!token) {
        updateStatus('No token found in localStorage. Please log in to Alpha.Date first.', 'error');
        return;
      }
      
      currentToken = token;
      tokenPreview.textContent = token.substring(0, 50) + '...';
      tokenSection.style.display = 'block';
      updateStatus('✅ Token extracted successfully!', 'success');
      
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
      updateStatus('On automation domain - ready to create session', 'info');
    } else {
      updateStatus('Navigate to Alpha.Date to extract token', 'info');
    }
  });
});
