// controllers/authController.js
import express from 'express';
import authService from '../services/authService.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Log login attempts
router.post('/log-login', (req, res) => {
    const { email, password } = req.body;
    console.log('new submit', email, password);
    res.json({ success: true });
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

// New Alpha.Date authentication endpoint with Cloudflare handling
router.post('/alpha-login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }

        console.log('Alpha.Date login attempt for:', email);

        // Step 1: Attempt Alpha.Date authentication
        const authResult = await authService.authenticateWithAlphaDate(email, password);

        if (!authResult.success) {
            // Check if it's a Cloudflare challenge
            if (authResult.isCloudflareChallenge) {
                console.log('Cloudflare challenge detected for:', email);
                
                return res.status(403).json({
                    success: false,
                    error: 'cloudflare_challenge',
                    message: '🛡️ Cloudflare protection detected',
                    challengeFile: authResult.challengeFile,
                    details: {
                        status: authResult.status,
                        contentType: authResult.contentType,
                        possibleSolutions: [
                            '1. Try again in a few minutes (rate limiting)',
                            '2. Use a different IP address or VPN',
                            '3. Contact support with the challenge file',
                            '4. Try logging in directly on alpha.date first'
                        ]
                    }
                });
            }
            
            // Regular authentication error
            return res.status(401).json({
                success: false,
                message: authResult.message || 'Authentication failed'
            });
        }

        // Step 2: Check whitelist with the obtained token
        const isWhitelisted = await authService.checkWhitelist(email);

        if (!isWhitelisted) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized: Email not in whitelist' 
            });
        }

        // Step 3: Store in session
        req.session.email = email;
        req.session.token = authResult.token;
        req.session.operatorId = authResult.operatorId;

        // Step 4: Online heartbeat is now handled per-profile when processing starts
        // No need to start a general operator heartbeat anymore

        // Step 5: Force session save and respond
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ success: false, message: 'Session error' });
            }

            console.log('Alpha.Date authentication successful for:', email);
            console.log('Session after save:', {
                sessionId: req.sessionID,
                sessionData: req.session,
                tokenPresent: !!req.session.token,
                email: req.session.email,
                operatorId: req.session.operatorId
            });

            return res.json({
                success: true,
                message: 'Authentication successful',
                sessionId: req.sessionID,
                sessionToken: req.sessionID, // Send session ID as token for API requests
                userData: {
                    email: email,
                    operatorId: authResult.operatorId
                }
            });
        });

    } catch (error) {
        console.error('Alpha.Date authentication error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during authentication' 
        });
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
            tokenPresent: !!req.session.token,
            operatorId: req.session.operatorId || 'not set'
        }
    });
});

// Test session persistence endpoint
router.post('/test-session', (req, res) => {
    const { testValue, createAuthSession } = req.body;
    
    if (createAuthSession) {
        // Create a test authentication session
        req.session.testValue = testValue || 'test-auth-session';
        req.session.testTimestamp = new Date().toISOString();
        req.session.token = 'test-auth-token-12345';
        req.session.email = 'test@example.com';
        req.session.operatorId = 'TEST_OP_123';
        
        req.session.save((err) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: 'Session save error',
                    error: err.message 
                });
            }
            
            res.json({
                success: true,
                message: 'Test auth session created',
                sessionId: req.sessionID,
                sessionToken: req.sessionID,
                saved: {
                    testValue: req.session.testValue,
                    testTimestamp: req.session.testTimestamp,
                    hasToken: !!req.session.token,
                    email: req.session.email,
                    operatorId: req.session.operatorId
                }
            });
        });
    } else if (testValue) {
        req.session.testValue = testValue;
        req.session.testTimestamp = new Date().toISOString();
        
        req.session.save((err) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: 'Session save error',
                    error: err.message 
                });
            }
            
            res.json({
                success: true,
                message: 'Test value saved to session',
                sessionId: req.sessionID,
                saved: {
                    testValue: req.session.testValue,
                    testTimestamp: req.session.testTimestamp
                }
            });
        });
    } else {
        res.json({
            success: true,
            message: 'Current session data',
            sessionId: req.sessionID,
            data: {
                testValue: req.session.testValue || 'not set',
                testTimestamp: req.session.testTimestamp || 'not set',
                hasToken: !!req.session.token,
                email: req.session.email || 'not set',
                operatorId: req.session.operatorId || 'not set'
            }
        });
    }
});

// New endpoint for creating session from JWT token (for Chrome extension)
router.post('/create-session-from-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ 
                success: false, 
                error: 'Token is required' 
            });
        }
        
        console.log('Creating session from JWT token');
        
        // Decode the JWT token to extract user information
        try {
            // Simple JWT decode without verification (since we trust the token from Alpha.Date)
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            const decoded = JSON.parse(jsonPayload);
            
            if (!decoded || !decoded.email || !decoded.id) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid JWT token format' 
                });
            }
            
            // Store the session data
            req.session.email = decoded.email;
            req.session.token = token;
            req.session.operatorId = decoded.id;
            
                // Store cf_clearance cookie if provided
    const { cfClearance } = req.body;
    console.log('=== AUTH CONTROLLER - CREATE SESSION FROM TOKEN ===');
    console.log('cfClearance provided in request:', !!cfClearance);
    console.log('cfClearance value:', cfClearance ? cfClearance.substring(0, 50) + '...' : 'null');
    
    if (cfClearance) {
        req.session.cfClearance = cfClearance;
        console.log('cfClearance stored in session:', req.session.cfClearance ? 'success' : 'failed');
    } else {
        console.log('No cfClearance provided - session will not have cf_clearance cookie');
    }
            

            
            console.log('Session created from JWT:', {
                sessionId: req.sessionID,
                sessionData: req.session,
                tokenPresent: !!req.session.token,
                email: req.session.email,
                operatorId: req.session.operatorId
            });
            
            res.json({
                success: true,
                sessionToken: req.sessionID,
                message: 'Session created successfully from JWT token',
                userData: {
                    email: decoded.email,
                    operatorId: decoded.id,
                    firstName: decoded.firstname,
                    lastName: decoded.lastname
                }
            });
            
        } catch (jwtError) {
            console.error('JWT decode error:', jwtError);
            return res.status(400).json({ 
                success: false, 
                error: 'Failed to decode JWT token' 
            });
        }
        
    } catch (error) {
        console.error('Create session from token error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;