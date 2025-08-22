// controllers/captchaController.js
import express from 'express';
import captchaService from '../services/captchaService.js';

const router = express.Router();

// Main captcha solving endpoint
router.post('/solve', async (req, res) => {
    try {
        const { url, email, password, timeout, headless, waitForManual } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'URL is required'
            });
        }

        console.log(`[CAPTCHA CONTROLLER] Solving captcha for URL: ${url}`);

        const result = await captchaService.solveCaptcha(url, {
            email: email || '',
            password: password || '',
            timeout: timeout || 300000, // 5 minutes default
            headless: headless || false,
            waitForManual: waitForManual !== false // default to true
        });

        if (result.success) {
            res.json({
                success: true,
                type: result.type,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                type: result.type,
                error: result.error,
                message: result.message || 'Captcha solving failed'
            });
        }

    } catch (error) {
        console.error('[CAPTCHA CONTROLLER] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Internal server error'
        });
    }
});

// Specific endpoint for Cloudflare challenges
router.post('/cloudflare', async (req, res) => {
    try {
        const { url, timeout, headless, waitForManual } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'URL is required'
            });
        }

        console.log(`[CAPTCHA CONTROLLER] Solving Cloudflare challenge for URL: ${url}`);

        const result = await captchaService.solveCaptcha(url, {
            timeout: timeout || 300000,
            headless: headless || false,
            waitForManual: waitForManual !== false
        });

        if (result.success && result.type === 'cloudflare') {
            res.json({
                success: true,
                type: 'cloudflare',
                message: 'Cloudflare challenge resolved successfully'
            });
        } else if (result.type === 'cloudflare') {
            res.status(400).json({
                success: false,
                type: 'cloudflare',
                error: result.error,
                message: 'Cloudflare challenge resolution failed'
            });
        } else {
            res.json({
                success: true,
                type: result.type,
                message: `No Cloudflare challenge detected. Found: ${result.type}`
            });
        }

    } catch (error) {
        console.error('[CAPTCHA CONTROLLER] Cloudflare error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Internal server error'
        });
    }
});

// Specific endpoint for hCaptcha
router.post('/hcaptcha', async (req, res) => {
    try {
        const { url, timeout, headless, waitForManual } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'URL is required'
            });
        }

        console.log(`[CAPTCHA CONTROLLER] Solving hCaptcha for URL: ${url}`);

        const result = await captchaService.solveCaptcha(url, {
            timeout: timeout || 300000,
            headless: headless || false,
            waitForManual: waitForManual !== false
        });

        if (result.success && result.type === 'hcaptcha') {
            res.json({
                success: true,
                type: 'hcaptcha',
                message: 'hCaptcha resolved successfully'
            });
        } else if (result.type === 'hcaptcha') {
            res.status(400).json({
                success: false,
                type: 'hcaptcha',
                error: result.error,
                message: 'hCaptcha resolution failed'
            });
        } else {
            res.json({
                success: true,
                type: result.type,
                message: `No hCaptcha detected. Found: ${result.type}`
            });
        }

    } catch (error) {
        console.error('[CAPTCHA CONTROLLER] hCaptcha error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Internal server error'
        });
    }
});

// Specific endpoint for reCAPTCHA
router.post('/recaptcha', async (req, res) => {
    try {
        const { url, timeout, headless, waitForManual } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'URL is required'
            });
        }

        console.log(`[CAPTCHA CONTROLLER] Solving reCAPTCHA for URL: ${url}`);

        const result = await captchaService.solveCaptcha(url, {
            timeout: timeout || 300000,
            headless: headless || false,
            waitForManual: waitForManual !== false
        });

        if (result.success && result.type === 'recaptcha') {
            res.json({
                success: true,
                type: 'recaptcha',
                message: 'reCAPTCHA resolved successfully'
            });
        } else if (result.type === 'recaptcha') {
            res.status(400).json({
                success: false,
                type: 'recaptcha',
                error: result.error,
                message: 'reCAPTCHA resolution failed'
            });
        } else {
            res.json({
                success: true,
                type: result.type,
                message: `No reCAPTCHA detected. Found: ${result.type}`
            });
        }

    } catch (error) {
        console.error('[CAPTCHA CONTROLLER] reCAPTCHA error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Internal server error'
        });
    }
});

// Endpoint to verify if a URL has any captcha
router.get('/verify', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'URL is required'
            });
        }

        console.log(`[CAPTCHA CONTROLLER] Verifying captcha for URL: ${url}`);

        const result = await captchaService.solveCaptcha(url, {
            timeout: 10000, // Short timeout for verification
            headless: true, // Use headless for verification
            waitForManual: false // Don't wait for manual input
        });

        res.json({
            success: true,
            found: result.type !== 'none',
            type: result.type,
            message: result.message
        });

    } catch (error) {
        console.error('[CAPTCHA CONTROLLER] Verification error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Internal server error'
        });
    }
});

// Endpoint to get captcha solving status
router.get('/status', async (req, res) => {
    try {
        res.json({
            success: true,
            status: 'ready',
            supportedTypes: ['cloudflare', 'hcaptcha', 'recaptcha', 'generic'],
            features: [
                'Manual captcha solving with browser window',
                'Automatic captcha detection',
                'Stealth mode to avoid bot detection',
                'Screenshot capture for debugging',
                'Multiple captcha type support'
            ]
        });
    } catch (error) {
        console.error('[CAPTCHA CONTROLLER] Status error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Internal server error'
        });
    }
});

export default router;
