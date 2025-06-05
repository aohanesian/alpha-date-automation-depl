// services/chatService.js
import fetch from 'node-fetch';

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

    async startProfileProcessing(profileId, messageTemplate, token) {
        if (processingProfiles.has(profileId)) {
            return;
        }

        invites[profileId] = messageTemplate;
        const controller = new AbortController();
        abortControllers.set(profileId, controller);
        processingProfiles.add(profileId);
        this.setProfileStatus(profileId, 'processing');

        // Start processing in a non-blocking way
        this.processChatsForProfile(profileId, messageTemplate, token, controller)
            .catch(error => {
                console.error(`Chat processing error for profile ${profileId}:`, error);
                this.setProfileStatus(profileId, `Error: ${error.message}`);
                this.cleanupProcessing(profileId);
            });
    },

    async processChatsForProfile(profileId, messageTemplate, token, controller) {
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

                const availableChats = filteredArray.filter(item => item.female_block === 0 && item.male_block === 0);

                if (availableChats.length === 0) {
                    this.setProfileStatus(profileId, `processing`);
                    await this.delay(50000, controller.signal);
                    continue;
                }

                this.setProfileStatus(profileId, `processing`);

                let sent = 0;
                let skipped = 0;

                for (const [index, chat] of availableChats.entries()) {
                    if (controller.signal.aborted) {
                        this.setProfileStatus(profileId, 'Processing stopped');
                        break;
                    }

                    this.setProfileStatus(profileId,
                        `processing`
                    );

                    const recipientId = await this.getRecipientId(chat.chat_uid, token, profileId);

                    if (!recipientId) {
                        skipped++;
                        continue;
                    }

                    if (this.isBlocked(profileId, recipientId)) {
                        skipped++;
                        continue;
                    }

                    try {
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
                        limits: 1,
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

    async getRecipientId(chatUid, token, profileId) {
        try {
            const response = await fetch('https://alpha.date/api/chatList/chatHistory', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ chat_id: chatUid, page: 1 })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            console.log('Chat history data:', data);

            const lastMessage = data.response[data.response.length - 1];

            console.log('Last message:', lastMessage);

            const recipientID = lastMessage.recipient_external_id === profileId
                ? lastMessage.sender_external_id
                : lastMessage.recipient_external_id;

            return recipientID;

        } catch (error) {
            console.error('Failed to get recipient ID:', error);
            return null;
        }
    },

    async sendFollowUpMessage(senderId, recipientId, messageContent, token) {
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
            const hasRestrictionError = messageData.error === "Restriction of sending a personal message. Try when the list becomes active";

            // Handle different HTTP status codes
            if (response.status === 429) {
                // Rate limited - return signal to wait and retry
                return {
                    success: false,
                    rateLimited: true,
                    error: 'Rate limited'
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
        return invites[profileId] || null;
    },

    cleanupProcessing(profileId) {
        processingProfiles.delete(profileId);
        abortControllers.delete(profileId);
    }
};

export default chatService;