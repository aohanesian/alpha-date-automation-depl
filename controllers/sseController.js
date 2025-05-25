// controllers/sseController.js
import express from 'express';
import sessionStore from '../services/sessionService.js';

const router = express.Router();

// SSE endpoint for real-time updates
router.get('/updates', (req, res) => {
    // Check both session and token-based auth
    const token = req.headers['x-auth-token'] || 
                 req.headers.authorization?.split(' ')[1] || 
                 req.session?.token;
                 
    const email = req.session?.email || req.session?.userData?.email;
    
    // If we have a token but no session data, try to restore it
    if (token && !email && req.session) {
        try {
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
                req.session.email = payload.email;
                req.session.token = token;
                req.session.userData = {
                    email: payload.email,
                    token,
                    operatorId: payload.id,
                    lastActivity: Date.now()
                };
                req.session.save();
            }
        } catch (error) {
            console.error('Failed to restore session from token:', error);
        }
    }

    if (!email && !token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Not authenticated',
            debug: {
                hasSession: !!req.session,
                sessionEmail: email,
                hasToken: !!token
            }
        });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial state
    const states = sessionStore.getProcessingStatesByEmail(email || token);
    const initialStates = [];
    
    // Convert Map to array format
    if (states) {
        states.forEach((value, key) => {
            const [type, profileId] = key.split('-');
            initialStates.push({
                type,
                profileId,
                state: value
            });
        });
    }

    const initialData = {
        type: 'initialState',
        states: initialStates
    };
    
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);

    // Subscribe to session updates
    const cleanup = sessionStore.subscribeToSession(req.sessionID, (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    });

    // Handle client disconnect
    req.on('close', () => {
        if (cleanup) cleanup();
    });
});

export default router; 