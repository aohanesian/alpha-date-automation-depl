// controllers/chatController.js
import express from 'express';
import chatService from '../services/chatService.js';

const router = express.Router();

// Get profiles for chat automation
router.get('/profiles', async (req, res) => {
    try {
        const token = req.session.token;
        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const profiles = await chatService.getProfiles(token);
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
        const token = req.session.token;

        if (!token || !profileId || !messageTemplate) {
            return res.status(400).json({ success: false, message: 'Missing required data' });
        }

        // Start chat processing in the background (non-blocking)
        chatService.startProfileProcessing(profileId, messageTemplate, token);

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
        res.json({ success: true, status });
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;