// services/sessionAwareService.js
import browserSessionManager from './browserSessionManager.js';

const sessionAwareService = {
    // Get browser session for a given session ID or email
    getBrowserSession(sessionId, email = null) {
        return browserSessionManager.getSession(sessionId, email);
    },

    // Make API call using browser session if available
    async makeApiCall(sessionId, url, options = {}, email = null) {
        return await browserSessionManager.makeApiCall(sessionId, url, options, email);
    },

    // Check if browser session is available
    hasBrowserSession(sessionId, email = null) {
        return browserSessionManager.hasValidSession(sessionId) || 
               (email && browserSessionManager.getSession(null, email));
    },

    // Get all active sessions (for debugging)
    getAllSessions() {
        return browserSessionManager.getAllSessions();
    },

    // Remove a browser session
    removeSession(sessionId) {
        browserSessionManager.removeSession(sessionId);
    }
};

export default sessionAwareService;
