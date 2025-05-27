// services/chatService.js
import fetch from 'node-fetch';

// In-memory storage for processing state
const processingProfiles = new Set();
const abortControllers = new Map();
const blockLists = {};
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
            console.log(`Profile ${profileId} is already processing`);
            return;
        }

        const controller = new AbortController();
        abortControllers.set(profileId, controller);
        processingProfiles.add(profileId);
        this.setProfileStatus(profileId, 'Starting...');

        // Start processing in a non-blocking way
        this.processChatsForProfile(profileId, messageTemplate, token, controller)
            .catch(error => {
                console.error(`Processing error for profile ${profileId}:`, error);
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
                const allChats = await this.fetchAllChats(profileId, token, controller.signal);

                if (controller.signal.aborted) break;

                if (allChats.length === 0) {
                    this.setProfileStatus(profileId, 'No chats found. Waiting before retry...');
                    await this.delay(5000, controller.signal);
                    continue;
                }

                // Filter out blocked chats
                const filteredArray = allChats.filter(chat =>
                    !blockLists[profileId]?.includes(chat.chat_uid)
                );

                const availableChats = filteredArray.filter(item => item.female_block === 0)

                if (availableChats.length === 0) {
                    this.setProfileStatus(profileId, `All ${allChats.length} chats are blocked. Waiting before retry...`);
                    await this.delay(5000, controller.signal);
                    continue;
                }

                this.setProfileStatus(profileId, `Processing ${availableChats.length} available chats (${allChats.length - availableChats.length} blocked)...`);

                let sentCount = 0;

                for (let i = 0; i < availableChats.length; i++) {
                    if (controller.signal.aborted) break;

                    const chat = availableChats[i];
                    this.setProfileStatus(profileId, `Processing ${i + 1}/${availableChats.length} chats... (Sent: ${sentCount})`);

                    try {
                        const { needsFollowUp, recipientId } = await this.analyzeChat(chat.chat_uid, token, controller.signal, profileId);

                        if (controller.signal.aborted) break;

                        if (needsFollowUp && recipientId) {
                            try {
                                const success = await this.sendFollowUpMessage(
                                    profileId,
                                    recipientId,
                                    chat.chat_uid,
                                    messageTemplate,
                                    token,
                                    controller.signal
                                );

                                if (controller.signal.aborted) break;

                                if (success) {
                                    sentCount++;
                                    this.setProfileStatus(profileId, `Processing ${i + 1}/${availableChats.length} chats... (Sent: ${sentCount})`);
                                } else {
                                    this.setProfileStatus(profileId, `Processing ${i + 1}/${availableChats.length} chats... (Failed to send: ${sentCount} sent)`);
                                }
                                
                                await this.delay(3000, controller.signal);
                            } catch (error) {
                                console.error(`Failed to send message to chat ${chat.chat_uid}:`, error);
                                this.setProfileStatus(profileId, `Error sending to ${chat.chat_uid}: ${error.message}`);
                                // Don't add to block list on error
                                continue;
                            }
                        }
                    } catch (error) {
                        if (error.name === 'AbortError') break;
                        console.error(`Error processing chat ${chat.chat_uid}:`, error);
                    }
                }

                this.setProfileStatus(profileId, `Completed cycle: Sent ${sentCount}/${availableChats.length} messages. Waiting before next cycle...`);
                await this.delay(5000, controller.signal);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                throw error;
            }
        } finally {
            this.cleanupProcessing(profileId);
        }
    },

    async fetchAllChats(profileId, token, signal) {
        const allChats = [];
        let page = 1;

        try {
            while (true) {
                if (signal?.aborted) {
                    throw new Error('Aborted');
                }

                console.log(`Fetching page ${page} for profile ${profileId}...`);

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

    async analyzeChat(chatUid, token, signal, profileId) {
        try {
            const response = await fetch('https://alpha.date/api/chatList/chatHistory', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ chat_id: chatUid, page: 1 }),
                signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.response?.length > 0) {
                const lastMessage = data.response[data.response.length - 1];

                // Find the first ID that is not equal to profileId
                let recipientId = null;
                for (const message of data.response) {
                    if (message.recipient_external_id && message.recipient_external_id !== profileId) {
                        recipientId = message.recipient_external_id;
                        break;
                    }
                    if (message.sender_external_id && message.sender_external_id !== profileId) {
                        recipientId = message.sender_external_id;
                        break;
                    }
                }

                return {
                    needsFollowUp: lastMessage.payed === 0 ||
                        lastMessage.message_type === "SENT_LIKE" ||
                        lastMessage.message_type === "SENT_WINK" ||
                        lastMessage.message_content === "" ||
                        lastMessage.message_price === "0.0000",
                    recipientId: recipientId
                };
            }

            return { needsFollowUp: false, recipientId: null };
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            console.error('Chat analysis failed:', error);
            return { needsFollowUp: false, recipientId: null };
        }
    },

    async sendFollowUpMessage(senderId, recipientId, chatUid, messageContent, token, signal) {
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
                }),
                signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Only add to block list if the API response indicates success
            if (data.status === true && data.response?.message_object && data.response?.chat_list_object) {
                this.addToBlockList(senderId, chatUid);
                return true;
            } else {
                console.warn(`Message sent but API response indicates failure: ${JSON.stringify(data)}`);
                return false;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            console.error('Failed to send message:', error);
            throw error;
        }
    },

    stopProfileProcessing(profileId) {
        if (!processingProfiles.has(profileId)) return;

        const controller = abortControllers.get(profileId);
        if (!controller) return;

        if (!controller.signal.aborted) {
            controller.abort();
        }

        this.setProfileStatus(profileId, 'Stopping...');
    },

    addToBlockList(profileId, chatUid) {
        if (!blockLists[profileId]) {
            blockLists[profileId] = [];
        }
        if (!blockLists[profileId].includes(chatUid)) {
            blockLists[profileId].push(chatUid);
        }
    },

    clearProfileBlockList(profileId) {
        if (blockLists[profileId]) {
            delete blockLists[profileId];
            this.setProfileStatus(profileId, 'Block list cleared');
        }
    },

    setProfileStatus(profileId, message) {
        statusMessages[profileId] = message;
        console.log(`Profile ${profileId}: ${message}`);
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