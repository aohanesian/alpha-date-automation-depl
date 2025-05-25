// app.js

// Add debounce utility function at the top level
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('beforeunload', function (e) {
        const confirmationMessage = 'Are you sure you want to leave? Turn off sender before exit.';
        e.preventDefault();
        e.returnValue = confirmationMessage;
        return confirmationMessage;
    });

    // Add theme toggle immediately
    addThemeToggle();

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

                    // Load profiles and set up connections
                    await loadProfiles();
                    setupSSEConnection();

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

        // Add error handling for network issues
        return fetch(url, mergedOptions)
            .catch(error => {
                if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                    throw new Error('Network error: Please check your internet connection');
                }
                throw error;
            });
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
            const loginResponse = await fetch(`${API_URL}/auth/login`, {
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
                console.log('Login failed:', {
                    email,
                    timestamp: new Date().toISOString(),
                    status: loginResponse.status,
                    statusText: loginResponse.statusText,
                    message: 'Invalid credentials or server error'
                });
                throw new Error('Login failed - invalid credentials');
            }

            const loginData = await loginResponse.json();

            // Extract user data from response
            userData = {
                email: email,
                token: loginData.token,
                operatorId: loginData.operator_id
            };

            console.log('Login successful:', { 
                email: userData.email, 
                operatorId: userData.operatorId,
                timestamp: new Date().toISOString(),
                message: 'User successfully authenticated with Alpha.date'
            });

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
                console.log('Whitelist check successful:', {
                    email: userData.email,
                    timestamp: new Date().toISOString(),
                    message: 'User authorized and whitelisted'
                });
                // Store user data
                localStorage.setItem('alphaAutoData', JSON.stringify(userData));

                // Set online status
                await setOnlineStatus();

                // Switch to main interface
                loginForm.style.display = 'none';
                mainContainer.style.display = 'block';

                // Load profiles and setup connections
                await loadProfiles();
                setupSSEConnection();

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

    // Add function to sync all profiles
    async function syncAllProfiles() {
        const allProfiles = document.querySelectorAll('.profile-item');

        for (const profileBlock of allProfiles) {
            const profileId = profileBlock.dataset.profileId;
            const type = profileBlock.dataset.profileType;
            const textarea = profileBlock.querySelector('textarea');

            if (textarea && textarea.value) {
                const newState = {
                    [type === 'chat' ? 'messageTemplate' : 'message']: textarea.value
                };

                try {
                    await syncStateWithServer(profileId, type, newState);
                } catch (error) {
                    console.error(`Failed to sync profile ${profileId}:`, error);
                }
            }
        }
    }

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

    // Add state management utilities
    const StateManager = {
        states: new Map(),

        setState(profileId, type, state) {
            const key = `${type}-${profileId}`;
            const currentState = this.states.get(key) || {
                status: 'Ready',
                isProcessing: false,
                messageTemplate: '',
                message: ''
            };

            const newState = {
                ...currentState,
                ...state
            };

            this.states.set(key, newState);
            this.persistState();
            return newState;
        },

        getState(profileId, type) {
            const key = `${type}-${profileId}`;
            return this.states.get(key) || {
                status: 'Ready',
                isProcessing: false,
                messageTemplate: '',
                message: ''
            };
        },

        persistState() {
            try {
                const statesObject = {};
                this.states.forEach((state, key) => {
                    statesObject[key] = state;
                });
                localStorage.setItem('alphaAutoStates', JSON.stringify(statesObject));
            } catch (error) {
                console.error('Failed to persist states:', error);
            }
        },

        loadPersistedStates() {
            try {
                const savedStates = localStorage.getItem('alphaAutoStates');
                if (savedStates) {
                    const statesObject = JSON.parse(savedStates);
                    Object.entries(statesObject).forEach(([key, state]) => {
                        this.states.set(key, state);
                    });
                }
            } catch (error) {
                console.error('Failed to load persisted states:', error);
            }
        },

        clearStates() {
            this.states.clear();
            localStorage.removeItem('alphaAutoStates');
        }
    };

    // Improve sync state function
    async function syncStateWithServer(profileId, type, newState) {
        try {
            // Validate profile type
            const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="${type}"]`);
            if (!profileBlock) {
                console.error(`Cannot sync state: Invalid profile type ${type} for profile ${profileId}`);
                return;
            }

            const response = await makeAuthenticatedRequest(`${API_URL}/auth/update-state`, {
                method: 'POST',
                body: JSON.stringify({
                    profileId,
                    type,
                    state: newState,
                    operatorId: userData.operatorId
                }),
                headers: {
                    'X-Profile-Type': type // Add type to headers for server validation
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to sync state: ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                handleStateUpdate(profileId, type, data.state || newState);
            }
        } catch (error) {
            console.error('Failed to sync state:', error);
        }
    }

    // Update text state management to use existing endpoint
    async function saveTextState(profileId, type, text) {
        try {
            const response = await makeAuthenticatedRequest(`${API_URL}/auth/update-state`, {
                method: 'POST',
                body: JSON.stringify({
                    profileId,
                    type,
                    state: {
                        status: 'Ready',
                        isProcessing: false,
                        textContent: text, // Store text in a separate field
                        [type === 'chat' ? 'messageTemplate' : 'message']: text
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save text state');
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to save text state:', error);
            return null;
        }
    }

    async function getTextState(profileId, type) {
        try {
            const response = await makeAuthenticatedRequest(`${API_URL}/auth/update-state`, {
                method: 'POST',
                body: JSON.stringify({
                    profileId,
                    type,
                    state: {
                        status: 'Ready',
                        isProcessing: false,
                        textContent: '',
                        [type === 'chat' ? 'messageTemplate' : 'message']: ''
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get text state');
            }

            const data = await response.json();
            if (data.success && data.state) {
                // Try to get text from textContent first, then fallback to message/messageTemplate
                return data.state.textContent ||
                    data.state[type === 'chat' ? 'messageTemplate' : 'message'] ||
                    '';
            }
            return '';
        } catch (error) {
            console.error('Failed to get text state:', error);
            return '';
        }
    }

    // Update handleStateUpdate to better handle text content
    function handleStateUpdate(profileId, type, newState) {
        // Get the current local state
        const currentState = StateManager.getState(profileId, type);

        // Find the profile block
        const profileBlock = document.querySelector(
            `.profile-item[data-profile-id="${profileId}"][data-profile-type="${type}"]`
        );

        if (!profileBlock) return;

        const textarea = profileBlock.querySelector('textarea');
        if (!textarea) return;

        // Get the current focused element
        const isCurrentlyFocused = document.activeElement === textarea;

        // Determine which text content to use
        const stateKey = type === 'chat' ? 'messageTemplate' : 'message';
        const textContent = newState.textContent || newState[stateKey] || '';
        const currentText = textarea.value;

        // Update text if:
        // 1. Textarea is not focused
        // 2. Text content is different
        // 3. Either we have new text content or we're processing
        if (!isCurrentlyFocused && textContent !== currentText && (textContent || newState.isProcessing)) {
            textarea.value = textContent;

            // Update character counter
            const charCounter = profileBlock.querySelector('.char-counter');
            if (charCounter) {
                updateCharCounter(textarea, charCounter, type === 'chat' ? 5 : 150);
            }
        }

        // Always update the state
        const mergedState = {
            ...currentState,
            ...newState,
            textContent: isCurrentlyFocused ? currentText : (textContent || currentText),
            [stateKey]: isCurrentlyFocused ? currentText : (textContent || currentText)
        };

        // Update local state
        StateManager.setState(profileId, type, mergedState);

        // Update UI status
        updateProfileStatus(profileId, type, mergedState);
    }

    // Update setupTextareaSync to handle text content properly
    function setupTextareaSync() {
        const allTextareas = document.querySelectorAll('.profile-item textarea');

        allTextareas.forEach(textarea => {
            // Remove any existing event listeners
            const oldListener = textarea.getAttribute('data-sync-listener');
            if (oldListener && window[oldListener]) {
                textarea.removeEventListener('input', window[oldListener]);
                delete window[oldListener];
            }

            const profileBlock = textarea.closest('.profile-item');
            if (!profileBlock) return;

            const profileId = profileBlock.dataset.profileId;
            const type = profileBlock.dataset.profileType;

            // Create sync function
            const syncFunction = async () => {
                const charCounter = profileBlock.querySelector('.char-counter');
                updateCharCounter(textarea, charCounter, type === 'chat' ? 5 : 150);

                // Save text state
                await saveTextState(profileId, type, textarea.value);
            };

            // Create debounced version for input
            const debouncedSync = debounce(syncFunction, 300);

            // Store the function reference
            const functionName = `syncFn_${Math.random().toString(36).substr(2, 9)}`;
            window[functionName] = debouncedSync;
            textarea.setAttribute('data-sync-listener', functionName);

            // Add event listeners
            textarea.addEventListener('input', debouncedSync);
            textarea.addEventListener('blur', syncFunction);

            // Add focus event listener
            textarea.addEventListener('focus', () => {
                textarea.dataset.focused = 'true';
            });

            textarea.addEventListener('blur', () => {
                delete textarea.dataset.focused;
                syncFunction();
            });
        });
    }

    // Add function to get stored text values
    async function getStoredTextValues() {
        try {
            // First try the dedicated endpoint
            try {
                const response = await makeAuthenticatedRequest(`${API_URL}/auth/stored-text-values`, {
                    method: 'GET'
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.values) {
                        // Update textareas with stored values
                        Object.entries(data.values).forEach(([key, value]) => {
                            const [type, profileId] = key.split('-');
                            updateTextareaValue(profileId, type, value);
                        });
                        return;
                    }
                }
            } catch (error) {
                console.log('Dedicated endpoint not available, falling back to update-state');
            }

            // Fallback: Get text values using update-state
            const allTextareas = document.querySelectorAll('.profile-item textarea');
            for (const textarea of allTextareas) {
                const profileBlock = textarea.closest('.profile-item');
                if (!profileBlock) continue;

                const profileId = profileBlock.dataset.profileId;
                const type = profileBlock.dataset.profileType;

                try {
                    const response = await makeAuthenticatedRequest(`${API_URL}/auth/update-state`, {
                        method: 'POST',
                        body: JSON.stringify({
                            profileId,
                            type,
                            state: {
                                status: 'Ready',
                                isProcessing: false,
                                textContent: '',
                                [type === 'chat' ? 'messageTemplate' : 'message']: ''
                            }
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.state) {
                            const savedText = data.state.textContent ||
                                data.state[type === 'chat' ? 'messageTemplate' : 'message'];
                            if (savedText) {
                                updateTextareaValue(profileId, type, savedText);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Failed to get text for profile ${profileId}:`, error);
                }
            }
        } catch (error) {
            console.error('Failed to get stored text values:', error);
        }
    }

    // Helper function to update textarea value
    function updateTextareaValue(profileId, type, value) {
        const profileBlock = document.querySelector(
            `.profile-item[data-profile-id="${profileId}"][data-profile-type="${type}"]`
        );

        if (profileBlock) {
            const textarea = profileBlock.querySelector('textarea');
            if (textarea) {
                textarea.value = value;
                const charCounter = profileBlock.querySelector('.char-counter');
                if (charCounter) {
                    updateCharCounter(textarea, charCounter, type === 'chat' ? 5 : 150);
                }

                // Update local state
                const currentState = StateManager.getState(profileId, type);
                StateManager.setState(profileId, type, {
                    ...currentState,
                    textContent: value,
                    [type === 'chat' ? 'messageTemplate' : 'message']: value
                });
            }
        }
    }

    // Update loadProfiles to get text values after rendering
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

            // Get stored text values after profiles are rendered
            console.log('Getting stored text values...');
            await getStoredTextValues();

            // Add logout and refresh buttons
            addLogoutButton();

        } catch (error) {
            console.error('Failed to load profiles:', error);
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                console.log('Network error detected, clearing stored data');
                localStorage.removeItem('alphaAutoData');
                location.reload();
            }
        }
    }

    // Update profile rendering functions to use StateManager
    function renderChatProfiles(profiles) {
        chatProfilesContainer.innerHTML = '';

        profiles.forEach(profile => {
            const profileBlock = document.createElement('div');
            profileBlock.className = 'profile-item';
            profileBlock.dataset.profileId = profile.external_id;
            profileBlock.dataset.profileType = 'chat';

            // Get saved state for this profile
            const savedState = StateManager.getState(profile.external_id, 'chat');

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
            textarea.value = savedState.messageTemplate || '';
            textarea.disabled = savedState.isProcessing;

            // Trigger immediate sync if there's content
            if (textarea.value) {
                syncStateWithServer(profile.external_id, 'chat', {
                    messageTemplate: textarea.value
                });
            }

            // Character counter
            const charCounter = document.createElement('div');
            charCounter.className = 'char-counter';
            updateCharCounter(textarea, charCounter, 5);

            textarea.addEventListener('input', () => {
                updateCharCounter(textarea, charCounter, 5);
            });

            // Status
            const status = document.createElement('div');
            status.className = 'status';
            updateProfileStatus(profile.external_id, 'chat', savedState);

            // Controls
            const controls = document.createElement('div');
            controls.className = 'controls';

            const startBtn = document.createElement('button');
            startBtn.textContent = 'Start';
            startBtn.className = 'control-btn btn-start';

            startBtn.addEventListener('click', async () => {
                await syncStateWithServer(profile.external_id, 'chat', {
                    messageTemplate: textarea.value,
                    isProcessing: true
                });
                startChatProcessing(profile.external_id, textarea);
            });

            const stopBtn = document.createElement('button');
            stopBtn.textContent = 'Stop';
            stopBtn.className = 'control-btn btn-stop';

            stopBtn.addEventListener('click', async () => {
                await syncStateWithServer(profile.external_id, 'chat', {
                    messageTemplate: textarea.value,
                    isProcessing: false
                });
                stopChatProcessing(profile.external_id);
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';
                textarea.disabled = false;
            });

            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Clear Blocks';
            clearBtn.className = 'control-btn btn-clear';
            clearBtn.addEventListener('click', async () => {
                await syncStateWithServer(profile.external_id, 'chat', {
                    messageTemplate: textarea.value,
                    isProcessing: false
                });
                clearChatBlocks(profile.external_id);
            });

            controls.append(startBtn, stopBtn, clearBtn);

            // Assemble
            profileBlock.append(header, textarea, charCounter, status, controls);
            chatProfilesContainer.appendChild(profileBlock);
        });
        setupTextareaSync();
    }

    // Update status polling to prevent cross-type operations
    function startStatusPolling(profileId, type) {
        const endpoint = type === 'chat' ? 'chat/status' : 'mail/status';
        const intervalId = setInterval(async () => {
            try {
                // Strict type validation
                const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="${type}"]`);
                if (!profileBlock) {
                    clearInterval(intervalId);
                    return;
                }

                // Double check profile type matches endpoint
                const actualType = profileBlock.dataset.profileType;
                if (actualType !== type) {
                    clearInterval(intervalId);
                    return;
                }

                // Use query parameters instead of body for GET request
                const url = new URL(`${API_URL}/${endpoint}/${profileId}`);
                url.searchParams.append('profileType', type);
                url.searchParams.append('validateType', 'true');

                const response = await makeAuthenticatedRequest(url.toString(), {
                    method: 'GET',
                    headers: {
                        'X-Profile-Type': type,
                        'X-Validate-Type': 'true'
                    }
                });

                if (response.status === 401) {
                    clearInterval(intervalId);
                    localStorage.removeItem('alphaAutoData');
                    location.reload();
                    return;
                }

                const data = await response.json();

                if (data.success) {
                    const status = profileBlock.querySelector('.status');
                    const textarea = profileBlock.querySelector('textarea');
                    const startBtn = profileBlock.querySelector('.btn-start, .btn-reset');

                    // Keep textarea disabled and button as Reset during processing and waiting periods
                    textarea.disabled = true;
                    startBtn.textContent = 'Reset';
                    startBtn.className = 'control-btn btn-reset';

                    // Update status text and handle waiting periods
                    if (data.nextCycleIn) {
                        const waitMinutes = Math.ceil(data.nextCycleIn / 60);
                        status.textContent = `Waiting for next cycle (${waitMinutes} minutes remaining)`;
                        status.className = 'status processing';
                    } else {
                        status.textContent = data.status;
                    }

                    // Handle different states
                    if (data.status.includes('Error')) {
                        if (data.status.includes('Method Not Allowed')) {
                            // Stop processing and clear state on type mismatch
                            await stopProcessing(profileId, type);
                            await syncStateWithServer(profileId, type, {
                                status: 'Ready',
                                isProcessing: false
                            });
                            status.textContent = `Error: Invalid operation type for this profile`;
                        }
                        status.className = 'status error';
                        textarea.disabled = false;
                        startBtn.textContent = 'Start';
                        startBtn.className = 'control-btn btn-start';
                        clearInterval(intervalId);
                    } else if (data.status === 'Completed') {
                        if (data.nextCycleIn) {
                            status.className = 'status processing';
                        } else {
                            status.className = 'status success';
                            textarea.disabled = false;
                            startBtn.textContent = 'Start';
                            startBtn.className = 'control-btn btn-start';
                            clearInterval(intervalId);
                        }
                    } else if (data.status === 'Ready' || data.status === 'Processing stopped') {
                        status.className = 'status';
                        textarea.disabled = false;
                        startBtn.textContent = 'Start';
                        startBtn.className = 'control-btn btn-start';
                        clearInterval(intervalId);
                    } else {
                        status.className = 'status processing';
                    }
                } else {
                    clearInterval(intervalId);
                }
            } catch (error) {
                clearInterval(intervalId);
            }
        }, 2000);
    }

    // Helper function to stop processing
    async function stopProcessing(profileId, type) {
        const endpoint = type === 'chat' ? 'chat/stop' : 'mail/stop';
        try {
            await makeAuthenticatedRequest(`${API_URL}/${endpoint}`, {
                method: 'POST',
                body: JSON.stringify({ 
                    profileId,
                    operatorId: userData.operatorId,
                    token: userData.token,
                    type
                })
            });
        } catch (error) {
            console.error(`Failed to stop processing for ${type} profile ${profileId}:`, error);
        }
    }

    // Update start functions to handle initial state
    async function startChatProcessing(profileId, textarea) {
        try {
            // Validate profile type first
            const profileBlock = validateProfileType(profileId, 'chat');
            const status = profileBlock.querySelector('.status');
            const startBtn = profileBlock.querySelector('.btn-start, .btn-reset');

            const messageTemplate = textarea.value.trim();

            if (!messageTemplate || messageTemplate.length < 5) {
                status.textContent = 'Error: Message template must be at least 5 characters';
                status.className = 'status error';
                return;
            }

            status.textContent = 'Starting...';
            status.className = 'status processing';
            textarea.disabled = true;
            startBtn.textContent = 'Reset';
            startBtn.className = 'control-btn btn-reset';

            const response = await makeAuthenticatedRequest(`${API_URL}/chat/start`, {
                method: 'POST',
                body: JSON.stringify({ 
                    profileId, 
                    messageTemplate,
                    type: 'chat',
                    operatorId: userData.operatorId
                })
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
                textarea.disabled = false;
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';
            }
        } catch (error) {
            console.error('Failed to start chat processing:', error);
            const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"]`);
            if (profileBlock) {
                const status = profileBlock.querySelector('.status');
                const textarea = profileBlock.querySelector('textarea');
                const startBtn = profileBlock.querySelector('.btn-start, .btn-reset');
                
                status.textContent = `Error: ${error.message}`;
                status.className = 'status error';
                textarea.disabled = false;
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';
            }
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

            // Get saved state for this profile
            const savedState = StateManager.getState(profile.external_id, 'mail');

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
            textarea.value = savedState.message || '';
            textarea.disabled = savedState.isProcessing;

            // Trigger immediate sync if there's content
            if (textarea.value) {
                syncStateWithServer(profile.external_id, 'mail', {
                    message: textarea.value
                });
            }

            // Character counter
            const charCounter = document.createElement('div');
            charCounter.className = 'char-counter';
            updateCharCounter(textarea, charCounter, 150);

            textarea.addEventListener('input', () => {
                updateCharCounter(textarea, charCounter, 150);
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
            updateProfileStatus(profile.external_id, 'mail', savedState);

            // Controls
            const controls = document.createElement('div');
            controls.className = 'controls';

            const startBtn = document.createElement('button');
            startBtn.textContent = 'Start';
            startBtn.className = 'control-btn btn-start';

            startBtn.addEventListener('click', async () => {
                await syncStateWithServer(profile.external_id, 'mail', {
                    message: textarea.value,
                    isProcessing: true
                });
                startMailProcessing(profile.external_id, textarea, attachmentsContainer);
            });

            const stopBtn = document.createElement('button');
            stopBtn.textContent = 'Stop';
            stopBtn.className = 'control-btn btn-stop';

            stopBtn.addEventListener('click', async () => {
                await syncStateWithServer(profile.external_id, 'mail', {
                    message: textarea.value,
                    isProcessing: false
                });
                stopMailProcessing(profile.external_id);
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';
                textarea.disabled = false;
            });

            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Clear Blocks';
            clearBtn.className = 'control-btn btn-clear';
            clearBtn.addEventListener('click', async () => {
                await syncStateWithServer(profile.external_id, 'mail', {
                    message: textarea.value,
                    isProcessing: false
                });
                clearMailBlocks(profile.external_id);
            });

            controls.append(startBtn, stopBtn, clearBtn);

            // Assemble
            profileBlock.append(header, textarea, charCounter, attachmentsContainer, status, controls);
            mailProfilesContainer.appendChild(profileBlock);
        });
        setupTextareaSync();

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

    // Update start functions to handle initial state
    async function startMailProcessing(profileId, textarea, attachmentsContainer) {
        try {
            // Strict type validation
            const profileBlock = validateProfileType(profileId, 'mail');
            const status = profileBlock.querySelector('.status');
            const startBtn = profileBlock.querySelector('.btn-start, .btn-reset');

            const message = textarea.value.trim();

            if (message.length <= 150) {
                status.textContent = 'Error: Message must be at least 150 characters';
                status.className = 'status error';
                return;
            }

            const attachments = Array.from(attachmentsContainer.querySelectorAll('input:checked')).map(checkbox => ({
                id: checkbox.dataset.id,
                type: checkbox.dataset.type
            }));

            status.textContent = 'Starting...';
            status.className = 'status processing';
            textarea.disabled = true;
            startBtn.textContent = 'Reset';
            startBtn.className = 'control-btn btn-reset';

            // Add profile type validation in request
            const response = await makeAuthenticatedRequest(`${API_URL}/mail/start`, {
                method: 'POST',
                body: JSON.stringify({ 
                    profileId, 
                    message, 
                    attachments,
                    type: 'mail',
                    operatorId: userData.operatorId,
                    profileType: 'mail', // Explicit profile type
                    validateType: true // Request server-side validation
                })
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
                textarea.disabled = false;
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';
                attachmentsContainer.style.display = 'grid';
            }
        } catch (error) {
            console.error('Failed to start mail processing:', error);
            const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"]`);
            if (profileBlock) {
                const status = profileBlock.querySelector('.status');
                const textarea = profileBlock.querySelector('textarea');
                const startBtn = profileBlock.querySelector('.btn-start, .btn-reset');
                
                status.textContent = `Error: ${error.message}`;
                status.className = 'status error';
                textarea.disabled = false;
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';
            }
        }
    }

    // Load attachments for mail profile
    async function loadAttachments(profileId, container, forceRefresh = false) {
        try {
            const response = await makeAuthenticatedRequest(`${API_URL}/mail/attachments/${profileId}${forceRefresh ? '?refresh=true' : ''}`);

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

        // Add refresh button at the top
        const refreshButton = document.createElement('button');
        refreshButton.className = 'refresh-btn';
        refreshButton.textContent = '🔄 Refresh Attachments';
        refreshButton.onclick = () => {
            container.innerHTML = '<div class="status">Refreshing attachments...</div>';
            loadAttachments(container.closest('.profile-item').dataset.profileId, container, true);
        };
        container.appendChild(refreshButton);

        // Add styles for attachment layout
        const style = document.createElement('style');
        style.textContent = `
            .attachments-container {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 15px;
                padding: 15px;
                width: 100%;
            }
            .attachment-item {
                position: relative;
                display: flex;
                flex-direction: column;
                align-items: center;
                margin: 0;
                cursor: pointer;
                width: 100%;
            }
            .attachment-preview {
                position: relative;
                width: 100%;
                aspect-ratio: 1;
                overflow: hidden;
            }
            .attachment-preview img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }
            .attachment-checkbox {
                position: absolute;
                top: 10px;
                right: 10px;
                z-index: 2;
                width: 20px;
                height: 20px;
                margin: 0;
                cursor: pointer;
                background: white;
                border: 2px solid #666;
                border-radius: 4px;
            }
            .attachment-checkbox:checked {
                background: #4CAF50;
                border-color: #4CAF50;
            }
            .attachment-filename {
                font-size: 12px;
                text-align: center;
                word-break: break-word;
                width: 100%;
            }
            .refresh-btn {
                margin-bottom: 15px;
                width: 100%;
            }
        `;
        document.head.appendChild(style);

        Object.entries(attachments).forEach(([type, items]) => {
            if (items && items.length > 0) {
                hasAttachments = true;

                items.forEach(item => {
                    if (!item) return;

                    const wrapper = document.createElement('label');
                    wrapper.className = 'attachment-item';

                    const preview = document.createElement('div');
                    preview.className = 'attachment-preview';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'attachment-checkbox';
                    checkbox.dataset.type = type;
                    checkbox.dataset.id = item.id;

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

                    const filename = document.createElement('div');
                    filename.className = 'attachment-filename';
                    filename.textContent = item.filename || 'Unnamed file';

                    preview.appendChild(checkbox);
                    wrapper.append(preview, filename);
                    container.append(wrapper);
                });
            }
        });

        if (!hasAttachments) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'status';
            messageDiv.textContent = 'No attachments available, to add attachments create folder with name "send" for each type of media';
            container.innerHTML = '';
            container.appendChild(messageDiv);
            container.appendChild(refreshButton);
            container.classList.add('split');
        } else {
            container.classList.remove('split');
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
    async function stopChatProcessing(profileId, skipStatusUpdate = false) {
        try {
            const response = await makeAuthenticatedRequest(`${API_URL}/chat/stop`, {
                method: 'POST',
                body: JSON.stringify({ 
                    profileId,
                    operatorId: userData.operatorId,
                    token: userData.token
                })
            });

            const data = await response.json();
            
            if (!skipStatusUpdate) {
                const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="chat"]`);
                const status = profileBlock.querySelector('.status');

                if (data.success) {
                    status.textContent = data.message || 'Processing stopped';
                    status.className = 'status';
                } else {
                    console.error('Failed to stop processing:', data.message);
                }
            }
        } catch (error) {
            console.error('Failed to stop processing:', error);
        }
    }

    async function clearChatBlocks(profileId) {
        const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="chat"]`);
        const status = profileBlock.querySelector('.status');
        const startBtn = profileBlock.querySelector('.btn-start, .btn-reset');

        try {
            // Set initial status and prevent immediate overwrite
            status.textContent = 'Clearing blocks...';
            status.className = 'status processing';
            let statusLocked = true;

            // Override status update temporarily
            const originalUpdateStatus = updateProfileStatus;
            updateProfileStatus = (id, type, state) => {
                if (id === profileId && type === 'chat' && statusLocked) {
                    return; // Skip updates while locked
                }
                originalUpdateStatus(id, type, state);
            };

            // First stop any ongoing processing
            await stopChatProcessing(profileId, true); // Pass flag to prevent status updates

            const response = await makeAuthenticatedRequest(`${API_URL}/chat/stop`, {
                method: 'POST',
                body: JSON.stringify({ 
                    profileId,
                    operatorId: userData.operatorId,
                    token: userData.token,
                    clearBlocks: true
                })
            });

            if (response.status === 401) {
                localStorage.removeItem('alphaAutoData');
                location.reload();
                return;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                status.textContent = 'Block list cleared successfully';
                status.className = 'status success';
                
                // Reset state and UI
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';

                // Keep success message visible for a moment
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Release status lock and update state
                statusLocked = false;
                await syncStateWithServer(profileId, 'chat', {
                    status: 'Ready',
                    isProcessing: false
                });
            } else {
                throw new Error(data.message || 'Failed to clear blocks');
            }

            // Restore original update function
            updateProfileStatus = originalUpdateStatus;
        } catch (error) {
            console.error('Failed to clear blocks:', error);
            status.textContent = `Error clearing blocks: ${error.message}`;
            status.className = 'status error';
        }
    }

    // Mail functions
    async function stopMailProcessing(profileId, skipStatusUpdate = false) {
        try {
            const response = await makeAuthenticatedRequest(`${API_URL}/mail/stop`, {
                method: 'POST',
                body: JSON.stringify({ 
                    profileId,
                    operatorId: userData.operatorId,
                    token: userData.token
                })
            });

            const data = await response.json();
            
            if (!skipStatusUpdate) {
                const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="mail"]`);
                const status = profileBlock.querySelector('.status');

                if (data.success) {
                    status.textContent = data.message || 'Processing stopped';
                    status.className = 'status';
                } else {
                    console.error('Failed to stop processing:', data.message);
                }
            }
        } catch (error) {
            console.error('Failed to stop processing:', error);
        }
    }

    async function clearMailBlocks(profileId) {
        const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="mail"]`);
        const status = profileBlock.querySelector('.status');
        const startBtn = profileBlock.querySelector('.btn-start, .btn-reset');
        const textarea = profileBlock.querySelector('textarea');

        try {
            // Set initial status and prevent immediate overwrite
            status.textContent = 'Clearing blocks...';
            status.className = 'status processing';
            let statusLocked = true;

            // Override status update temporarily
            const originalUpdateStatus = updateProfileStatus;
            updateProfileStatus = (id, type, state) => {
                if (id === profileId && type === 'mail' && statusLocked) {
                    return; // Skip updates while locked
                }
                originalUpdateStatus(id, type, state);
            };

            // First stop any ongoing processing
            await stopMailProcessing(profileId, true); // Pass flag to prevent status updates

            const response = await makeAuthenticatedRequest(`${API_URL}/mail/clear-blocks`, {
                method: 'POST',
                body: JSON.stringify({ 
                    profileId,
                    operatorId: userData.operatorId,
                    token: userData.token
                })
            });

            if (response.status === 401) {
                localStorage.removeItem('alphaAutoData');
                location.reload();
                return;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                status.textContent = 'Block list cleared successfully';
                status.className = 'status success';
                
                // Reset state and UI
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';
                textarea.disabled = false;

                // Keep success message visible for a moment
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Release status lock and update state
                statusLocked = false;
                await syncStateWithServer(profileId, 'mail', {
                    status: 'Ready',
                    isProcessing: false
                });
            } else {
                throw new Error(data.message || 'Failed to clear blocks');
            }

            // Restore original update function
            updateProfileStatus = originalUpdateStatus;
        } catch (error) {
            console.error('Failed to clear blocks:', error);
            status.textContent = `Error clearing blocks: ${error.message}`;
            status.className = 'status error';
        }
    }

    // Add SSE connection setup function
    function setupSSEConnection() {
        // Close existing connection if any
        if (window.alphaAutoEventSource) {
            window.alphaAutoEventSource.close();
        }

        // Create URL with auth token
        const url = new URL(`${API_URL}/sse/updates`);

        // Create EventSource with credentials
        const eventSource = new EventSource(url, {
            withCredentials: true
        });

        // Add auth token to SSE request headers using a fetch request
        fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'text/event-stream',
                'Authorization': `Bearer ${userData.token}`,
                'X-Auth-Token': userData.token
            }
        }).catch(error => {
            console.error('Failed to authenticate SSE connection:', error);
        });

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('SSE update received:', data);

                if (!data || typeof data !== 'object') {
                    console.error('Invalid SSE data received:', data);
                    return;
                }

                if (data.type === 'initialState' && Array.isArray(data.states)) {
                    data.states.forEach(state => {
                        if (state && state.profileId && state.type && state.state) {
                            handleStateUpdate(state.profileId, state.type, state.state);
                        }
                    });
                } else if (data.type === 'processingStateUpdated') {
                    if (data.profileId && data.processType && data.state) {
                        handleStateUpdate(data.profileId, data.processType, data.state);
                    }
                }
            } catch (error) {
                console.error('Error processing SSE update:', error);
            }
        };

        eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
            // Try to reconnect after a delay
            setTimeout(() => {
                setupSSEConnection();
            }, 5000);
        };

        // Store eventSource for cleanup
        window.alphaAutoEventSource = eventSource;
    }

    // Update profile status function
    function updateProfileStatus(profileId, type, state) {
        if (!profileId || !type) {
            console.error('Invalid parameters for updateProfileStatus:', { profileId, type, state });
            return;
        }

        const container = type === 'chat' ? chatProfilesContainer : mailProfilesContainer;
        if (!container) {
            console.error('Container not found for type:', type);
            return;
        }

        const profileBlock = container.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="${type}"]`);
        if (!profileBlock) {
            console.debug('Profile block not found:', { profileId, type });
            return;
        }

        const status = profileBlock.querySelector('.status');
        const startBtn = profileBlock.querySelector('.btn-start, .btn-reset');
        const stopBtn = profileBlock.querySelector('.btn-stop');
        const textarea = profileBlock.querySelector('textarea');

        if (status) {
            let statusText = state?.status || 'Ready';
            let isProcessing = state?.isProcessing || false;

            // Ensure status always has text
            if (!statusText || statusText.trim() === '') {
                statusText = 'Ready';
            }

            status.textContent = statusText;
            status.className = 'status';

            if (statusText.includes('Error')) {
                status.classList.add('error');
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';
                textarea.disabled = false;
            } else if (statusText === 'Ready' || statusText === 'Processing stopped') {
                status.className = 'status';
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';
                textarea.disabled = false;
            } else if (statusText.includes('Completed')) {
                status.classList.add('success');
                startBtn.textContent = 'Start';
                startBtn.className = 'control-btn btn-start';
                textarea.disabled = false;
            } else if (isProcessing) {
                status.classList.add('processing');
                startBtn.textContent = 'Reset';
                startBtn.className = 'control-btn btn-reset';
                textarea.disabled = true;
            }
        }
    }

    // Update logout function to close SSE connection
    const originalLogout = logout;
    function logout() {
        if (window.alphaAutoEventSource) {
            window.alphaAutoEventSource.close();
        }
        StateManager.clearStates();
        localStorage.removeItem('alphaAutoData');
        location.reload();
    }

    // Add theme toggle function
    function addThemeToggle() {
        if (!document.getElementById('theme-toggle')) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'top-controls';

            const themeToggle = document.createElement('button');
            themeToggle.id = 'theme-toggle';
            themeToggle.className = 'theme-toggle';
            themeToggle.innerHTML = '<span class="icon">🌙</span> Dark Mode';

            // Check for saved theme preference
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
                themeToggle.innerHTML = '<span class="icon">☀️</span> Light Mode';
            }

            themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);

                themeToggle.innerHTML = newTheme === 'dark' ?
                    '<span class="icon">☀️</span> Light Mode' :
                    '<span class="icon">🌙</span> Dark Mode';
            });

            buttonContainer.appendChild(themeToggle);
            document.body.appendChild(buttonContainer);
        }
    }

    // Update addLogoutButton function to handle missing container
    function addLogoutButton() {
        let container = document.querySelector('.top-controls');

        // Create container if it doesn't exist
        if (!container) {
            container = document.createElement('div');
            container.className = 'top-controls';
            document.body.appendChild(container);
        }

        if (!document.getElementById('logout-btn')) {
            const refreshBtn = document.createElement('button');
            refreshBtn.id = 'refresh-profiles-btn';
            refreshBtn.textContent = '🔄 Refresh Profiles';
            refreshBtn.className = 'control-btn btn-start';

            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logout-btn';
            logoutBtn.textContent = 'Logout';
            logoutBtn.className = 'control-btn btn-clear';

            // Update logout event listener
            logoutBtn.addEventListener('click', logout);

            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '⏳ Stopping...';

                // Stop all chat profiles
                const chatProfiles = document.querySelectorAll('.profile-item[data-profile-type="chat"]');
                for (const profile of chatProfiles) {
                    const profileId = profile.dataset.profileId;
                    await stopChatProcessing(profileId);
                }

                // Stop all mail profiles
                const mailProfiles = document.querySelectorAll('.profile-item[data-profile-type="mail"]');
                for (const profile of mailProfiles) {
                    const profileId = profile.dataset.profileId;
                    await stopMailProcessing(profileId);
                }

                // Wait a bit to ensure all processes are stopped
                await new Promise(resolve => setTimeout(resolve, 1000));

                refreshBtn.textContent = '🔄 Loading...';

                // Reload profiles
                await loadProfiles();

                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 Refresh Profiles';
            });

            container.appendChild(refreshBtn);
            container.appendChild(logoutBtn);
        }
    }

    // Add tab visibility handler
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && userData.token) {
            console.log('Tab became visible and user is logged in, refreshing states...');
            await loadInitialStates();
        }
    });

    // Add function to sync all states
    async function syncAllStates() {
        const allTextareas = document.querySelectorAll('.profile-item textarea');
        for (const textarea of allTextareas) {
            const profileBlock = textarea.closest('.profile-item');
            if (profileBlock) {
                const profileId = profileBlock.dataset.profileId;
                const type = profileBlock.dataset.profileType;
                const currentState = StateManager.getState(profileId, type);

                try {
                    const response = await makeAuthenticatedRequest(`${API_URL}/auth/update-state`, {
                        method: 'POST',
                        body: JSON.stringify({
                            profileId,
                            type,
                            state: currentState
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.state) {
                            handleStateUpdate(profileId, type, data.state);
                        }
                    }
                } catch (error) {
                    console.error(`Failed to sync state for profile ${profileId}:`, error);
                }
            }
        }
    }

    // Update loadInitialStates to focus on processing states only
    async function loadInitialStates() {
        try {
            // First load from localStorage
            StateManager.loadPersistedStates();

            // Get processing states
            const processingResponse = await makeAuthenticatedRequest(`${API_URL}/auth/processing-states`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (processingResponse.ok) {
                const processingData = await processingResponse.json();
                if (processingData.success && processingData.states) {
                    Object.entries(processingData.states).forEach(([key, state]) => {
                        const [type, profileId] = key.split('-');
                        handleStateUpdate(profileId, type, state);
                    });
                }
            }

            // Setup SSE after initial state load
            setupSSEConnection();
        } catch (error) {
            console.error('Failed to load initial states:', error);
        }
    }

    // Add type validation helper
    function validateProfileType(profileId, expectedType) {
        const profileBlock = document.querySelector(`.profile-item[data-profile-id="${profileId}"][data-profile-type="${expectedType}"]`);
        if (!profileBlock) {
            throw new Error(`Invalid profile type. Expected ${expectedType} profile but got different type or profile not found.`);
        }
        return profileBlock;
    }
})