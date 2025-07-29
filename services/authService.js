// services/authService.js
import fetch from 'node-fetch';

// Store intervals by operatorId
const onlineHeartbeatIntervals = {};

const authService = {
    async checkWhitelist(email) {
        try {
            // Fetch from both sources on every check
            const urls = [
                "https://firestore.googleapis.com/v1/projects/alpha-a4fdc/databases/(default)/documents/operator_whitelist",
                "https://firestore.googleapis.com/v1/projects/alpha-date-sender/databases/(default)/documents/operator_whitelist"
            ];
            let allEmails = [];
            for (const url of urls) {
                const response = await fetch(url);
                const data = await response.json();
                const emails = data.documents?.[0]?.fields?.email?.arrayValue?.values?.map(item =>
                    item.stringValue.toLowerCase()
                ) || [];
                allEmails = allEmails.concat(emails);
            }
            // Deduplicate
            const whitelistedEmails = Array.from(new Set(allEmails));

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
    },

    startOperatorOnlineHeartbeat(operatorId, token) {
        if (!operatorId || !token) return;
        // Clear any existing interval for this operator
        if (onlineHeartbeatIntervals[operatorId]) {
            clearInterval(onlineHeartbeatIntervals[operatorId]);
        }
        // Immediately send online status
        this.sendOnlineStatus(operatorId, token);
        // Set up periodic heartbeat every 1m50s (110,000 ms)
        onlineHeartbeatIntervals[operatorId] = setInterval(() => {
            this.sendOnlineStatus(operatorId, token);
        }, 110000);
    },

    stopOperatorOnlineHeartbeat(operatorId) {
        if (onlineHeartbeatIntervals[operatorId]) {
            clearInterval(onlineHeartbeatIntervals[operatorId]);
            delete onlineHeartbeatIntervals[operatorId];
        }
    }

};

export default authService;