// services/mailService.js
import fetch from 'node-fetch';
import authService from './authService.js';

// In-memory storage for processing state
const processingProfiles = new Set();
const abortControllers = new Map();
const mailBlockLists = {};
const attachmentsCache = new Map();
const statusMessages = {};
const invites = {};

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
        if (!forceRefresh && attachmentsCache.has(profileId)) {
            return attachmentsCache.get(profileId);
        }

        try {
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

                // Look for folder from environment variable (default: "send")
                if (data.folders && typeof data.folders === 'object') {
                    const folderName = process.env.VITE_ATTACHMENT_FOLDER_NAME || "send";
                    const sendFolder = Object.values(data.folders).find(folder =>
                        folder.name.toLowerCase() === folderName.toLowerCase()
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
            console.error(`Failed to load attachments for ${profileId}:`, error);
            return { images: [], videos: [], audios: [] };
        }
    },

    async startProcessing(profileId, message, attachmentsList, token, operatorId = null) {
        if (processingProfiles.has(profileId)) {
            return;
        }

        // Store both message and attachments for syncing
        invites[profileId] = { message, attachments: attachmentsList };
        const controller = new AbortController();
        abortControllers.set(profileId, controller);
        processingProfiles.add(profileId);
        this.setProfileStatus(profileId, 'processing');

        // Start profile-specific online heartbeat
        // Use provided operatorId or extract from token
        const finalOperatorId = operatorId || this.extractOperatorIdFromToken(token) || 'default';
        authService.startProfileOnlineHeartbeat(profileId, finalOperatorId, token);

        // Start processing in a non-blocking way
        this.processMailsForProfile(profileId, message, attachmentsList, token, controller)
            .catch(error => {
                console.error(`Mail processing error for profile ${profileId}:`, error);
                this.setProfileStatus(profileId, `Error: ${error.message}`);
                this.cleanupProcessing(profileId);
            });
    },

    async processMailsForProfile(profileId, message, attachmentsList, token, controller) {
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

                // Filter out blocked recipients
                const filteredArray = allChats.filter(chat =>
                    !mailBlockLists[profileId]?.includes(chat.recipient_external_id)
                );

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

                // Debug logs
                console.log('[availableChats]:', availableChats.map(chat => chat.chat_uid));
                console.log('[blockList]:', mailBlockLists[profileId]);

                // Collect recipient IDs for batch send
                const recipientIds = [];
                const chatToRecipient = {};
                for (const chat of availableChats) {
                    const lastMessage = lastMessagesMap[chat.chat_uid];
                    const recipientId = this.getRecipientIdFromLastMessage(lastMessage, profileId);
                    console.log(`[processMailsForProfile] chat_uid: ${chat.chat_uid}, lastMessage:`, lastMessage, `recipientId:`, recipientId);
                    if (!recipientId) continue;
                    if (this.isBlocked(profileId, recipientId)) continue;
                    recipientIds.push(recipientId);
                    chatToRecipient[chat.chat_uid] = recipientId;
                }

                console.log('[recipientIds]:', recipientIds);

                if (recipientIds.length === 0) {
                    await this.delay(50000, controller.signal);
                    continue;
                }

                try {
                    const result = await this.sendMail(profileId, recipientIds, message, attachmentsList, token);

                    // Handle different response types
                    if (result.success) {
                        // All block list logic handled in sendMail
                    } else if (result.rateLimited) {
                        this.setProfileStatus(profileId, 'processing');
                        await this.delay(50000, controller.signal);
                        continue;
                    } else if (result.shouldStop) {
                        this.setProfileStatus(profileId, `Stopping due to: ${result.error}`);
                        return;
                    } else {
                        // Other error - skip this batch
                    }
                } catch (error) {
                    console.error(`Failed to send mail to batch:`, error);
                }

                // Normal delay between batches
                await this.delay(7000, controller.signal);
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

                console.log(`Fetching mail chats page ${page} for profile ${profileId}...`);

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
                            limits: 2,
                            ONLINE_STATUS: 1,
                            SEARCH: "",
                            CHAT_TYPE: "CHANCE"
                        }),
                        signal
                    });
                } catch (err) {
                    // Network or timeout error (e.g., 524)
                    console.error(`Network error or timeout fetching mail chats for profile ${profileId}:`, err);
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
                    console.log(`No more mail chats found at page ${page}. Total fetched: ${allChats.length}`);
                    break;
                }

                allChats.push(...pageChats);
                console.log(`Fetched ${pageChats.length} mail chats from page ${page}. Total: ${allChats.length}`);
                page++;
            }

            return allChats;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            console.error('Failed to fetch all mail chats:', error);
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

    // Utility to extract recipient ID from last message
    getRecipientIdFromLastMessage(lastMessage, profileId) {
        if (!lastMessage) {
            console.log('[getRecipientIdFromLastMessage] No lastMessage provided');
            return null;
        }
        if (lastMessage.message_type === 'NO_CHAT') {
            console.log(`[getRecipientIdFromLastMessage] Skipping NO_CHAT for chat_uid: ${lastMessage.chat_uid}`);
            return null;
        }
        const recipientId = lastMessage.recipient_external_id === profileId
            ? lastMessage.sender_external_id
            : lastMessage.recipient_external_id;
        console.log(`[getRecipientIdFromLastMessage] chat_uid: ${lastMessage.chat_uid}, profileId: ${profileId}, sender_external_id: ${lastMessage.sender_external_id}, recipient_external_id: ${lastMessage.recipient_external_id}, extracted recipientId: ${recipientId}`);
        return recipientId;
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

    async sendMail(profileId, recipientIds, message, attachments, token) {
        // Format attachments according to API requirements
        const formattedAttachments = attachments.map(attachment => {
            if (!attachment || !attachment.filename || !attachment.link) {
                console.warn('Invalid attachment:', attachment);
                return null;
            }

            const baseAttachment = {
                title: attachment.filename,
                link: attachment.link,
                message_type: attachment.content_type === 'image' ? 'SENT_IMAGE' :
                    attachment.content_type === 'video' ? 'SENT_VIDEO' :
                        'SENT_AUDIO'
            };

            // Add id only for videos
            if (attachment.content_type === 'video' && attachment.id) {
                baseAttachment.id = attachment.id;
            }

            return baseAttachment;
        }).filter(attachment => attachment !== null); // Remove any invalid attachments

        try {
            const payload = {
                user_id: profileId,
                recipients: recipientIds, // now an array
                message_content: message,
                message_type: "SENT_TEXT",
                attachments: formattedAttachments,
                parent_mail_id: null,
                is_send_email: false
            };

            const mailResponse = await fetch('https://alpha.date/api/mailbox/mail', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const mailData = await mailResponse.json();
            const hasRestrictionError = (blockReason) => blockReason.reason === "Restriction of sending a personal letter. Try when the list becomes active";

            if (mailResponse.ok) {
                console.log('[MAIL RESPONSE: ', mailData)
            }

            // Handle different HTTP status codes
            if (mailResponse.status === 429) {
                // Rate limited - return signal to wait and retry
                return {
                    success: false,
                    rateLimited: true,
                    error: 'Rate limited'
                };
            }

            if (mailResponse.status === 401) {
                // Fatal error - terminate session
                console.error('401 Unauthorized in sendMail. Terminating session.');
                return {
                    success: false,
                    shouldStop: true,
                    error: '401 Unauthorized - terminating session'
                };
            }

            if (mailResponse.status === 524) {
                // Timeout - wait and retry
                console.error('524 Timeout in sendMail. Waiting and retrying...');
                await this.delay(50000);
                return await this.sendMail(profileId, recipientIds, message, attachments, token);
            }

            if (mailResponse.status === 400 || mailResponse.status === 401 || (mailData.error && mailData.error.toLowerCase() === "not your profile")) {
                // Fatal errors - stop processing entirely
                return {
                    success: false,
                    shouldStop: true,
                    error: `Fatal error: ${mailResponse.status} - ${mailData.error || mailResponse.statusText}`
                };
            }

            if (!mailResponse.ok) {
                // Other HTTP errors - skip this message but continue processing
                return {
                    success: false,
                    error: `HTTP ${mailResponse.status}: ${mailResponse.statusText}`
                };
            }

            // Response is OK - check for API-level errors
            // Add to block list all except those with restriction error
            const blockedExternalIds = (mailData.blocked_ids || []);
            const blockReasons = (mailData.blockReasons || []);
            const restrictionIds = new Set(
                blockReasons
                    .filter(hasRestrictionError)
                    .map(reason => reason.manExternalId)
            );

            // Add to block list all recipients except those with restriction error
            for (const recipientId of recipientIds) {
                if (!restrictionIds.has(String(recipientId))) {
                    this.addToBlockList(profileId, recipientId);
                }
            }

            // Increment global statistics
            if (global.incrementMailsSent) {
                global.incrementMailsSent();
            }
            
            return { success: true, message_id: mailData.message_id, blocked_ids: blockedExternalIds, blockReasons };

        } catch (error) {
            // Network or other errors
            return {
                success: false,
                error: error.message
            };
        }
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

    stopProcessing(profileId) {
        const controller = abortControllers.get(profileId);
        if (controller) controller.abort();
        processingProfiles.delete(profileId);
        
        // Stop profile-specific online heartbeat
        const operatorId = this.extractOperatorIdFromToken('default') || 'default';
        authService.stopProfileOnlineHeartbeat(profileId, operatorId);
    },

    clearBlocks(profileId) {
        delete mailBlockLists[profileId];
        this.setProfileStatus(profileId, 'Block list cleared');
    },

    setProfileStatus(profileId, message) {
        statusMessages[profileId] = message;
        console.log(`Mail profile ${profileId}: ${message}`);
    },

    getProcessingStatus(profileId) {
        return statusMessages[profileId] || 'Ready';
    },

    getProfileMessage(profileId) {
        // Return both message and attachments for syncing
        const invite = invites[profileId];
        if (typeof invite === 'object' && invite !== null && ('message' in invite || 'attachments' in invite)) {
            return invite;
        }
        // Backward compatibility: if only a string is stored
        return invite ? { message: invite, attachments: [] } : null;
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

    clearAttachmentsCache(profileId) {
        if (profileId) {
            attachmentsCache.delete(profileId);
        } else {
            attachmentsCache.clear();
        }
    }
};

export default mailService;