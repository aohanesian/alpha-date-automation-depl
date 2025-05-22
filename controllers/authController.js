// controllers/authController.js
import express from 'express';
import authService from '../services/authService.js';

const router = express.Router();

// Check if operator is whitelisted
router.post('/check-whitelist', async (req, res) => {
    try {
        const { email, token } = req.body;
        const isWhitelisted = await authService.checkWhitelist(email);
        
        if (isWhitelisted) {
            req.session.email = email;
            req.session.token = token;
            return res.json({ success: true });
        }

        res.status(403).json({ success: false, message: 'Not authorized' });
    } catch (error) {
        console.error('Whitelist check error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update operator's online status
router.post('/online-status', async (req, res) => {
    try {
        const { operatorId, token } = req.body;
        // const token = req.session.token;

        if (!token || !operatorId) {
            return res.status(400).json({ success: false, message: 'Missing required data' });
        }

        await authService.sendOnlineStatus(operatorId, token);
        res.json({ success: true });
    } catch (error) {
        console.error('Online status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;