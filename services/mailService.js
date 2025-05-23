// services/mailService.js
import fetch from 'node-fetch';

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

    async getAttachments(profileId, token) {
        if (attachmentsCache.has(profileId)) {
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

        const controller = new AbortController();
        abortControllers.set(profileId, controller);
        processingProfiles.add(profileId);
        this.setProfileStatus(profileId, 'Starting...');

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
                this.setProfileStatus(profileId, 'Fetching all available chats...');
                const allChats = await this.fetchAllChanceChats(profileId, token, controller.signal);

                if (controller.signal.aborted) break;

                if (allChats.length === 0) {
                    this.setProfileStatus(profileId, 'No chats found. Waiting before retry...');
                    await this.delay(5000, controller.signal);
                    continue;
                }

                // Filter out blocked recipients
                const availableChats = allChats.filter(chat =>
                    !mailBlockLists[profileId]?.includes(chat.recipient_external_id)
                );

                if (availableChats.length === 0) {
                    this.setProfileStatus(profileId, `All ${allChats.length} chats are blocked. Waiting before retry...`);
                    await this.delay(5000, controller.signal);
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

                    const recipientId = await this.getRecipientId(chat.chat_uid, token);

                    if (!recipientId) {
                        skipped++;
                        continue;
                    }

                    if (this.isBlocked(profileId, recipientId)) {
                        skipped++;
                        continue;
                    }

                    try {
                        await this.sendMail(profileId, recipientId, message, attachmentsList, token);
                        sent++;
                        this.addToBlockList(profileId, recipientId);
                    } catch (error) {
                        console.error(`Failed to send mail to ${recipientId}:`, error);
                        this.setProfileStatus(profileId, `Error sending to ${recipientId}: ${error.message}`);
                    }

                    await this.delay(9000, controller.signal);
                }

                this.setProfileStatus(profileId, `Completed cycle: ${sent} sent, ${skipped} skipped. Waiting before next cycle...`);
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

    async getRecipientId(chatUid, token) {
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
            return data.response?.[0]?.recipient_external_id;
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

        // Step 3: Delete draft after mail is sent
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

    cleanupProcessing(profileId) {
        processingProfiles.delete(profileId);
        abortControllers.delete(profileId);
    }
};

export default mailService;