// controllers/mailController.js
import express from 'express';
import mailService from '../services/mailService.js';

const router = express.Router();

// Get profiles for mail automation
router.get('/profiles', async (req, res) => {
    try {
        const token = req.session.token;
        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const profiles = await mailService.getProfiles(token);
        res.json({ success: true, profiles });
    } catch (error) {
        console.error('Get profiles error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get attachments for a profile
router.get('/attachments/:profileId', async (req, res) => {
    try {
        const { profileId } = req.params;
        const token = req.session.token;

        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const attachments = await mailService.getAttachments(profileId, token);
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
        const token = req.session.token;

        if (!token || !profileId || !message) {
            return res.status(400).json({ success: false, message: 'Missing required data' });
        }

        if (message.length < 150) {
            return res.status(400).json({ success: false, message: 'Message must be at least 150 characters' });
        }

        // Start mail processing in the background (non-blocking)
        mailService.startProcessing(profileId, message, attachments, token);

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
        res.json({ success: true, status });
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;