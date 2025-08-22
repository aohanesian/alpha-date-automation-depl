// Modified chatController.js
import express from 'express';
import chatService from '../services/chatService.js';
import browserSessionManager from '../services/browserSessionManager.js';
import sessionAwareService from '../services/sessionAwareService.js';

const router = express.Router();

// Middleware to extract token from header or session
function extractToken(req, res, next) {
    // Try to get token from Authorization header first
    const authHeader = req.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        req.token = authHeader.substring(7);
        return next();
    }
    
    // Try to get token from custom header
    const customToken = req.get('X-Auth-Token');
    if (customToken) {
        req.token = customToken;
        console.log('Token from X-Auth-Token header:', req.token);
        return next();
    }
    
            // Try to get session token from X-Session-Token header
        const sessionToken = req.get('X-Session-Token');
        if (sessionToken) {
            // Look up session by ID and extract token
            req.sessionStore.get(sessionToken, (err, sessionData) => {
                if (!err && sessionData && sessionData.token) {
                    req.token = sessionData.token;
                    req.userEmail = sessionData.email;
                    req.operatorId = sessionData.operatorId;
                    // Also set session email for browser session lookup
                    req.session.email = sessionData.email;
                    console.log('Token from session store:', req.token, 'OperatorId:', req.operatorId, 'Email:', req.userEmail);
                    return next();
                } else {
                    console.log('Session token not found or expired:', sessionToken);
                    req.token = null;
                    next();
                }
            });
            return;
        }
    
    // Fallback to current session token
    if (req.session && req.session.token) {
        req.token = req.session.token;
        req.operatorId = req.session.operatorId;
        req.userEmail = req.session.email;
        console.log('Token from current session:', req.token, 'OperatorId:', req.operatorId, 'Email:', req.userEmail);
        return next();
    }
    
    console.log('No token found in headers or session');
    req.token = null;
    next();
}

// Apply token extraction middleware to all routes
router.use(extractToken);

// Get profiles for chat automation
router.get('/profiles', async (req, res) => {
    try {
        console.log('Chat profiles request - Token present:', !!req.token);
        
        if (!req.token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Not authenticated - no token provided',
                debug: {
                    hasSession: !!req.session,
                    sessionId: req.sessionID,
                    authHeader: req.get('Authorization'),
                    customHeader: req.get('X-Auth-Token')
                }
            });
        }

        // Try to get profiles using browser session first
        let profiles = null;
        
        // Try to find browser session by session ID or email
        const email = req.userEmail || req.session.email;
        console.log(`[CHAT] Looking for browser session for email: ${email}`);
        
        if (req.session.browserSession && req.session.browserSession.hasBrowserSession) {
            console.log('[CHAT] Attempting to get profiles using browser session...');
            profiles = await browserSessionManager.makeApiCall(
                req.sessionID, 
                'https://alpha.date/api/operator/profiles',
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${req.token}` }
                },
                email
            );
        }
        
        // Fallback to direct API call if browser session failed
        if (!profiles) {
            console.log('[CHAT] Falling back to direct API call for profiles...');
            const browserSession = sessionAwareService.getBrowserSession(req.sessionID, email);
            profiles = await chatService.getProfiles(req.token, browserSession);
        }
        res.json({ success: true, profiles });
    } catch (error) {
        console.error('Get profiles error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Start chat processing for a profile
router.post('/start', async (req, res) => {
    try {
        const { profileId, messageTemplate, attachment } = req.body;
        
        console.log('Chat start request - Token present:', !!req.token);

        if (!req.token || !profileId || !(messageTemplate || attachment)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required data',
                details: {
                    hasToken: !!req.token,
                    hasProfileId: !!profileId,
                    hasMessageTemplate: !!messageTemplate,
                    hasAttachment: !!attachment
                }
            });
        }

        // Get browser session for this request
        const email = req.session.email;
        const browserSession = sessionAwareService.getBrowserSession(req.sessionID, email);
        
        // Start chat processing in the background (non-blocking)
        chatService.startProfileProcessing(profileId, messageTemplate, req.token, attachment, req.operatorId, browserSession);

        res.json({ success: true, message: 'Processing started' });
    } catch (error) {
        console.error('Start chat processing error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Stop chat processing for a profile
router.post('/stop', (req, res) => {
    try {
        const { profileId } = req.body;
        chatService.stopProfileProcessing(profileId);
        res.json({ success: true, message: 'Processing stopped' });
    } catch (error) {
        console.error('Stop chat processing error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Clear block list for a profile
router.post('/clear-blocks', (req, res) => {
    try {
        const { profileId } = req.body;
        chatService.clearProfileBlockList(profileId);
        res.json({ success: true, message: 'Block list cleared' });
    } catch (error) {
        console.error('Clear blocks error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get chat processing status
router.get('/status/:profileId', (req, res) => {
    try {
        const { profileId } = req.params;
        const status = chatService.getProfileStatus(profileId);
        const invite = chatService.getProfileMessage(profileId)
        res.json({ success: true, status, invite });
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get attachments for a profile (for chat)
router.get('/attachments/:profileId', async (req, res) => {
    try {
        const { profileId } = req.params;
        const { forceRefresh } = req.query;
        const token = req.token;

        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        // Get browser session for this request
        const email = req.session.email;
        const browserSession = sessionAwareService.getBrowserSession(req.sessionID, email);
        
        const attachments = await chatService.getAttachments(profileId, token, forceRefresh === 'true', browserSession);
        res.json({ success: true, attachments });
    } catch (error) {
        console.error('Get chat attachments error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;