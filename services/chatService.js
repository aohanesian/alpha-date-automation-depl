// services/chatService.js
import fetch from 'node-fetch';
import mailService from './mailService.js';
import authService from './authService.js';

// In-memory storage for processing state
const processingProfiles = new Set();
const abortControllers = new Map();
const chatBlockLists = {};
const statusMessages = {};
const invites = {};


const chatService = {
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

    async startProfileProcessing(profileId, messageTemplate, token, attachment = null, operatorId = null) {
        if (processingProfiles.has(profileId)) {
            return;
        }

        // Store both messageTemplate and attachment for syncing
        invites[profileId] = { messageTemplate, attachment };
        const controller = new AbortController();
        abortControllers.set(profileId, controller);
        processingProfiles.add(profileId);
        this.setProfileStatus(profileId, 'processing');

        // Start profile-specific online heartbeat
        // Use provided operatorId or extract from token
        const finalOperatorId = operatorId || this.extractOperatorIdFromToken(token) || 'default';
        authService.startProfileOnlineHeartbeat(profileId, finalOperatorId, token);

        // Start processing in a non-blocking way
        this.processChatsForProfile(profileId, messageTemplate, token, controller, attachment)
            .catch(error => {
                console.error(`Chat processing error for profile ${profileId}:`, error);
                this.setProfileStatus(profileId, `Error: ${error.message}`);
                this.cleanupProcessing(profileId);
            });
    },

    async processChatsForProfile(profileId, messageTemplate, token, controller, attachment = null) {
        try {
            while (true) {
                if (controller.signal.aborted) {
                    this.setProfileStatus(profileId, 'Processing stopped');
                    break;
                }

                // First, fetch all available chats from all pages
                this.setProfileStatus(profileId, 'processing');
                const allChats = await this.fetchAllChanceChats(profileId, token, controller.signal);

                if (controller.signal.aborted) break;

                if (allChats.length === 0) {
                    this.setProfileStatus(profileId, 'processing');
                    await this.delay(50000, controller.signal);
                    continue;
                }

                // Filter out blocked recipients (same as mail service)
                const filteredArray = allChats.filter(chat =>
                    !chatBlockLists[profileId]?.includes(chat.recipient_external_id)
                );

                // Fix: treat as available if not equal to 1 (handle missing fields)
                const availableChats = filteredArray.filter(item => (item.female_block !== 1) && (item.male_block !== 1));

                if (availableChats.length === 0) {
                    this.setProfileStatus(profileId, `processing`);
                    await this.delay(50000, controller.signal);
                    continue;
                }

                this.setProfileStatus(profileId, `processing`);

                // --- Batch fetch last messages ---
                const chatUids = availableChats.map(chat => chat.chat_uid);
                const lastMessagesMap = await this.fetchLastMessages(chatUids, token);

                let sent = 0;
                let skipped = 0;

                for (const [index, chat] of availableChats.entries()) {
                    if (controller.signal.aborted) {
                        this.setProfileStatus(profileId, 'Processing stopped');
                        break;
                    }

                    this.setProfileStatus(profileId, `processing`);

                    // Use batch last message
                    const lastMessage = lastMessagesMap[chat.chat_uid];
                    const recipientId = this.getRecipientIdFromLastMessage(lastMessage, profileId);

                    if (!recipientId) {
                        skipped++;
                        continue;
                    }

                    if (this.isBlocked(profileId, recipientId)) {
                        skipped++;
                        continue;
                    }

                    try {
                        // If attachment is provided, send it first
                        if (attachment) {
                            const attachmentResult = await this.sendAttachmentMessage(profileId, recipientId, attachment, token);
                            if (!attachmentResult.success) {
                                skipped++;
                                continue;
                            }
                        }
                        const result = await this.sendFollowUpMessage(profileId, recipientId, messageTemplate, token);

                        // Handle different response types
                        if (result.success) {
                            sent++;
                        } else if (result.rateLimited) {
                            // Rate limited - wait and continue processing
                            this.setProfileStatus(profileId, 'processing');
                            await this.delay(50000, controller.signal);
                            // Don't increment counters, retry this message
                            continue;
                        } else if (result.shouldStop) {
                            // Fatal error - stop processing
                            this.setProfileStatus(profileId, `Stopping due to: ${result.error}`);
                            return;
                        } else {
                            // Other error - skip this message
                            skipped++;
                        }
                    } catch (error) {
                        console.error(`Failed to send message to ${recipientId}:`, error);
                        skipped++;
                    }

                    // Normal delay between messages (skip if we just did a rate limit delay)
                    await this.delay(7000, controller.signal);
                }

                this.setProfileStatus(profileId, `processing`);
                await this.delay(50000, controller.signal);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                throw error;
            }
        } finally {
            this.cleanupProcessing(profileId);
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

                console.log(`Fetching chat page ${page} for profile ${profileId}...`);

                let response;
                try {
                    response = await fetch('https://alpha.date/api/chatList/chatListByUserID', {
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
                            limits: 1,
                            ONLINE_STATUS: 1,
                            SEARCH: "",
                            CHAT_TYPE: "CHANCE"
                        }),
                        signal
                    });
                } catch (err) {
                    // Network or timeout error (e.g., 524)
                    console.error(`Network error or timeout fetching chats for profile ${profileId}:`, err);
                    await this.delay(50000, signal);
                    continue;
                }

                if (response.status === 401) {
                    console.error(`401 Unauthorized for profile ${profileId}. Terminating session.`);
                    throw new Error('401 Unauthorized - terminating session');
                }

                if (response.status === 524) {
                    console.error(`524 Timeout for profile ${profileId}. Waiting and retrying...`);
                    await this.delay(50000, signal);
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const pageChats = data.response || [];

                if (pageChats.length === 0) {
                    console.log(`No more chats found at page ${page}. Total fetched: ${allChats.length}`);
                    break;
                }

                allChats.push(...pageChats);
                console.log(`Fetched ${pageChats.length} chats from page ${page}. Total: ${allChats.length}`);
                page++;
            }

            return allChats;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            console.error('Failed to fetch all chats:', error);
            throw new Error(`Failed to fetch all chats: ${error.message}`);
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

    // Utility to extract recipient ID from last message
    getRecipientIdFromLastMessage(lastMessage, profileId) {
        if (!lastMessage) return null;
        return lastMessage.recipient_external_id === profileId
            ? lastMessage.sender_external_id
            : lastMessage.recipient_external_id;
    },

    // Batch fetch last messages for all chatUids
    async fetchLastMessages(chatUids, token) {
        console.log('[fetchLastMessages called]');
        if (!Array.isArray(chatUids) || chatUids.length === 0) return {};
        try {
            let response;
            try {
                response = await fetch('https://alpha.date/api/chatList/lastMessage', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ chat_uid: chatUids })
                });
            } catch (err) {
                // Network or timeout error (e.g., 524)
                console.error('Network error or timeout in fetchLastMessages:', err);
                await this.delay(50000);
                return await this.fetchLastMessages(chatUids, token); // retry
            }

            if (response.status === 401) {
                console.error('401 Unauthorized in fetchLastMessages. Terminating session.');
                throw new Error('401 Unauthorized - terminating session');
            }

            if (response.status === 524) {
                console.error('524 Timeout in fetchLastMessages. Waiting and retrying...');
                await this.delay(50000);
                return await this.fetchLastMessages(chatUids, token); // retry
            }

            if (!response.ok) throw new Error('Failed to fetch last messages');
            const data = await response.json();
            console.log('[LAST MESSAGE BATCH]:', data);
            const map = {};
            for (const msg of data.response) {
                map[msg.chat_uid] = msg;
            }
            return map;
        } catch (error) {
            console.error('Failed to batch fetch last messages:', error);
            throw error;
        }
    },

    async sendAttachmentMessage(senderId, recipientId, attachment, token) {
        console.log('[ATTACHMENT: ]: ', attachment)
        // Determine message_type and content based on attachment type
        let message_type = '';
        let content_url = '';
        if (attachment.content_type === 'image') {
            message_type = 'SENT_IMAGE';
            content_url = attachment.link;
        } else if (attachment.content_type === 'video') {
            message_type = 'SENT_VIDEO';
            content_url = attachment.link;
        } else if (attachment.content_type === 'audio') {
            message_type = 'SENT_AUDIO';
            content_url = attachment.link;
        } else {
            return { success: false, error: 'Unsupported attachment type' };
        }

        const payload = {
            sender_id: +senderId,
            recipient_id: recipientId,
            message_content: content_url,
            message_type: message_type,
            filename: attachment.filename || '',
            content_id: attachment.id || undefined,
            chance: true
        };

        try {
            const response = await fetch('https://alpha.date/api/chat/message', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const messageData = await response.json();
            const hasRestrictionError = messageData.error === "Restriction of sending a personal message. Try when the list becomes active";

            console.log('[DEBUG LIKES] ' + JSON.stringify(messageData) + ' for man ID ' + recipientId)

            // Handle different HTTP status codes
            if (response.status === 429) {
                // Rate limited - wait and retry
                console.error('429 Rate limited in sendAttachmentMessage. Waiting and retrying...');
                await this.delay(50000);
                return await this.sendAttachmentMessage(senderId, recipientId, attachment, token);
            }

            if (response.status === 401) {
                // Fatal error - terminate session
                console.error('401 Unauthorized in sendAttachmentMessage. Terminating session.');
                return {
                    success: false,
                    shouldStop: true,
                    error: '401 Unauthorized - terminating session'
                };
            }

            if (response.status === 400 || response.status === 401 || messageData.error === "Not your profile") {
                // Fatal errors - stop processing entirely
                return {
                    success: false,
                    shouldStop: true,
                    error: `Fatal error: ${response.status} - ${messageData.error || response.statusText}`
                };
            }

            if (response.status === 524) {
                // Timeout - wait and retry
                console.error('524 Timeout in sendAttachmentMessage. Waiting and retrying...');
                await this.delay(50000);
                return await this.sendAttachmentMessage(senderId, recipientId, attachment, token);
            }

            if (!response.ok) {
                // Other HTTP errors - skip this message but continue processing
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`
                };
            }

            // Response is OK - check for API-level errors
            if (hasRestrictionError) {
                // Restriction error - skip this recipient but don't add to block list
                return {
                    success: false,
                    error: 'Recipient restriction'
                };
            }

            // Success - add to block list to avoid sending again
            this.addToBlockList(senderId, recipientId);
            return { success: true };

        } catch (error) {
            // Network or other errors
            return {
                success: false,
                error: error.message
            };
        }
    },

    async sendFollowUpMessage(senderId, recipientId, messageContent, token) {

        console.log('[sendFollowUpMessage] CALLED MSG CONTET:', messageContent)

        if (!messageContent) return { success: true };

        try {
            const response = await fetch('https://alpha.date/api/chat/message', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sender_id: +senderId,
                    recipient_id: recipientId,
                    message_content: messageContent,
                    message_type: "SENT_TEXT",
                    filename: "",
                    chance: true
                })
            });

            const messageData = await response.json();
            console.log('[DEBUG LIKES] ' + JSON.stringify(messageData) + ' for man ID ' + recipientId)
            const hasRestrictionError = messageData.error === "Restriction of sending a personal message. Try when the list becomes active";

            // Handle different HTTP status codes
            if (response.status === 429) {
                // Rate limited - wait and retry
                console.error('429 Rate limited in sendFollowUpMessage. Waiting and retrying...');
                await this.delay(50000);
                return await this.sendFollowUpMessage(senderId, recipientId, messageContent, token);
            }

            if (response.status === 401) {
                // Fatal error - terminate session
                console.error('401 Unauthorized in sendFollowUpMessage. Terminating session.');
                return {
                    success: false,
                    shouldStop: true,
                    error: '401 Unauthorized - terminating session'
                };
            }

            if (response.status === 400 || response.status === 401 || messageData.error === "Not your profile") {
                // Fatal errors - stop processing entirely
                return {
                    success: false,
                    shouldStop: true,
                    error: `Fatal error: ${response.status} - ${messageData.error || response.statusText}`
                };
            }

            if (response.status === 524) {
                // Timeout - wait and retry
                console.error('524 Timeout in sendFollowUpMessage. Waiting and retrying...');
                await this.delay(50000);
                return await this.sendFollowUpMessage(senderId, recipientId, messageContent, token);
            }

            if (!response.ok) {
                // Other HTTP errors - skip this message but continue processing
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`
                };
            }

            // Response is OK - check for API-level errors
            if (hasRestrictionError) {
                // Restriction error - skip this recipient but don't add to block list
                return {
                    success: false,
                    error: 'Recipient restriction'
                };
            }

            // Success - add to block list to avoid sending again
            this.addToBlockList(senderId, recipientId);
            return { success: true };

        } catch (error) {
            // Network or other errors
            return {
                success: false,
                error: error.message
            };
        }
    },

    isBlocked(profileId, recipientId) {
        return chatBlockLists[profileId]?.includes(recipientId);
    },

    addToBlockList(profileId, recipientId) {
        if (!chatBlockLists[profileId]) chatBlockLists[profileId] = [];
        if (!chatBlockLists[profileId].includes(recipientId)) {
            chatBlockLists[profileId].push(recipientId);
        }
    },

    stopProfileProcessing(profileId) {
        const controller = abortControllers.get(profileId);
        if (controller) controller.abort();
        processingProfiles.delete(profileId);
        this.setProfileStatus(profileId, 'Ready');
    },

    clearProfileBlockList(profileId) {
        delete chatBlockLists[profileId];
        this.setProfileStatus(profileId, 'Block list cleared');
    },

    setProfileStatus(profileId, message) {
        statusMessages[profileId] = message;
        console.log(`Chat profile ${profileId}: ${message}`);
    },

    getProfileStatus(profileId) {
        return statusMessages[profileId] || 'Ready';
    },

    getProfileMessage(profileId) {
        // Return both messageTemplate and attachment for syncing
        const invite = invites[profileId];
        if (typeof invite === 'object' && invite !== null && ('messageTemplate' in invite || 'attachment' in invite)) {
            return invite;
        }
        // Backward compatibility: if only a string is stored
        return invite ? { messageTemplate: invite, attachment: null } : null;
    },

    cleanupProcessing(profileId) {
        processingProfiles.delete(profileId);
        abortControllers.delete(profileId);
        
        // Stop profile-specific online heartbeat
        // We need to track the operatorId per profile, but for now use default
        const operatorId = 'default';
        authService.stopProfileOnlineHeartbeat(profileId, operatorId);
    },

    // Helper method to extract operatorId from token (placeholder implementation)
    extractOperatorIdFromToken(token) {
        // This is a placeholder - in a real implementation, you might decode the token
        // or store the operatorId separately. For now, we'll use a default value.
        return 'default';
    },

    // Add this method to reuse mailService's attachment logic for chat
    async getAttachments(profileId, token, forceRefresh = false) {
        return mailService.getAttachments(profileId, token, forceRefresh);
    }
};

export default chatService;