// services/authService.js
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Store intervals by operatorId and profileId
const onlineHeartbeatIntervals = {};
const profileOnlineIntervals = new Map(); // Track individual profile online status
const processingProfiles = new Set(); // Track which profiles are currently processing

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

    async sendOnlineStatus(operatorId, token, profileId = null) {
        try {
            // If no profileId provided, use the old behavior for backward compatibility
            if (!profileId) {
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
            }

            // New behavior: send online status for specific profile
            const payload = {
                external_id: profileId.toString(),
                operator_id: operatorId,
                status: 1
            };

            console.log(`[ONLINE STATUS] Sending online status for profile ${profileId}, operator ${operatorId}`);

            const response = await fetch('https://alpha.date/api/operator/setProfileOnline', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to send online status for profile ${profileId}: ${response.statusText}`);
            }

            console.log(`[ONLINE STATUS] Successfully sent online status for profile ${profileId}`);
            return true;
        } catch (error) {
            console.error(`[ONLINE STATUS] Error sending online status for profile ${profileId}:`, error);
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
    },

    // New methods for profile-specific online status
    startProfileOnlineHeartbeat(profileId, operatorId, token) {
        if (!profileId || !operatorId || !token) return;
        
        const intervalKey = `${profileId}-${operatorId}`;
        
        // Clear any existing interval for this profile
        if (profileOnlineIntervals.has(intervalKey)) {
            clearInterval(profileOnlineIntervals.get(intervalKey));
        }
        
        // Add to processing profiles set
        processingProfiles.add(profileId);
        
        // Immediately send online status
        this.sendOnlineStatus(operatorId, token, profileId);
        
        // Set up periodic heartbeat every 1m50s (110,000 ms)
        const interval = setInterval(() => {
            // Only send if profile is still processing
            if (processingProfiles.has(profileId)) {
                this.sendOnlineStatus(operatorId, token, profileId);
            } else {
                // Stop heartbeat if profile is no longer processing
                this.stopProfileOnlineHeartbeat(profileId, operatorId);
            }
        }, 110000);
        
        profileOnlineIntervals.set(intervalKey, interval);
        console.log(`[ONLINE STATUS] Started online heartbeat for profile ${profileId}, operator ${operatorId}`);
    },

    stopProfileOnlineHeartbeat(profileId, operatorId) {
        const intervalKey = `${profileId}-${operatorId}`;
        
        if (profileOnlineIntervals.has(intervalKey)) {
            clearInterval(profileOnlineIntervals.get(intervalKey));
            profileOnlineIntervals.delete(intervalKey);
            console.log(`[ONLINE STATUS] Stopped online heartbeat for profile ${profileId}, operator ${operatorId}`);
        }
        
        // Remove from processing profiles set
        processingProfiles.delete(profileId);
    },

    // Method to check if a profile is currently processing
    isProfileProcessing(profileId) {
        return processingProfiles.has(profileId);
    },

    // Method to get all currently processing profiles
    getProcessingProfiles() {
        return Array.from(processingProfiles);
    },

    async authenticateWithAlphaDate(email, password) {
        try {
            console.log('[INFO] Attempting to authenticate with Alpha.Date API: https://alpha.date/api/login/login');
            
            const response = await fetch('https://alpha.date/api/login/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin'
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const contentType = response.headers.get('content-type') || '';
            const responseStatus = response.status;

            console.log(`[INFO] Response status: ${responseStatus}, Content-Type: ${contentType}`);

            // Get response body as text first
            const responseText = await response.text();

            // Check for Cloudflare challenge indicators
            const isCloudflareChallenge = this.detectCloudflareChallenge(responseStatus, contentType, responseText);

            if (isCloudflareChallenge) {
                console.log('[ERROR] Cloudflare challenge detected');
                
                // Save the challenge page
                const challengeFile = await this.saveCloudflareChallenge(responseText, email);
                
                console.log(`[ERROR] Challenge page saved to: ${challengeFile}`);

                return {
                    success: false,
                    isCloudflareChallenge: true,
                    status: responseStatus,
                    contentType: contentType,
                    challengeFile: challengeFile,
                    message: 'Cloudflare protection detected'
                };
            }

            // Check if response is OK
            if (!response.ok) {
                console.log(`[ERROR] Authentication failed with status: ${responseStatus}`);
                return {
                    success: false,
                    isCloudflareChallenge: false,
                    status: responseStatus,
                    message: `Authentication failed: ${response.statusText}`
                };
            }

            // Try to parse JSON response
            let loginData;
            try {
                loginData = JSON.parse(responseText);
            } catch (parseError) {
                console.log('[ERROR] Failed to parse response as JSON');
                return {
                    success: false,
                    isCloudflareChallenge: false,
                    message: 'Invalid response format from Alpha.Date'
                };
            }

            // Validate required fields in response
            if (!loginData.token) {
                console.log('[ERROR] No token in response');
                return {
                    success: false,
                    isCloudflareChallenge: false,
                    message: 'No authentication token received'
                };
            }

            console.log('[INFO] Alpha.Date authentication successful');

            return {
                success: true,
                token: loginData.token,
                operatorId: loginData.operator_id,
                message: 'Authentication successful'
            };

        } catch (error) {
            console.error('[ERROR] Alpha.Date authentication error:', error);
            return {
                success: false,
                isCloudflareChallenge: false,
                message: `Network error: ${error.message}`
            };
        }
    },

    detectCloudflareChallenge(status, contentType, responseBody) {
        // Check status code
        if (status === 403) {
            // Check content type
            if (contentType.includes('text/html')) {
                // Check for Cloudflare challenge indicators in the response body
                const cloudflareIndicators = [
                    'Just a moment...',
                    'cf-mitigated',
                    'cloudflare',
                    'DDoS protection',
                    'ray id',
                    'cf-ray',
                    'checking your browser',
                    'enable javascript',
                    'cf-browser-verification'
                ];

                const bodyLower = responseBody.toLowerCase();
                const hasCloudflareIndicator = cloudflareIndicators.some(indicator => 
                    bodyLower.includes(indicator.toLowerCase())
                );

                if (hasCloudflareIndicator) {
                    return true;
                }
            }
        }

        return false;
    },

    async saveCloudflareChallenge(responseBody, email) {
        try {
            // Create challenges directory if it doesn't exist
            const challengesDir = path.join(process.cwd(), 'cloudflare-challenges');
            if (!fs.existsSync(challengesDir)) {
                fs.mkdirSync(challengesDir, { recursive: true });
            }

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
            const filename = `cloudflare-challenge-${email.replace('@', '_at_')}-${timestamp}.html`;
            const filepath = path.join(challengesDir, filename);

            // Save the challenge page
            fs.writeFileSync(filepath, responseBody, 'utf8');

            console.log(`[INFO] Cloudflare challenge page saved: ${filepath}`);

            return filepath;
        } catch (error) {
            console.error('[ERROR] Failed to save Cloudflare challenge page:', error);
            return null;
        }
    }

};

export default authService;