// controllers/authController.js
import express from 'express';
import authService from '../services/authService.js';

const router = express.Router();

// Check if operator is whitelisted
router.post('/check-whitelist', async (req, res) => {
    try {
        const { email, token } = req.body;

        console.log('Whitelist check for:', email);
        console.log('Session before whitelist check:', req.session);

        const isWhitelisted = await authService.checkWhitelist(email);

        if (isWhitelisted) {
            // Store in session
            req.session.operatorId = loginData.operator_id;
            req.session.email = email;
            req.session.token = token;
            req.session.userAgent = req.headers['user-agent'];

            // Force session save
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).json({ success: false, message: 'Session error' });
                }

                console.log('Session after whitelist check:', req.session);
                console.log('Session ID:', req.sessionID);

                return res.json({
                    success: true,
                    message: 'Authentication successful',
                    sessionId: req.sessionID
                });
            });
        } else {
            res.status(403).json({ success: false, message: 'Not authorized' });
        }
    } catch (error) {
        console.error('Whitelist check error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update operator's online status
router.post('/online-status', async (req, res) => {
    try {
        const { operatorId, token } = req.body;

        console.log('Online status update for operator:', operatorId);
        console.log('Session in online-status:', req.session);

        if (!operatorId) {
            return res.status(400).json({ success: false, message: 'Missing operator ID' });
        }

        // Use token from request body as fallback, but prefer session token
        const authToken = req.session.token || token;

        if (!authToken) {
            return res.status(401).json({ success: false, message: 'No authentication token' });
        }

        await authService.sendOnlineStatus(operatorId, authToken);
        res.json({ success: true });
    } catch (error) {
        console.error('Online status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Check session status (optional endpoint for debugging)
router.get('/session-check', (req, res) => {
    res.json({
        success: true,
        hasSession: !!req.session,
        sessionId: req.sessionID,
        hasToken: !!req.session.token,
        hasEmail: !!req.session.email,
        sessionData: {
            email: req.session.email || 'not set',
            tokenPresent: !!req.session.token
        }
    });
});

export default router;