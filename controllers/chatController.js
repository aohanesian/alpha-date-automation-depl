// Modified chatController.js
import express from 'express';
import chatService from '../services/chatService.js';

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
        return next();
    }
    
    // Fallback to session token
    if (req.session && req.session.token) {
        req.token = req.session.token;
        return next();
    }
    
    req.token = null;
    next();
}

// Apply token extraction middleware to all routes
router.use(extractToken);

// Get profiles for chat automation
router.get('/profiles', async (req, res) => {
    try {
        if (!req.token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Not authenticated - no token provided'
            });
        }

        const profiles = await chatService.getProfiles(req.token);
        res.json({ success: true, profiles });
    } catch (error) {
        console.error('Get profiles error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Start chat processing for a profile
router.post('/start', async (req, res) => {
    try {
        const { profileId, messageTemplate } = req.body;
        
        if (!req.token || !profileId || !messageTemplate) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required data'
            });
        }

        chatService.startProfileProcessing(profileId, messageTemplate, req.token, req.sessionID);
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
        chatService.stopProfileProcessing(profileId, req.sessionID);
        res.json({ success: true, message: 'Processing stopped' });
    } catch (error) {
        console.error('Stop chat processing error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get status for a profile
router.get('/status/:profileId', (req, res) => {
    try {
        const { profileId } = req.params;
        const status = chatService.getProfileStatus(profileId, req.sessionID);
        res.json({ success: true, status });
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Clear blocks for a profile
router.post('/clear-blocks', (req, res) => {
    try {
        const { profileId } = req.body;
        chatService.clearBlocks(profileId);
        res.json({ success: true, message: 'Block list cleared' });
    } catch (error) {
        console.error('Clear blocks error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;