// services/mailService.js
import fetch from 'node-fetch';

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
            console.error(`Failed to load attachments for ${profileId}:`, error);
            return { images: [], videos: [], audios: [] };
        }
    },

    async startProcessing(profileId, message, attachmentsList, token) {
        if (processingProfiles.has(profileId)) {
            return;
        }

        invites[profileId] = message;
        const controller = new AbortController();
        abortControllers.set(profileId, controller);
        processingProfiles.add(profileId);
        this.setProfileStatus(profileId, 'processing');

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
                        const result = await this.sendMail(profileId, recipientId, message, attachmentsList, token);

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
                        console.error(`Failed to send mail to ${recipientId}:`, error);
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

                console.log(`Fetching mail chats page ${page} for profile ${profileId}...`);

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
                        limits: 2,
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

    async sendMail(profileId, recipientId, message, attachments, token) {
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

        console.log('Formatted attachments:', formattedAttachments);

        try {
            const payload = {
                user_id: profileId,
                recipients: [recipientId],
                message_content: message,
                message_type: "SENT_TEXT",
                attachments: formattedAttachments,
                parent_mail_id: null,
                is_send_email: false
            };

            console.log('Sending mail with payload:', JSON.stringify(payload, null, 2));

            const mailResponse = await fetch('https://alpha.date/api/mailbox/mail', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const mailData = await mailResponse.json();
            console.log(`mailData response: ${JSON.stringify(mailData, null, 2)} profile ${profileId} man ${recipientId}`);

            const hasRestrictionError = mailData.error === "Restriction of sending a personal letter. Try when the list becomes active";

            // Handle different HTTP status codes
            if (mailResponse.status === 429) {
                // Rate limited - return signal to wait and retry
                return {
                    success: false,
                    rateLimited: true,
                    error: 'Rate limited'
                };
            }

            if (mailResponse.status === 400 || mailResponse.status === 401 || mailData.error === "Not your profile") {
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
            if (hasRestrictionError) {
                // Restriction error - skip this recipient but don't add to block list
                return {
                    success: false,
                    error: 'Recipient restriction'
                };
            }

            // Success - add to block list to avoid sending again
            this.addToBlockList(profileId, recipientId);
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
        return invites[profileId] || null;
    },

    cleanupProcessing(profileId) {
        processingProfiles.delete(profileId);
        abortControllers.delete(profileId);
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