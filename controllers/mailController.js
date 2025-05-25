// controllers/mailController.js
import express from 'express';
import mailService from '../services/mailService.js';

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

// Get profiles for mail automation
router.get('/profiles', async (req, res) => {
    try {
        if (!req.token) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated - no token provided'
            });
        }

        const profiles = await mailService.getProfiles(req.token);
        res.json({ success: true, profiles });
    } catch (error) {
        console.error('Get mail profiles error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get attachments for a profile
router.get('/attachments/:profileId', async (req, res) => {
    try {
        const { profileId } = req.params;
        const { refresh } = req.query;
        const token = req.token;

        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const attachments = await mailService.getAttachments(profileId, token, refresh === 'true');
        res.json({ success: true, attachments });
    } catch (error) {
        console.error('Get attachments error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Start mail processing for a profile
router.post('/start', async (req, res) => {
    try {
        const { profileId, message, attachments } = req.body;

        if (!req.token || !profileId || !message) {
            return res.status(400).json({
                success: false,
                message: 'Missing required data'
            });
        }

        if (message.length <= 150) {
            return res.status(400).json({
                success: false,
                message: 'Message must be at least 150 characters'
            });
        }

        mailService.startProcessing(profileId, message, attachments || [], req.token, req.sessionID);
        res.json({ success: true, message: 'Processing started' });
    } catch (error) {
        console.error('Start mail processing error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Stop mail processing for a profile
router.post('/stop', (req, res) => {
    try {
        const { profileId } = req.body;
        mailService.stopProcessing(profileId, req.sessionID);
        res.json({ success: true, message: 'Processing stopped' });
    } catch (error) {
        console.error('Stop mail processing error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get status for a profile
router.get('/status/:profileId', (req, res) => {
    try {
        const { profileId } = req.params;
        const status = mailService.getProfileStatus(profileId, req.sessionID);
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
        mailService.clearBlocks(profileId);
        res.json({ success: true, message: 'Block list cleared' });
    } catch (error) {
        console.error('Clear blocks error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;