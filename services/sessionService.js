import { EventEmitter } from 'events';

// Server-side session store
class SessionStore extends EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();
        this.processingStates = new Map();
        this.lastActivity = new Map();
        this.emailToSessions = new Map(); // Track sessions by email
        
        // Cleanup inactive sessions every hour
        setInterval(() => this.cleanupInactiveSessions(), 60 * 60 * 1000);
    }

    // Store session data
    setSession(sessionId, data) {
        const oldSession = this.sessions.get(sessionId);
        if (oldSession?.email) {
            // Remove old email mapping
            const sessions = this.emailToSessions.get(oldSession.email) || new Set();
            sessions.delete(sessionId);
            if (sessions.size === 0) {
                this.emailToSessions.delete(oldSession.email);
            }
        }

        // Store new session data
        this.sessions.set(sessionId, {
            ...data,
            lastUpdated: Date.now()
        });
        this.lastActivity.set(sessionId, Date.now());

        // Update email to sessions mapping
        if (data.email) {
            if (!this.emailToSessions.has(data.email)) {
                this.emailToSessions.set(data.email, new Set());
            }
            this.emailToSessions.get(data.email).add(sessionId);
        }

        this.emit('sessionUpdated', sessionId, data);
        
        // Emit to all sessions with the same email
        if (data.email) {
            this.emitToEmail(data.email, 'sessionSync', {
                type: 'sessionUpdated',
                sessionId,
                data
            });
        }
    }

    // Get session data
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.lastActivity.set(sessionId, Date.now());
        }
        return session;
    }

    // Update processing state for a session
    updateProcessingState(sessionId, profileId, type, state) {
        let sessionStates = this.processingStates.get(sessionId) || new Map();
        sessionStates.set(`${type}-${profileId}`, {
            state,
            timestamp: Date.now()
        });
        this.processingStates.set(sessionId, sessionStates);
        
        // Get email from session
        const session = this.sessions.get(sessionId);
        if (session?.email) {
            // Emit to all sessions with the same email
            this.emitToEmail(session.email, 'stateSync', {
                type: 'processingStateUpdated',
                sessionId,
                profileId,
                processType: type,
                state
            });
        }

        this.emit('processingStateUpdated', sessionId, profileId, type, state);
    }

    // Get all processing states for a session
    getProcessingStates(sessionId) {
        return this.processingStates.get(sessionId) || new Map();
    }

    // Get all processing states for an email (across all sessions)
    getProcessingStatesByEmail(email) {
        const states = new Map();
        const sessions = this.emailToSessions.get(email) || new Set();
        
        for (const sessionId of sessions) {
            const sessionStates = this.processingStates.get(sessionId) || new Map();
            for (const [key, value] of sessionStates.entries()) {
                if (!states.has(key) || states.get(key).timestamp < value.timestamp) {
                    states.set(key, value);
                }
            }
        }
        
        return states;
    }

    // Remove session and its data
    removeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session?.email) {
            const sessions = this.emailToSessions.get(session.email);
            if (sessions) {
                sessions.delete(sessionId);
                if (sessions.size === 0) {
                    this.emailToSessions.delete(session.email);
                }
            }
        }

        this.sessions.delete(sessionId);
        this.processingStates.delete(sessionId);
        this.lastActivity.delete(sessionId);
        
        if (session?.email) {
            this.emitToEmail(session.email, 'sessionSync', {
                type: 'sessionRemoved',
                sessionId
            });
        }

        this.emit('sessionRemoved', sessionId);
    }

    // Clean up inactive sessions
    cleanupInactiveSessions() {
        const now = Date.now();
        const inactivityThreshold = 9 * 60 * 60 * 1000; // 9 hours

        for (const [sessionId, lastActivity] of this.lastActivity.entries()) {
            if (now - lastActivity > inactivityThreshold) {
                this.removeSession(sessionId);
            }
        }
    }

    // Get all active sessions for an email
    getSessionsByEmail(email) {
        const sessions = this.emailToSessions.get(email) || new Set();
        return Array.from(sessions).map(sessionId => ({
            sessionId,
            ...this.sessions.get(sessionId)
        }));
    }

    // Emit event to all sessions with the same email
    emitToEmail(email, event, data) {
        const sessions = this.emailToSessions.get(email) || new Set();
        for (const sessionId of sessions) {
            this.emit(`${event}:${sessionId}`, data);
        }
    }

    // Subscribe to events for a specific session
    subscribeToSession(sessionId, callback) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const handleSessionSync = (data) => callback(data);
        const handleStateSync = (data) => callback(data);

        this.on(`sessionSync:${sessionId}`, handleSessionSync);
        this.on(`stateSync:${sessionId}`, handleStateSync);

        return () => {
            this.off(`sessionSync:${sessionId}`, handleSessionSync);
            this.off(`stateSync:${sessionId}`, handleStateSync);
        };
    }
}

// Create and export a singleton instance
const sessionStore = new SessionStore();
export default sessionStore; 