// controllers/puppeteerController.js
import express from 'express';
import puppeteerService from '../services/puppeteerService.js';

const router = express.Router();

// Initialize Puppeteer session with JWT token and cf_clearance
router.post('/init', async (req, res) => {
    try {
        const { token, cfClearance } = req.body;
        
        if (!token || !cfClearance) {
            return res.status(400).json({
                success: false,
                message: 'Token and cf_clearance are required'
            });
        }

        console.log('=== PUPPETEER CONTROLLER - INITIALIZING ===');
        console.log('Token provided:', !!token);
        console.log('cfClearance provided:', !!cfClearance);

        await puppeteerService.loginWithToken(token, cfClearance);
        
        res.json({
            success: true,
            message: 'Puppeteer session initialized successfully'
        });
    } catch (error) {
        console.error('=== PUPPETEER CONTROLLER - INIT FAILED ===', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize Puppeteer session',
            error: error.message
        });
    }
});

// Get profiles using Puppeteer
router.get('/profiles', async (req, res) => {
    try {
        console.log('=== PUPPETEER CONTROLLER - GETTING PROFILES ===');
        
        const profiles = await puppeteerService.getProfiles();
        
        res.json({
            success: true,
            profiles: profiles
        });
    } catch (error) {
        console.error('=== PUPPETEER CONTROLLER - GET PROFILES FAILED ===', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get profiles via Puppeteer',
            error: error.message
        });
    }
});

// Close Puppeteer session
router.post('/close', async (req, res) => {
    try {
        console.log('=== PUPPETEER CONTROLLER - CLOSING SESSION ===');
        
        await puppeteerService.close();
        
        res.json({
            success: true,
            message: 'Puppeteer session closed successfully'
        });
    } catch (error) {
        console.error('=== PUPPETEER CONTROLLER - CLOSE FAILED ===', error);
        res.status(500).json({
            success: false,
            message: 'Failed to close Puppeteer session',
            error: error.message
        });
    }
});

export default router;
