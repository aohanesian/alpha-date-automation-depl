// public/app.js
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loginForm = document.getElementById('login-container');
    const mainContainer = document.getElementById('main-container');
    const loginBtn = document.getElementById('login-btn');
    const loginStatus = document.getElementById('login-status');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const chatProfilesContainer = document.getElementById('chat-profiles-container');
    const mailProfilesContainer = document.getElementById('mail-profiles-container');
    const toggleAttachments = document.getElementById('toggle-attachments');

    // API URL - Replace with your actual deployed URL
    const API_URL = import.meta.env.VITE_API_URL || window.location.origin + '/api';

    // App State
    let userData = {
        email: '',
        token: '',
        operatorId: ''
    };

    // Check for stored login on page load
    checkStoredLogin();

    async function checkStoredLogin() {
        const storedData = localStorage.getItem('alphaAutoData');
        if (storedData) {
            try {
                userData = JSON.parse(storedData);
                emailInput.value = userData.email;

                // Try to validate the stored session
                loginStatus.textContent = 'Checking stored session...';
                loginStatus.className = 'status processing';

                const isValid = await validateSession();
                if (isValid) {
                    // Session is valid, switch to main interface
                    loginForm.style.display = 'none';
                    mainContainer.style.display = 'block';
                    await loadProfiles();
                    setupOnlineStatusInterval();
                    loginStatus.textContent = 'Session restored successfully!';
                    loginStatus.className = 'status success';
                } else {
                    // Session is invalid, clear stored data
                    localStorage.removeItem('alphaAutoData');
                    loginStatus.textContent = 'Session expired, please login again';
                    loginStatus.className = 'status error';
                }
            } catch (error) {
                console.error('Failed to parse stored data:', error);
                localStorage.removeItem('alphaAutoData');
            }
        }
    }

    function makeAuthenticatedRequest(url, options = {}) {
        const token = userData.token;

        if (!token) {
            throw new Error('No authentication token available');
        }

        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Auth-Token': token
            }
        };

        // Merge headers
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        };

        console.log('Making authenticated request to:', url);
        console.log('With token:', token.substring(0, 20) + '...');

        return fetch(url, mergedOptions);
    }

    async function validateSession() {
        try {
            const response = await makeAuthenticatedRequest(`${API_URL}/chat/profiles`);

            if (response.status === 401) {
                console.log('Session validation failed - 401 response');
                return false;
            }

            const data = await response.json();
            console.log('Session validation response:', data);

            return response.ok;
        } catch (error) {
            console.error('Session validation failed:', error);
            return false;
        }
    }

    // Login Handler
    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            displayLoginError('Please fill in email and password');
            return;
        }

        loginBtn.disabled = true;
        loginStatus.textContent = 'Checking credentials...';
        loginStatus.className = 'status processing';

        try {
            // Step 1: Login to get user data
            const loginResponse = await fetch("https://alpha.date/api/login/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            if (!loginResponse.ok) {
                throw new Error('Login failed - invalid credentials');
            }

            const loginData = await loginResponse.json();

            // Extract user data from response
            userData = {
                email: email,
                token: loginData.token,
                operatorId: loginData.operator_id
            };

            console.log('Login successful, user data:', { email: userData.email, operatorId: userData.operatorId });

            // Step 2: Check whitelist with the obtained token
            const whitelistResponse = await fetch(`${API_URL}/auth/check-whitelist`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    email: userData.email,
                    token: userData.token
                })
            });

            const whitelistData = await whitelistResponse.json();

            if (whitelistData.success) {
                // Store user data
                localStorage.setItem('alphaAutoData', JSON.stringify(userData));

                // Set online status
                await setOnlineStatus();

                // Switch to main interface
                loginForm.style.display = 'none';
                mainContainer.style.display = 'block';

                // Load profiles data
                await loadProfiles();

                // Set up online status interval
                setupOnlineStatusInterval();

                loginStatus.textContent = 'Login successful!';
                loginStatus.className = 'status success';
            } else {
                displayLoginError('Not authorized: Email not in whitelist');
            }
        } catch (error) {
            console.error('Login error:', error);
            displayLoginError(`Error: ${error.message}`);
        } finally {
            loginBtn.disabled = false;
        }
    });

    async function setOnlineStatus() {
        try {
            const response = await fetch(`${API_URL}/auth/online-status`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    operatorId: userData.operatorId,
                    token: userData.token
                })
            });

            if (!response.ok) {
                console.warn('Failed to set online status');
            }
        } catch (error) {
            console.error('Online status error:', error);
        }
    }

    function setupOnlineStatusInterval() {
        setInterval(async () => {
            await setOnlineStatus();
        }, 105000);
    }

    function displayLoginError(message) {
        loginStatus.textContent = message;
        loginStatus.className = 'status error';
    }

    // Add logout functionality
    function addLogoutButton() {
        if (!document.getElementById('logout-btn')) {
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logout-btn';
            logoutBtn.textContent = 'Logout';
            logoutBtn.className = 'control-btn btn-clear';
            logoutBtn.style.position = 'fixed';
            logoutBtn.style.top = '10px';
            logoutBtn.style.right = '10px';
            logoutBtn.style.zIndex = '1000';

            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('alphaAutoData');
                location.reload();
            });

            document.body.appendChild(logoutBtn);
        }
    }

    // Load Profiles
    async function loadProfiles() {
        try {
            console.log('Loading profiles with token:', userData.token?.substring(0, 20) + '...');

            // Load chat profiles
            const chatResponse = await makeAuthenticatedRequest(`${API_URL}/chat/profiles`);

            if (chatResponse.status === 401) {
                console.log('Chat profiles request returned 401');
                localStorage.removeItem('alphaAutoData');
                location.reload();
                return;
            }

            const chatData = await chatResponse.json();
            console.log('Chat profiles response:', chatData);

            if (chatData.success) {
                renderChatProfiles(chatData.profiles);
            } else {
                console.error('Failed to load chat profiles:', chatData.message);
                // If it's an auth error, show debug info
                if (chatData.debug) {
                    console.log('Debug info:', chatData.debug);
                }
            }

            // Load mail profiles
            const mailResponse = await makeAuthenticatedRequest(`${API_URL}/mail/profiles`);

            if (mailResponse.status === 401) {
                console.log('Mail profiles request returned 401');
                localStorage.removeItem('alphaAutoData');
                location.reload();
                return;
            }

            const mailData = await mailResponse.json();
            console.log('Mail profiles response:', mailData);

            if (mailData.success) {
                renderMailProfiles(mailData.profiles);
            } else {
                console.error('Failed to load mail profiles:', mailData.message);
            }

            // Add logout button after successful load
            addLogoutButton();
        } catch (error) {
            console.error('Failed to load profiles:', error);
            // If network error, might be session issue
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                console.log('Network error detected, clearing stored data');
                localStorage.removeItem('alphaAutoData');
                location.reload();
            }
        }
    }


    // Render Chat Profiles
    function renderChatProfiles(profiles) {
        chatProfilesContainer.innerHTML = '';

        profiles.forEach(profile => {
            const profileBlock = document.createElement('div');
            profileBlock.className = 'profile-item';
            profileBlock.dataset.profileId = profile.external_id;
            profileBlock.dataset.profileType = 'chat';

            // Profile header
            const header = document.createElement('div');
            header.className = 'profile-header';
            header.innerHTML = `
        <img src="${profile.photo_link}" class="profile-photo" 
             alt="${profile.name}" onerror="this.src='/default-female.svg'">
        <div class="profile-info">
          <div class="profile-name">${profile.name}, ${profile.age}</div>
          <div class="profile-meta">
            <span>ID: ${profile.external_id}</span>
            <span>${profile.country_name}</span>
          </div>
        </div>
      `;

            // Textarea for message template
            const textarea = document.createElement('textarea');
            textarea.placeholder = 'Enter message template...';
            const savedMsg = localStorage.getItem(`chat_msg_${profile.external_id}`);
            if (savedMsg) {
                textarea.value = savedMsg;
            }

            // Character counter
            const charCounter = document.createElement('div');
            charCounter.className = 'char-counter';
            updateCharCounter(textarea, charCounter, 5);

            textarea.addEventListener('input', () => {
                updateCharCounter(textarea, charCounter, 5);
                localStorage.setItem(`chat_msg_${profile.external_id}`, textarea.value.trim());
            });

            // Status
            const status = document.createElement('div');
            status.className = 'status';
            status.textContent = 'Ready';

            // Controls
            const controls = document.createElement('div');
            controls.className = 'controls';

            const startBtn = document.createElement('button');
            startBtn.textContent = 'Start';
            startBtn.className = 'control-btn btn-start';
            startBtn.addEventListener('click', () => startChatProcessing(profile.external_id, textarea));

            const stopBtn = document.createElement('button');
            stopBtn.textContent = 'Stop';
            stopBtn.className = 'control-btn btn-stop';
            stopBtn.addEventListener('click', () => stopChatProcessing(profile.external_id));

            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Clear Blocks';
            clearBtn.className = 'control-btn btn-clear';
            clearBtn.addEventListener('click', () => clearChatBlocks(profile.external_id));

            controls.append(startBtn, stopBtn, clearBtn);

            // Assemble
            profileBlock.append(header, textarea, charCounter, status, controls);
            chatProfilesContainer.appendChild(profileBlock);
        });
    }

    async function startChatProcessing(profileId, textarea) {
        const messageTemplate = textarea.value.trim();
        const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="chat"]`);
        const status = profileBlock.querySelector('.status');

        if (!messageTemplate || messageTemplate.length < 5) {
            status.textContent = 'Error: Message template must be at least 5 characters';
            status.className = 'status error';
            return;
        }

        try {
            status.textContent = 'Starting...';
            status.className = 'status processing';

            const response = await makeAuthenticatedRequest(`${API_URL}/chat/start`, {
                method: 'POST',
                body: JSON.stringify({ profileId, messageTemplate })
            });

            if (response.status === 401) {
                localStorage.removeItem('alphaAutoData');
                location.reload();
                return;
            }

            const data = await response.json();

            if (data.success) {
                startStatusPolling(profileId, 'chat');
            } else {
                status.textContent = data.message || 'Failed to start processing';
                status.className = 'status error';
            }
        } catch (error) {
            status.textContent = `Error: ${error.message}`;
            status.className = 'status error';
        }
    }

    // Render Mail Profiles
    function renderMailProfiles(profiles) {
        mailProfilesContainer.innerHTML = '';

        profiles.forEach(profile => {
            const profileBlock = document.createElement('div');
            profileBlock.className = 'profile-item';
            profileBlock.dataset.profileId = profile.external_id;
            profileBlock.dataset.profileType = 'mail';

            // Profile header
            const header = document.createElement('div');
            header.className = 'profile-header';
            header.innerHTML = `
        <img src="${profile.photo_link}" class="profile-photo" 
             alt="${profile.name}" onerror="this.src='/default-female.svg'">
        <div class="profile-info">
          <div class="profile-name">${profile.name}, ${profile.age}</div>
          <div class="profile-meta">
            <span>ID: ${profile.external_id}</span>
            <span>${profile.country_name}</span>
          </div>
        </div>
      `;

            // Textarea for message template
            const textarea = document.createElement('textarea');
            textarea.placeholder = 'Write your message here (minimum 150 characters)...';
            const savedMsg = localStorage.getItem(`mail_msg_${profile.external_id}`);
            if (savedMsg) {
                textarea.value = savedMsg;
            }

            // Character counter
            const charCounter = document.createElement('div');
            charCounter.className = 'char-counter';
            updateCharCounter(textarea, charCounter, 150);

            textarea.addEventListener('input', () => {
                updateCharCounter(textarea, charCounter, 150);
                localStorage.setItem(`mail_msg_${profile.external_id}`, textarea.value.trim());
            });

            // Attachments container
            const attachmentsContainer = document.createElement('div');
            attachmentsContainer.className = 'attachments-container';
            attachmentsContainer.style.display = 'none';
            attachmentsContainer.innerHTML = '<div class="status">Loading attachments...</div>';

            // Load attachments
            loadAttachments(profile.external_id, attachmentsContainer);

            // Status
            const status = document.createElement('div');
            status.className = 'status';
            status.textContent = 'Ready';

            // Controls
            const controls = document.createElement('div');
            controls.className = 'controls';

            const startBtn = document.createElement('button');
            startBtn.textContent = 'Start';
            startBtn.className = 'control-btn btn-start';
            startBtn.addEventListener('click', () =>
                startMailProcessing(profile.external_id, textarea, attachmentsContainer));

            const stopBtn = document.createElement('button');
            stopBtn.textContent = 'Stop';
            stopBtn.className = 'control-btn btn-stop';
            stopBtn.addEventListener('click', () => stopMailProcessing(profile.external_id));

            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Clear Blocks';
            clearBtn.className = 'control-btn btn-clear';
            clearBtn.addEventListener('click', () => clearMailBlocks(profile.external_id));

            controls.append(startBtn, stopBtn, clearBtn);

            // Assemble
            profileBlock.append(header, textarea, charCounter, attachmentsContainer, status, controls);
            mailProfilesContainer.appendChild(profileBlock);
        });

        // Toggle attachments display
        if (toggleAttachments) {
            toggleAttachments.addEventListener('change', () => {
                const containers = document.querySelectorAll('.attachments-container');
                containers.forEach(container => {
                    container.style.display = toggleAttachments.checked ? 'grid' : 'none';
                });
            });
        }
    }

    // Load attachments for mail profile
    async function loadAttachments(profileId, container) {
        try {
            const response = await makeAuthenticatedRequest(`${API_URL}/mail/attachments/${profileId}`);

            if (response.status === 401) {
                container.innerHTML = '<div class="status error">Session expired</div>';
                return;
            }

            const data = await response.json();

            if (data.success) {
                renderAttachments(data.attachments, container);
            } else {
                container.innerHTML = '<div class="status error">Failed to load attachments</div>';
            }
        } catch (error) {
            console.error(`Failed to load attachments for ${profileId}:`, error);
            container.innerHTML = '<div class="status error">Error loading attachments</div>';
        }
    }

    // Render attachments
    function renderAttachments(attachments, container) {
        container.innerHTML = '';
        let hasAttachments = false;

        Object.entries(attachments).forEach(([type, items]) => {
            if (items && items.length > 0) {
                hasAttachments = true;

                items.forEach(item => {
                    if (!item) return;

                    const wrapper = document.createElement('label');
                    wrapper.className = 'attachment-item';

                    const preview = document.createElement('div');
                    preview.className = 'attachment-preview';

                    if (type === 'images' || type === 'videos') {
                        const img = document.createElement('img');
                        img.src = item.thumb_link || item.link;
                        img.alt = item.filename;
                        preview.appendChild(img);
                    } else {
                        preview.innerHTML = `
              <div class="audio-preview">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"/>
                </svg>
              </div>
            `;
                    }

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'attachment-checkbox';
                    checkbox.dataset.type = type;
                    checkbox.dataset.id = item.id;

                    const filename = document.createElement('div');
                    filename.className = 'attachment-filename';
                    filename.textContent = item.filename || 'Unnamed file';

                    wrapper.append(preview, checkbox, filename);
                    container.append(wrapper);
                });
            }
        });

        if (!hasAttachments) {
            container.innerHTML = '<div class="status">No attachments available, to add attachments create folder with name "send" for each type of media</div>';
        }
    }

    // Update character counter
    function updateCharCounter(textarea, counterElement, minChars) {
        const length = textarea.value.length;
        const isValid = length >= minChars;

        counterElement.textContent = `${length}/${minChars} characters`;
        counterElement.classList.toggle('invalid', !isValid);
    }

    // Chat functions
    async function stopChatProcessing(profileId) {
        try {
            const response = await fetch(`${API_URL}/chat/stop`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ profileId })
            });

            const data = await response.json();

            const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="chat"]`);
            const status = profileBlock.querySelector('.status');

            status.textContent = data.message || 'Stopping...';
        } catch (error) {
            console.error('Failed to stop processing:', error);
        }
    }

    async function clearChatBlocks(profileId) {
        try {
            const response = await fetch(`${API_URL}/chat/clear-blocks`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ profileId })
            });

            const data = await response.json();

            const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="chat"]`);
            const status = profileBlock.querySelector('.status');

            status.textContent = data.message || 'Block list cleared';
            status.className = 'status success';
        } catch (error) {
            console.error('Failed to clear blocks:', error);
        }
    }

    // Mail functions
    async function startMailProcessing(profileId, textarea, attachmentsContainer) {
        const message = textarea.value.trim();
        const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="mail"]`);
        const status = profileBlock.querySelector('.status');

        if (message.length < 150) {
            status.textContent = 'Error: Message must be at least 150 characters';
            status.className = 'status error';
            return;
        }

        // Get selected attachments
        const attachments = Array.from(attachmentsContainer.querySelectorAll('input:checked')).map(checkbox => ({
            id: checkbox.dataset.id,
            type: checkbox.dataset.type
        }));

        try {
            status.textContent = 'Starting...';
            status.className = 'status processing';

            const response = await makeAuthenticatedRequest(`${API_URL}/chat/mail`, {
                method: 'POST',
                body: JSON.stringify({ profileId, message, attachments })
            });

            if (response.status === 401) {
                localStorage.removeItem('alphaAutoData');
                location.reload();
                return;
            }

            const data = await response.json();

            if (data.success) {
                startStatusPolling(profileId, 'mail');
            } else {
                status.textContent = data.message || 'Failed to start processing';
                status.className = 'status error';
            }
        } catch (error) {
            status.textContent = `Error: ${error.message}`;
            status.className = 'status error';
        }
    }

    async function stopMailProcessing(profileId) {
        try {
            const response = await fetch(`${API_URL}/mail/stop`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ profileId })
            });

            const data = await response.json();

            const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="mail"]`);
            const status = profileBlock.querySelector('.status');

            status.textContent = data.message || 'Stopping...';
        } catch (error) {
            console.error('Failed to stop processing:', error);
        }
    }

    async function clearMailBlocks(profileId) {
        try {
            const response = await fetch(`${API_URL}/mail/clear-blocks`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ profileId })
            });

            const data = await response.json();

            const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="mail"]`);
            const status = profileBlock.querySelector('.status');

            status.textContent = data.message || 'Block list cleared';
            status.className = 'status success';
        } catch (error) {
            console.error('Failed to clear blocks:', error);
        }
    }

    // Status polling
    function startStatusPolling(profileId, type) {
        const endpoint = type === 'chat' ? 'chat/status' : 'mail/status';
        const intervalId = setInterval(async () => {
            try {
                const response = await makeAuthenticatedRequest(`${API_URL}/${endpoint}/${profileId}`);

                if (response.status === 401) {
                    clearInterval(intervalId);
                    localStorage.removeItem('alphaAutoData');
                    location.reload();
                    return;
                }

                const data = await response.json();

                if (data.success) {
                    const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="${type}"]`);
                    const status = profileBlock.querySelector('.status');

                    status.textContent = data.status;

                    if (data.status.includes('Completed') || data.status.includes('Error') ||
                        data.status === 'Ready' || data.status === 'Processing stopped') {
                        clearInterval(intervalId);
                        status.className = 'status';

                        if (data.status.includes('Completed')) {
                            status.className = 'status success';
                        } else if (data.status.includes('Error')) {
                            status.className = 'status error';
                        }
                    } else {
                        status.className = 'status processing';
                    }
                }
            } catch (error) {
                console.error(`Failed to poll status for ${profileId}:`, error);
            }
        }, 2000);
    }
})