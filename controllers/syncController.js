// controllers/syncController.js
import express from 'express';
import sessionStore from '../services/sessionService.js';

const router = express.Router();

// Get all active sessions for the current user
router.get('/sessions', (req, res) => {
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
        console.error('Get sessions error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get all processing states for the current session
router.get('/states', (req, res) => {
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
        console.error('Get states error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Stop all processing for the current session
router.post('/stop-all', (req, res) => {
    try {
        if (!req.session?.email) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const states = sessionStore.getProcessingStates(req.sessionID);
        for (const [key, value] of states.entries()) {
            const [type, profileId] = key.split('-');
            if (value.state.status === 'processing') {
                if (type === 'chat') {
                    chatService.stopProfileProcessing(profileId, req.sessionID);
                } else if (type === 'mail') {
                    mailService.stopProcessing(profileId, req.sessionID);
                }
            }
        }

        res.json({
            success: true,
            message: 'All processing stopped'
        });
    } catch (error) {
        console.error('Stop all error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Subscribe to session updates (Server-Sent Events)
router.get('/subscribe', (req, res) => {
    try {
        if (!req.session?.email) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        // Set headers for SSE
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        // Send initial states
        const states = sessionStore.getProcessingStates(req.sessionID);
        const formattedStates = {};
        for (const [key, value] of states.entries()) {
            formattedStates[key] = value;
        }
        res.write(`data: ${JSON.stringify({ type: 'states', data: formattedStates })}\n\n`);

        // Set up event listeners
        const stateHandler = (sessionId, profileId, type, state) => {
            if (sessionId === req.sessionID) {
                res.write(`data: ${JSON.stringify({
                    type: 'stateUpdate',
                    data: { profileId, type, state }
                })}\n\n`);
            }
        };

        const sessionHandler = (sessionId, data) => {
            if (sessionId === req.sessionID) {
                res.write(`data: ${JSON.stringify({
                    type: 'sessionUpdate',
                    data
                })}\n\n`);
            }
        };

        sessionStore.on('processingStateUpdated', stateHandler);
        sessionStore.on('sessionUpdated', sessionHandler);

        // Clean up on client disconnect
        req.on('close', () => {
            sessionStore.removeListener('processingStateUpdated', stateHandler);
            sessionStore.removeListener('sessionUpdated', sessionHandler);
        });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router; 