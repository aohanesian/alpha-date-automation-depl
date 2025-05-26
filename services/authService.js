// services/authService.js
import fetch from 'node-fetch';

// Cache for whitelisted emails
let whitelistedEmails = [];
let lastWhitelistFetch = 0;

const authService = {
    async checkWhitelist(email) {
        try {
            // Refresh whitelist every hour
            const currentTime = Date.now();
            if (currentTime - lastWhitelistFetch > 3600000 || whitelistedEmails.length === 0) {
                const response = await fetch("https://firestore.googleapis.com/v1/projects/alpha-a4fdc/databases/(default)/documents/operator_whitelist");
                const data = await response.json();
                whitelistedEmails = data.documents?.[0]?.fields?.email?.arrayValue?.values?.map(item =>
                    item.stringValue.toLowerCase()
                ) || [];
                lastWhitelistFetch = currentTime;
            }

            const additionalEmail = 'op1691868128@alpha.date';
            if (!whitelistedEmails.includes(additionalEmail)) {
                whitelistedEmails.push(additionalEmail);
            }

            return whitelistedEmails.includes(email.toLowerCase());
        } catch (error) {
            console.error('Whitelist check failed:', error);
            return false;
        }
    },

    async sendOnlineStatus(operatorId, token) {
        try {
            const payload = {
                external_id: -1,
                operator_id: operatorId,
                status: 1
            };

            const response = await fetch('https://alpha.date/api/operator/setProfileOnline', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to send online status: ${response.statusText}`);
            }

            return true;
        } catch (error) {
            console.error('Online status error:', error);
            throw error;
        }
    }

};

export default authService;