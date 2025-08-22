// services/browserSessionManager.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Apply the stealth plugin
puppeteer.use(StealthPlugin());

// Store browser sessions by session ID and email
const browserSessions = new Map();
const browserSessionsByEmail = new Map();

const browserSessionManager = {
    // Store a browser session
    storeSession(sessionId, browserSession, email = null) {
        browserSessions.set(sessionId, browserSession);
        if (email) {
            browserSessionsByEmail.set(email, browserSession);
        }
        console.log(`[BROWSER SESSION] Stored session for: ${sessionId}${email ? ` (${email})` : ''}`);
    },

    // Get a browser session
    getSession(sessionId, email = null) {
        let session = browserSessions.get(sessionId);
        
        // If not found by session ID, try by email
        if (!session && email) {
            session = browserSessionsByEmail.get(email);
            if (session) {
                console.log(`[BROWSER SESSION] Retrieved session by email: ${email}`);
            }
        }
        
        if (session) {
            console.log(`[BROWSER SESSION] Retrieved session for: ${sessionId}`);
        }
        return session;
    },

    // Remove a browser session
    removeSession(sessionId) {
        const session = browserSessions.get(sessionId);
        if (session) {
            // Close the browser
            if (session.browser) {
                session.browser.close().catch(console.error);
            }
            browserSessions.delete(sessionId);
            console.log(`[BROWSER SESSION] Removed session for: ${sessionId}`);
        }
    },

    // Make API call using browser session
    async makeApiCall(sessionId, url, options = {}, email = null) {
        const session = this.getSession(sessionId, email);
        if (!session || !session.page) {
            console.log('[BROWSER SESSION] No browser session available, falling back to direct API call');
            return null;
        }

        try {
            console.log(`[BROWSER SESSION] Making API call from browser: ${url}`);
            
            const result = await session.page.evaluate(async (url, options) => {
                try {
                    const response = await fetch(url, {
                        method: options.method || 'GET',
                        headers: options.headers || {},
                        body: options.body ? JSON.stringify(options.body) : undefined
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const data = await response.json();
                    return { success: true, data };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }, url, options);

            if (result.success) {
                console.log('[BROWSER SESSION] API call successful from browser');
                return result.data;
            } else {
                console.error('[BROWSER SESSION] API call failed from browser:', result.error);
                return null;
            }
        } catch (error) {
            console.error('[BROWSER SESSION] Error making API call from browser:', error);
            return null;
        }
    },

    // Check if session exists and is valid
    hasValidSession(sessionId) {
        const session = browserSessions.get(sessionId);
        return session && session.browser && session.page;
    },

    // Get all active sessions (for debugging)
    getAllSessions() {
        return Array.from(browserSessions.keys());
    },

    // Clean up expired sessions
    cleanupSessions() {
        const now = Date.now();
        for (const [sessionId, session] of browserSessions.entries()) {
            // Close sessions older than 1 hour
            if (session.createdAt && (now - session.createdAt) > 3600000) {
                this.removeSession(sessionId);
            }
        }
    }
};

// Set up periodic cleanup
setInterval(() => {
    browserSessionManager.cleanupSessions();
}, 300000); // Every 5 minutes

export default browserSessionManager;
