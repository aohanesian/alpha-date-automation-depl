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
        console.log('Token from X-Auth-Token header:', req.token);
        return next();
    }

    // Fallback to session token
    if (req.session && req.session.token) {
        req.token = req.session.token;
        console.log('Token from session:', req.token);
        return next();
    }

    console.log('No token found in headers or session');
    req.token = null;
    next();
}

// Apply token extraction middleware to all routes
router.use(extractToken);

// Get profiles for mail automation
router.get('/profiles', async (req, res) => {
    try {
        console.log('Mail profiles request - Token present:', !!req.token);

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
        const { forceRefresh } = req.query;
        const token = req.token;

        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const attachments = await mailService.getAttachments(profileId, token, forceRefresh === 'true');
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
        const token = req.token;

        console.log('Mail start request received:', {
            body: req.body,
            tokenPresent: !!token,
            profileIdPresent: !!profileId,
            messagePresent: !!message,
            messageLength: message?.length || 0
        });

        // Validate required fields
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
                debug: {
                    headers: {
                        authorization: req.get('Authorization'),
                        xAuthToken: req.get('X-Auth-Token')
                    },
                    session: req.session
                }
            });
        }

        if (!profileId) {
            return res.status(400).json({
                success: false,
                message: 'profileId is required',
                receivedData: req.body
            });
        }

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'message is required',
                receivedData: req.body
            });
        }

        if (message.length < 150) {
            return res.status(400).json({
                success: false,
                message: 'Message must be at least 150 characters',
                receivedLength: message.length
            });
        }

        // Start processing
        mailService.startProcessing(profileId, message, attachments || [], token);

        res.json({
            success: true,
            message: 'Processing started',
            details: {
                profileId,
                messageLength: message.length,
                attachmentsCount: attachments?.length || 0
            }
        });
    } catch (error) {
        console.error('Start mail processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});

// Stop mail processing for a profile
router.post('/stop', (req, res) => {
    try {
        const { profileId } = req.body;
        mailService.stopProcessing(profileId);
        res.json({ success: true, message: 'Processing stopped' });
    } catch (error) {
        console.error('Stop mail processing error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Clear block list for a profile
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

// Get mail processing status
router.get('/status/:profileId', (req, res) => {
    try {
        const { profileId } = req.params;
        const status = mailService.getProcessingStatus(profileId);
        const invite = mailService.getProfileMessage(profileId);
        res.json({ success: true, status, invite });
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;