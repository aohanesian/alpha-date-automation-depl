// services/authService.js
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import sharedChromeManager from './sharedChromeManager.js';

// Note: All browser session creation methods have been moved to sharedChromeManager

// Store intervals by profileId
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

    async sendOnlineStatus(operatorId, token, profileId, browserSession = null) {
        try {
            if (!profileId) {
                throw new Error('Profile ID is required for online status');
            }

            const payload = {
                external_id: profileId.toString(),
                operator_id: operatorId,
                status: 1
            };

            console.log(`[ONLINE STATUS] Sending online status for profile ${profileId}, operator ${operatorId}`);

            // Try browser session first if available
            if (browserSession && browserSession.userId) {
                try {
                    console.log('[ONLINE STATUS] Attempting to send online status via shared Chrome...');
                    const result = await sharedChromeManager.makeApiCall(
                        browserSession.userId,
                        'https://alpha.date/api/operator/setProfileOnline',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: payload
                        }
                    );
                    
                    if (result) {
                        console.log(`[ONLINE STATUS] Successfully sent online status for profile ${profileId} via shared Chrome`);
                        return true;
                    }
                } catch (browserError) {
                    console.log('[ONLINE STATUS] Shared Chrome failed, falling back to direct API call...');
                }
            }

            // Fallback to direct API call
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

            console.log(`[ONLINE STATUS] Successfully sent online status for profile ${profileId} via direct API`);
            return true;
        } catch (error) {
            console.error(`[ONLINE STATUS] Error sending online status for profile ${profileId}:`, error);
            throw error;
        }
    },

    // Legacy method - now deprecated in favor of profile-specific heartbeats
    startOperatorOnlineHeartbeat(operatorId, token) {
        console.warn('[DEPRECATED] startOperatorOnlineHeartbeat is deprecated. Use profile-specific heartbeats instead.');
        // This method is kept for backward compatibility but does nothing
        // Profile-specific heartbeats are now handled by startProfileOnlineHeartbeat
    },

    stopOperatorOnlineHeartbeat(operatorId) {
        console.warn('[DEPRECATED] stopOperatorOnlineHeartbeat is deprecated. Use profile-specific heartbeats instead.');
        // This method is kept for backward compatibility but does nothing
        // Profile-specific heartbeats are now handled by stopProfileOnlineHeartbeat
    },

    // New methods for profile-specific online status
    async startProfileOnlineHeartbeat(profileId, operatorId, token, browserSession = null) {
        if (!profileId || !operatorId || !token) return;
        
        const intervalKey = `${profileId}-${operatorId}`;
        
        // Clear any existing interval for this profile
        if (profileOnlineIntervals.has(intervalKey)) {
            clearInterval(profileOnlineIntervals.get(intervalKey));
        }
        
        // Add to processing profiles set
        processingProfiles.add(profileId);
        
        // Immediately send online status
        try {
            await this.sendOnlineStatus(operatorId, token, profileId, browserSession);
        } catch (error) {
            console.error(`[ONLINE STATUS] Initial heartbeat error for profile ${profileId}:`, error);
            // Don't throw - just log the error and continue
        }
        
        // Set up periodic heartbeat every 1m50s (110,000 ms)
        const interval = setInterval(async () => {
            // Only send if profile is still processing
            if (processingProfiles.has(profileId)) {
                try {
                    await this.sendOnlineStatus(operatorId, token, profileId, browserSession);
                } catch (error) {
                    console.error(`[ONLINE STATUS] Heartbeat error for profile ${profileId}:`, error);
                    // Don't throw - just log the error and continue
                }
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

    async authenticateWithAlphaDate(email, password, sessionId = null) {
        console.log(`[INFO] Attempting to authenticate with Alpha.Date using shared Chrome instance for user: ${email}`);
        
        try {
            // Create a user page in the shared Chrome instance
            const userId = sessionId || `user_${Date.now()}_${Math.random()}`;
            await sharedChromeManager.createUserPage(userId, email);
            
            // Authenticate using the shared Chrome instance
            const authResult = await sharedChromeManager.authenticateUser(userId, email, password);
            
            if (authResult.success) {
                console.log(`[INFO] Authentication successful for user: ${email}`);
                
                return {
                    success: true,
                    token: authResult.token,
                    operatorId: authResult.operatorId,
                    browserSession: {
                        userId: userId,
                        email: email,
                        token: authResult.token,
                        operatorId: authResult.operatorId,
                        method: authResult.method
                    },
                    message: `Authentication successful via ${authResult.method}`
                };
            } else {
                throw new Error(authResult.message || 'Authentication failed');
            }
            
        } catch (error) {
            console.error(`[ERROR] Authentication failed for user ${email}:`, error);
            return {
                success: false,
                message: error.message || 'Authentication failed'
            };
        }
    },

    // Helper method to make API calls using shared Chrome
    async makeApiCallFromSharedChrome(userId, url, options = {}) {
        try {
            return await sharedChromeManager.makeApiCall(userId, url, options);
        } catch (error) {
            console.error(`[API CALL] Failed to make API call for user ${userId}:`, error);
            return null;
        }
    },

    // Helper method to close user session
    async closeUserSession(userId) {
        try {
            await sharedChromeManager.closeUserSession(userId);
        } catch (error) {
            console.error(`[SESSION] Failed to close session for user ${userId}:`, error);
        }
    }
};

export default authService;

