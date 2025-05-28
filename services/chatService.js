// services/chatService.js
import fetch from 'node-fetch';

// In-memory storage for processing state
const processingProfiles = new Set();
const abortControllers = new Map();
const chatBlockLists = {};
const statusMessages = {};

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

        const controller = new AbortController();
        abortControllers.set(profileId, controller);
        processingProfiles.add(profileId);
        this.setProfileStatus(profileId, 'Starting...');

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
                this.setProfileStatus(profileId, 'Fetching all available chats...');
                const allChats = await this.fetchAllChanceChats(profileId, token, controller.signal);

                if (controller.signal.aborted) break;

                if (allChats.length === 0) {
                    this.setProfileStatus(profileId, 'No chats found. Waiting before retry...');
                    await this.delay(50000, controller.signal);
                    continue;
                }

                // Filter out blocked recipients (same as mail service)
                const filteredArray = allChats.filter(chat =>
                    !chatBlockLists[profileId]?.includes(chat.recipient_external_id)
                );

                const availableChats = filteredArray.filter(item => item.female_block === 0);

                if (availableChats.length === 0) {
                    this.setProfileStatus(profileId, `All ${allChats.length} chats are blocked. Waiting before retry...`);
                    await this.delay(50000, controller.signal);
                    continue;
                }

                this.setProfileStatus(profileId, `Processing ${availableChats.length} available chats (${allChats.length - availableChats.length} blocked)...`);

                let sent = 0;
                let skipped = 0;

                for (const [index, chat] of availableChats.entries()) {
                    if (controller.signal.aborted) {
                        this.setProfileStatus(profileId, 'Processing stopped');
                        break;
                    }

                    this.setProfileStatus(profileId,
                        `Processing ${index + 1}/${availableChats.length} (${sent} sent, ${skipped} skipped)`
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
                        await this.sendFollowUpMessage(profileId, recipientId, messageTemplate, token);
                        // If we get here, the message was sent (success or failure is handled in sendFollowUpMessage)
                        sent++;
                    } catch (error) {
                        console.error(`Failed to send message to ${recipientId}:`, error);
                        this.setProfileStatus(profileId, `Error sending to ${recipientId}: ${error.message}`);
                        // Don't add to block list on error
                        skipped++;
                    }

                    await this.delay(7000, controller.signal);
                }

                this.setProfileStatus(profileId, `Completed cycle: ${sent} sent, ${skipped} skipped. Waiting before next cycle...`);
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

            const lastMessage = data.response[data.response.length - 1];

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

            if (!response.ok) {
                throw new Error(`Message sending failed: ${response.status}`);
            }

            const messageData = await response.json();

            // Add to block list if the API response indicates success
            if (messageData.status === true && messageData.response?.message_object && messageData.response?.chat_list_object) {
                this.addToBlockList(senderId, recipientId);
            } else {
                this.setProfileStatus(`Message sent but API response indicates failure: ${JSON.stringify(messageData)}, ${senderId}, ${recipientId}`)
                console.warn(`Message sent but API response indicates failure: ${JSON.stringify(messageData)}, ${senderId}, ${recipientId}`);
            }
        } catch (error) {
            throw error;
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

    cleanupProcessing(profileId) {
        processingProfiles.delete(profileId);
        abortControllers.delete(profileId);
    }
};

export default chatService;