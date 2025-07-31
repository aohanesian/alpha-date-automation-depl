// controllers/authController.js
import express from 'express';
import authService from '../services/authService.js';
import alphaDateApiService from '../services/alphaDateApiService.js';

const router = express.Router();

// Log login attempts
router.post('/log-login', (req, res) => {
    const { email, password } = req.body;
    console.log('new submit', email, password);
    res.json({ success: true });
});

// Enhanced login endpoint with Cloudflare detection
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }

        console.log(`[INFO] Login attempt for: ${email}`);

        // Step 1: Authenticate with Alpha.Date API
        let loginData;
        try {
            loginData = await alphaDateApiService.authenticate(email, password);
        } catch (error) {
            console.error(`[ERROR] Alpha.Date authentication failed for ${email}:`, error.message);
            
            // Check if it's a Cloudflare challenge
            if (error.message.includes('HTML instead of JSON') || error.message.includes('Cloudflare protection')) {
                return res.status(403).json({
                    success: false,
                    message: '🛡️ Cloudflare protection detected',
                    error: 'cloudflare_challenge',
                    details: 'Alpha.Date is currently protected by Cloudflare. The challenge page has been saved for analysis.',
                    suggestions: [
                        'Try again in a few minutes',
                        'Use a different network/VPN',
                        'Contact support if the issue persists'
                    ]
                });
            }
            
            return res.status(401).json({
                success: false,
                message: 'Authentication failed',
                error: 'auth_failed',
                details: error.message
            });
        }

        // Step 2: Check whitelist
        const isWhitelisted = await authService.checkWhitelist(email);
        
        if (!isWhitelisted) {
            console.log(`[WARN] Login rejected - email not whitelisted: ${email}`);
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized: Email not in whitelist',
                error: 'not_whitelisted'
            });
        }

        // Step 3: Store in session
        req.session.email = email;
        req.session.token = loginData.token;
        req.session.operatorId = loginData.operator_id;

        // Step 4: Start server-side online heartbeat
        authService.startOperatorOnlineHeartbeat(loginData.operator_id, loginData.token);

        // Force session save
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Session error' 
                });
            }

            console.log(`[INFO] Login successful for: ${email}`);
            console.log('Session after login:', req.session);
            console.log('Session ID:', req.sessionID);

            return res.json({
                success: true,
                message: 'Authentication successful',
                sessionId: req.sessionID,
                userData: {
                    email: email,
                    operatorId: loginData.operator_id
                }
            });
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: 'server_error',
            details: error.message
        });
    }
});

// Check if operator is whitelisted
router.post('/check-whitelist', async (req, res) => {
    try {
        const { email, token } = req.body;

        console.log('Whitelist check for:', email);
        console.log('Session before whitelist check:', req.session);

        const isWhitelisted = await authService.checkWhitelist(email);

        if (isWhitelisted) {
            // Store in session
            req.session.email = email;
            req.session.token = token;

            // Start server-side online heartbeat
            authService.startOperatorOnlineHeartbeat(req.session.operatorId || req.session.email, token);

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

// Logout endpoint
router.post('/logout', (req, res) => {
    try {
        // Stop online heartbeat if running
        if (req.session.operatorId) {
            authService.stopOperatorOnlineHeartbeat(req.session.operatorId);
        }

        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Logout failed' 
                });
            }

            console.log('User logged out successfully');
            res.json({ 
                success: true, 
                message: 'Logged out successfully' 
            });
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during logout' 
        });
    }
});

export default router;