// services/mailService.js
import fetch from 'node-fetch';
import sessionStore from './sessionService.js';

// In-memory storage for processing state
const processingProfiles = new Set();
const abortControllers = new Map();
const mailBlockLists = {};
const attachmentsCache = new Map();
const statusMessages = {};

const mailService = {
    async getProfiles(token) {
        try {
            const response = await fetch('https://alpha.date/api/operator/profiles', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error(`Failed to load profiles: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Profile loading failed:', error);
            throw error;
        }
    },

    async getAttachments(profileId, token, forceRefresh = false) {
        try {
            // Return cached attachments if available and not forcing refresh
            if (!forceRefresh && attachmentsCache.has(profileId)) {
                return attachmentsCache.get(profileId);
            }

            let attachments = { images: [], videos: [], audios: [] };
            const types = ['images', 'videos', 'audios'];

            for (const type of types) {
                const response = await fetch(
                    `https://alpha.date/api/files/${type}?external_id=${profileId}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                // Look for "send" folder in folders list
                if (data.folders && typeof data.folders === 'object') {
                    const sendFolder = Object.values(data.folders).find(folder =>
                        folder.name.toLowerCase() === "send"
                    );

                    if (sendFolder && Array.isArray(sendFolder.list)) {
                        attachments[type] = sendFolder.list;
                    } else {
                        attachments[type] = [];
                    }
                } else if (data[type] && Array.isArray(data[type])) {
                    attachments[type] = data[type];
                } else if (data.response && Array.isArray(data.response)) {
                    attachments[type] = data.response;
                } else {
                    attachments[type] = [];
                }
            }

            attachmentsCache.set(profileId, attachments);
            return attachments;
        } catch (error) {
            console.error('Attachments loading failed:', error);
            return { images: [], videos: [], audios: [] };
        }
    },

    startProcessing(profileId, message, attachments, token, sessionId) {
        if (processingProfiles.has(profileId)) {
            console.log(`Profile ${profileId} is already processing`);
            return;
        }

        processingProfiles.add(profileId);
        const controller = new AbortController();
        abortControllers.set(profileId, controller);

        // Update session state with message and attachments
        if (sessionId) {
            sessionStore.updateProcessingState(sessionId, profileId, 'mail', {
                status: 'Initializing mail processing...',
                message,
                attachments,
                isProcessing: true
            });
        }

        this.setProfileStatus(profileId, 'Processing started');

        // Start processing in a non-blocking way
        this.processMailsForProfile(profileId, message, attachments, token, controller, sessionId)
            .catch(error => {
                console.error(`Mail processing error for profile ${profileId}:`, error);
                this.setProfileStatus(profileId, `Error: ${error.message}`);
                if (sessionId) {
                    sessionStore.updateProcessingState(sessionId, profileId, 'mail', {
                        status: `Error: ${error.message}`,
                        message,
                        attachments,
                        isProcessing: false,
                        error: error.message
                    });
                }
                this.cleanupProcessing(profileId, sessionId);
            });
    },

    async processMailsForProfile(profileId, message, attachments, token, controller, sessionId) {
        try {
            while (true) {
                if (controller.signal.aborted) {
                    this.setProfileStatus(profileId, 'Processing stopped');
                    if (sessionId) {
                        sessionStore.updateProcessingState(sessionId, profileId, 'mail', {
                            status: 'Processing stopped',
                            message,
                            attachments,
                            isProcessing: false
                        });
                    }
                    break;
                }

                // First, fetch all available chats from all pages
                const fetchStatus = 'Fetching available mail recipients...';
                this.setProfileStatus(profileId, fetchStatus);
                if (sessionId) {
                    sessionStore.updateProcessingState(sessionId, profileId, 'mail', {
                        status: fetchStatus,
                        message,
                        attachments,
                        isProcessing: true
                    });
                }

                const allChats = await this.fetchAllChanceChats(profileId, token, controller.signal);

                if (controller.signal.aborted) break;

                if (allChats.length === 0) {
                    const noChatsStatus = 'No mail recipients found. Waiting before retry...';
                    this.setProfileStatus(profileId, noChatsStatus);
                    if (sessionId) {
                        sessionStore.updateProcessingState(sessionId, profileId, 'mail', {
                            status: noChatsStatus,
                            message,
                            attachments,
                            isProcessing: true
                        });
                    }
                    await this.delay(5000, controller.signal);
                    continue;
                }

                // Filter out blocked recipients
                const availableChats = allChats.filter(chat =>
                    !mailBlockLists[profileId]?.includes(chat.recipient_external_id)
                );

                if (availableChats.length === 0) {
                    const allBlockedStatus = `All ${allChats.length} recipients are blocked. Waiting before retry...`;
                    this.setProfileStatus(profileId, allBlockedStatus);
                    if (sessionId) {
                        sessionStore.updateProcessingState(sessionId, profileId, 'mail', {
                            status: allBlockedStatus,
                            message,
                            attachments,
                            isProcessing: true
                        });
                    }
                    await this.delay(5000, controller.signal);
                    continue;
                }

                let sent = 0;
                let skipped = 0;

                for (let i = 0; i < availableChats.length; i++) {
                    if (controller.signal.aborted) break;

                    const chat = availableChats[i];
                    const progressStatus = `Processing ${i + 1}/${availableChats.length} (Sent: ${sent}, Skipped: ${skipped})`;
                    this.setProfileStatus(profileId, progressStatus);
                    if (sessionId) {
                        sessionStore.updateProcessingState(sessionId, profileId, 'mail', {
                            status: progressStatus,
                            message,
                            attachments,
                            isProcessing: true,
                            progress: {
                                total: availableChats.length,
                                processed: i + 1,
                                sent: sent,
                                skipped: skipped
                            }
                        });
                    }

                    try {
                        const recipientId = await this.getRecipientId(chat.chat_uid, token);

                        if (!recipientId || this.isBlocked(profileId, recipientId)) {
                            skipped++;
                            continue;
                        }

                        await this.sendMail(profileId, recipientId, message, attachments, token);
                        sent++;
                        this.addToBlockList(profileId, recipientId);
                        await this.delay(9000, controller.signal);
                    } catch (error) {
                        console.error(`Error processing mail for chat ${chat.chat_uid}:`, error);
                        skipped++;
                    }
                }

                const cycleCompleteStatus = `Completed cycle: ${sent} sent, ${skipped} skipped. Waiting before next cycle...`;
                this.setProfileStatus(profileId, cycleCompleteStatus);
                if (sessionId) {
                    sessionStore.updateProcessingState(sessionId, profileId, 'mail', {
                        status: cycleCompleteStatus,
                        message,
                        attachments,
                        isProcessing: true,
                        progress: {
                            total: availableChats.length,
                            processed: availableChats.length,
                            sent: sent,
                            skipped: skipped
                        }
                    });
                }
                await this.delay(5000, controller.signal);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                throw error;
            }
        }
        this.cleanupProcessing(profileId, sessionId);
    },

    stopProcessing(profileId, sessionId) {
        if (!processingProfiles.has(profileId)) return;

        const controller = abortControllers.get(profileId);
        if (!controller) return;

        if (!controller.signal.aborted) {
            controller.abort();
            this.setProfileStatus(profileId, 'Processing stopped');

            // Update session state
            if (sessionId) {
                sessionStore.updateProcessingState(sessionId, profileId, 'mail', {
                    status: 'stopped'
                });
            }
        }

        this.cleanupProcessing(profileId, sessionId);
    },

    setProfileStatus(profileId, status) {
        statusMessages[profileId] = status;
        console.log(`Mail profile ${profileId}: ${status}`);
    },

    getProfileStatus(profileId, sessionId) {
        if (sessionId) {
            const states = sessionStore.getProcessingStates(sessionId);
            const state = states.get(`mail-${profileId}`);
            if (state?.state) {
                return state.state.status || 'Ready';
            }
        }
        return statusMessages[profileId] || 'Ready';
    },

    cleanupProcessing(profileId, sessionId) {
        processingProfiles.delete(profileId);
        abortControllers.delete(profileId);
        delete statusMessages[profileId];

        // Update session state
        if (sessionId) {
            sessionStore.updateProcessingState(sessionId, profileId, 'mail', {
                status: 'Ready',
                isProcessing: false,
                message: null,
                attachments: null
            });
        }
    },

    async fetchAllChanceChats(profileId, token, signal) {
        const allChats = [];
        let page = 1;

        try {
            while (true) {
                if (signal?.aborted) {
                    throw new Error('Aborted');
                }

                const response = await fetch('https://alpha.date/api/chatList/chatListByUserID', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user_id: profileId,
                        chat_uid: false,
                        page: page,
                        freeze: true,
                        limits: null,
                        ONLINE_STATUS: 1,
                        SEARCH: "",
                        CHAT_TYPE: "CHANCE"
                    }),
                    signal
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const pageChats = data.response || [];

                if (pageChats.length === 0) break;

                allChats.push(...pageChats);
                page++;
            }

            return allChats;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            throw new Error(`Failed to fetch all mail chats: ${error.message}`);
        }
    },

    delay(ms, signal) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(resolve, ms);

            if (signal) {
                if (signal.aborted) {
                    clearTimeout(timeoutId);
                    reject(new Error('Aborted'));
                    return;
                }

                const abortHandler = () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Aborted'));
                };

                signal.addEventListener('abort', abortHandler, { once: true });
            }
        });
    },

    async getRecipientId(chatUid, token) {
        try {
            const response = await fetch('https://alpha.date/api/chatList/chatHistory', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    chat_id: chatUid, 
                    page: 1 
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const chatHistory = data.response?.[0];
            
            if (!chatHistory) return null;
            
            // Get recipient_external_id from chat history
            return chatHistory.recipient_external_id;
        } catch (error) {
            console.error('Failed to get recipient ID:', error);
            return null;
        }
    },

    cyrillicReplacer(inputString) {
        const charMap = {
            'a': 'а', // Cyrillic 'а'
            'e': 'е', // Cyrillic 'е'
            'o': 'о', // Cyrillic 'о'
            'c': 'с', // Cyrillic 'с'
            'i': 'і', // Cyrillic 'і'
            'd': 'ԁ', // Cyrillic 'ԁ'
            's': 'ѕ', // Cyrillic 'ѕ'
            'x': 'х', // Cyrillic 'х'
            'p': 'р'  // Cyrillic 'р'
        };

        const chars = inputString.split('');
        const replaceableIndices = [];

        for (let i = 0; i < chars.length; i++) {
            if (charMap.hasOwnProperty(chars[i].toLowerCase())) {
                replaceableIndices.push(i);
            }
        }

        if (replaceableIndices.length === 0) {
            return inputString;
        }

        const numToReplace = Math.min(
            Math.floor(Math.random() * 5) + 1,
            replaceableIndices.length
        );

        for (let i = replaceableIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [replaceableIndices[i], replaceableIndices[j]] = [replaceableIndices[j], replaceableIndices[i]];
        }

        const indicesToReplace = replaceableIndices.slice(0, numToReplace);

        for (const index of indicesToReplace) {
            const originalChar = chars[index].toLowerCase();
            if (charMap[originalChar]) {
                if (chars[index] === chars[index].toUpperCase()) {
                    chars[index] = charMap[originalChar].toUpperCase();
                } else {
                    chars[index] = charMap[originalChar];
                }
            }
        }

        return chars.join('');
    },

    async sendMail(profileId, recipientId, message, attachments, token) {
        const modifiedMsg = this.cyrillicReplacer(message);

        // Step 1: Create draft
        const draftResponse = await fetch('https://alpha.date/api/mailbox/adddraft', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: profileId,
                recipients: [recipientId],
                message_content: modifiedMsg,
                attachments: attachments
            })
        });

        if (!draftResponse.ok) {
            throw new Error('Draft creation failed');
        }

        const draftData = await draftResponse.json();
        const draftId = draftData.result[0];

        // Step 2: Send mail
        const mailResponse = await fetch('https://alpha.date/api/mailbox/mail', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: profileId,
                recipients: [recipientId],
                message_content: modifiedMsg,
                message_type: "SENT_TEXT",
                attachments: attachments,
                parent_mail_id: null,
                is_send_email: false
            })
        });

        if (!mailResponse.ok) {
            throw new Error('Mail sending failed');
        }

        // Step 3: Delete draft
        await fetch('https://alpha.date/api/mailbox/deletedraft', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: profileId,
                draft_ids: [draftId]
            })
        });
    },

    isBlocked(profileId, recipientId) {
        return mailBlockLists[profileId]?.includes(recipientId);
    },

    addToBlockList(profileId, recipientId) {
        if (!mailBlockLists[profileId]) mailBlockLists[profileId] = [];
        if (!mailBlockLists[profileId].includes(recipientId)) {
            mailBlockLists[profileId].push(recipientId);
        }
    },

    clearBlocks(profileId) {
        delete mailBlockLists[profileId];
        this.setProfileStatus(profileId, 'Block list cleared');
    },

    clearAttachmentsCache(profileId) {
        if (profileId) {
            attachmentsCache.delete(profileId);
        } else {
            attachmentsCache.clear();
        }
    }
};

export default mailService;