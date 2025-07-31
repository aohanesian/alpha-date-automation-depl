// controllers/authController.js
import express from 'express';
import jwt from 'jsonwebtoken';
import authService from '../services/authService.js';
import alphaDateApiService from '../services/alphaDateApiService.js';

const router = express.Router();

// Helper function to decode JWT token and extract email
function decodeJWTToken(token) {
    try {
        // JWT tokens have 3 parts separated by dots
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format');
        }

        // Decode the payload (second part)
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        
        console.log('JWT payload:', payload);
        
        // Look for email in common JWT fields
        const email = payload.email || payload.sub || payload.user_id || payload.userId;
        
        if (!email) {
            throw new Error('Email not found in JWT token');
        }
        
        return { email, payload };
    } catch (error) {
        console.error('JWT decode error:', error);
        throw new Error('Failed to decode JWT token: ' + error.message);
    }
}

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
            console.log('Session token stored:', !!req.session.token);
            console.log('Session token length:', req.session.token ? req.session.token.length : 0);

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
    console.log(`[DEBUG] Session check request:`);
    console.log(`[DEBUG] - Session ID: ${req.sessionID}`);
    console.log(`[DEBUG] - Has session: ${!!req.session}`);
    console.log(`[DEBUG] - Session data:`, req.session);
    console.log(`[DEBUG] - Has token: ${!!req.session?.token}`);
    console.log(`[DEBUG] - Has email: ${!!req.session?.email}`);
    console.log(`[DEBUG] - Token length: ${req.session?.token ? req.session.token.length : 0}`);
    
    res.json({
        success: true,
        hasSession: !!req.session,
        sessionId: req.sessionID,
        hasToken: !!req.session?.token,
        hasEmail: !!req.session?.email,
        sessionData: {
            email: req.session?.email || 'not set',
            tokenPresent: !!req.session?.token,
            tokenLength: req.session?.token ? req.session.token.length : 0
        }
    });
});

// JWT Login endpoint
router.post('/login-jwt', async (req, res) => {
    try {
        const { jwtToken } = req.body;

        if (!jwtToken) {
            return res.status(400).json({ 
                success: false, 
                message: 'JWT token is required' 
            });
        }

        console.log(`[INFO] JWT login attempt`);

        // Step 1: Decode JWT token to extract email
        let decodedEmail;
        try {
            const decoded = decodeJWTToken(jwtToken);
            decodedEmail = decoded.email;
            console.log(`[INFO] Email extracted from JWT: ${decodedEmail}`);
        } catch (error) {
            console.error(`[ERROR] JWT decode failed:`, error.message);
            return res.status(400).json({
                success: false,
                message: 'Invalid JWT token format',
                error: 'invalid_jwt_format',
                details: error.message
            });
        }

        // Step 2: Validate JWT token by testing it with Alpha.Date API
        try {
            const testResponse = await fetch('https://alpha.date/api/operator/profiles', {
                headers: { 
                    'Authorization': `Bearer ${jwtToken}`,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!testResponse.ok) {
                console.log(`[ERROR] JWT token validation failed for ${decodedEmail}: ${testResponse.status}`);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid JWT token',
                    error: 'invalid_jwt',
                    details: 'The provided JWT token is not valid or has expired'
                });
            }

            // Try to get operator info from the response
            const profilesData = await testResponse.json();
            console.log(`[INFO] JWT token validated successfully for ${decodedEmail}`);

        } catch (error) {
            console.error(`[ERROR] JWT token validation error for ${decodedEmail}:`, error.message);
            return res.status(401).json({
                success: false,
                message: 'Invalid JWT token',
                error: 'invalid_jwt',
                details: error.message
            });
        }

        // Step 3: Check whitelist
        const isWhitelisted = await authService.checkWhitelist(decodedEmail);
        
        if (!isWhitelisted) {
            console.log(`[WARN] JWT login rejected - email not whitelisted: ${decodedEmail}`);
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized: Email not in whitelist',
                error: 'not_whitelisted'
            });
        }

        // Step 4: Store in session
        req.session.email = decodedEmail;
        req.session.token = jwtToken; // Store the JWT token directly
        req.session.operatorId = decodedEmail; // Use email as operatorId for JWT login

        // Step 4: Start server-side online heartbeat (optional for JWT)
        // authService.startOperatorOnlineHeartbeat(email, jwtToken);

        // Force session save
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Session error' 
                });
            }

            console.log(`[INFO] JWT login successful for: ${decodedEmail}`);
            console.log('Session after JWT login:', req.session);
            console.log('Session ID:', req.sessionID);
            console.log('Session token stored:', !!req.session.token);
            console.log('Session token length:', req.session.token ? req.session.token.length : 0);

            return res.json({
                success: true,
                message: 'JWT authentication successful',
                sessionId: req.sessionID,
                userData: {
                    email: decodedEmail,
                    operatorId: decodedEmail
                }
            });
        });

    } catch (error) {
        console.error('JWT login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: 'server_error',
            details: error.message
        });
    }
});

// Extension Login endpoint
router.post('/login-extension', async (req, res) => {
    console.log(`\n=== EXTENSION LOGIN ATTEMPT ===`);
    console.log(`[DEBUG] Extension login endpoint hit`);
    console.log(`[DEBUG] Request body:`, req.body);
    console.log(`[DEBUG] Session ID before login: ${req.sessionID}`);
    console.log(`[DEBUG] Session exists before login: ${!!req.session}`);
    console.log(`[DEBUG] Session data before login:`, req.session);
    
    try {
        const { jwtToken } = req.body;

        if (!jwtToken) {
            console.log(`[DEBUG] No JWT token provided`);
            return res.status(400).json({ 
                success: false, 
                message: 'JWT token is required' 
            });
        }

        console.log(`[INFO] Extension login attempt with token length: ${jwtToken.length}`);

        // Step 1: Decode JWT token to extract email
        let decodedEmail;
        try {
            const decoded = decodeJWTToken(jwtToken);
            decodedEmail = decoded.email;
            console.log(`[INFO] Email extracted from JWT: ${decodedEmail}`);
        } catch (error) {
            console.error(`[ERROR] JWT decode failed:`, error.message);
            return res.status(400).json({
                success: false,
                message: 'Invalid JWT token format',
                error: 'invalid_jwt_format',
                details: error.message
            });
        }

        // Step 2: Validate JWT token by testing it with Alpha.Date API
        try {
            const testResponse = await fetch('https://alpha.date/api/operator/profiles', {
                headers: { 
                    'Authorization': `Bearer ${jwtToken}`,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!testResponse.ok) {
                console.log(`[ERROR] JWT token validation failed for ${decodedEmail}: ${testResponse.status}`);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid JWT token',
                    error: 'invalid_jwt',
                    details: 'The provided JWT token is not valid or has expired'
                });
            }

            // Try to get operator info from the response
            const profilesData = await testResponse.json();
            console.log(`[INFO] JWT token validated successfully for ${decodedEmail}`);

        } catch (error) {
            console.error(`[ERROR] JWT token validation error for ${decodedEmail}:`, error.message);
            return res.status(401).json({
                success: false,
                message: 'Invalid JWT token',
                error: 'invalid_jwt',
                details: error.message
            });
        }

        // Step 3: Check whitelist
        const isWhitelisted = await authService.checkWhitelist(decodedEmail);
        
        if (!isWhitelisted) {
            console.log(`[WARN] Extension login rejected - email not whitelisted: ${decodedEmail}`);
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized: Email not in whitelist',
                error: 'not_whitelisted'
            });
        }

        // Step 4: Store in session
        console.log(`[DEBUG] Storing session data for extension login:`);
        console.log(`[DEBUG] - Email: ${decodedEmail}`);
        console.log(`[DEBUG] - Token length: ${jwtToken.length}`);
        console.log(`[DEBUG] - Session ID before save: ${req.sessionID}`);
        
        req.session.email = decodedEmail;
        req.session.token = jwtToken; // Store the JWT token directly
        req.session.operatorId = decodedEmail; // Use email as operatorId for JWT login

        console.log(`[DEBUG] Session data after assignment:`);
        console.log(`[DEBUG] - req.session.email: ${req.session.email}`);
        console.log(`[DEBUG] - req.session.token present: ${!!req.session.token}`);
        console.log(`[DEBUG] - req.session.token length: ${req.session.token ? req.session.token.length : 0}`);

        // Step 5: Start server-side online heartbeat (optional for JWT)
        // authService.startOperatorOnlineHeartbeat(decodedEmail, jwtToken);

        // Force session save
        req.session.save((err) => {
            if (err) {
                console.error('[DEBUG] Session save error:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Session error' 
                });
            }

            console.log(`[DEBUG] Session save successful for extension login`);
            console.log(`[DEBUG] Session ID after save: ${req.sessionID}`);
            console.log(`[DEBUG] Session data after save:`);
            console.log(`[DEBUG] - req.session.email: ${req.session.email}`);
            console.log(`[DEBUG] - req.session.token present: ${!!req.session.token}`);
            console.log(`[DEBUG] - req.session.token length: ${req.session.token ? req.session.token.length : 0}`);
            console.log(`[DEBUG] - req.session.operatorId: ${req.session.operatorId}`);

            console.log(`[INFO] Extension login successful for: ${decodedEmail}`);
            console.log('Session after extension login:', req.session);
            console.log('Session ID:', req.sessionID);
            console.log('Session token stored:', !!req.session.token);
            console.log('Session token length:', req.session.token ? req.session.token.length : 0);

            return res.json({
                success: true,
                message: 'Extension login successful',
                sessionId: req.sessionID,
                userData: {
                    email: decodedEmail,
                    operatorId: decodedEmail
                }
            });
        });

    } catch (error) {
        console.error('Extension login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: 'server_error',
            details: error.message
        });
    }
});

// Simple cookie test endpoint
router.get('/cookie-test', (req, res) => {
    console.log(`[DEBUG] Cookie test endpoint hit`);
    console.log(`[DEBUG] Request cookies:`, req.headers.cookie);
    
    // Set a simple cookie
    res.cookie('testCookie', 'test-value-' + Date.now(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 1000 // 1 minute
    });
    
    res.json({
        success: true,
        message: 'Cookie test endpoint working',
        timestamp: new Date().toISOString(),
        requestCookies: req.headers.cookie,
        sessionId: req.sessionID
    });
});

// Test endpoint for extension debugging
router.get('/extension-test', (req, res) => {
    console.log(`[DEBUG] Extension test endpoint hit`);
    
    // Set a test value in session
    req.session.testValue = 'test-' + Date.now();
    req.session.save((err) => {
        if (err) {
            console.error('[DEBUG] Session save error in test:', err);
        } else {
            console.log('[DEBUG] Test session saved successfully');
        }
        
        res.json({
            success: true,
            message: 'Extension test endpoint working',
            timestamp: new Date().toISOString(),
            sessionId: req.sessionID,
            hasSession: !!req.session,
            testValue: req.session.testValue,
            cookies: req.headers.cookie
        });
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