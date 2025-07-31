// server.js - Main Express application
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

// For __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Controllers
import chatController from './controllers/chatController.js';
import mailController from './controllers/mailController.js';
import authController from './controllers/authController.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Order is important!
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'https://alpha-date-automation-depl.onrender.com',
            'http://localhost:3000',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5173',
            'https://www.alpha-bot.date',
            'https://alpha-bot.date',
            'alpha-date-automation-depl-commercial.onrender.com',
            process.env.VITE_API_URL,
        ];

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Auth-Token'],
    optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

app.use(bodyParser.json());

// Session configuration - AFTER CORS, BEFORE routes
app.use(session({
    secret: process.env.SESSION_SECRET || 'alpha-date-automation-secret-very-long-and-secure',
    resave: false,
    saveUninitialized: false,
    name: 'alphaSessionId', // Custom session name
    cookie: {
        secure: process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS !== 'false',
        httpOnly: true,
        maxAge: 9 * 60 * 60 * 1000, // 9 hours in milliseconds
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
        // Removed domain setting - let it default to current domain for proper subdomain handling
    }
}));

// Enhanced session debugging middleware
app.use((req, res, next) => {
    if (req.url.includes('/api/')) {
        const timestamp = new Date().toISOString();
        console.log(`\n=== REQUEST DEBUG ${timestamp} ===`);
        console.log('Method:', req.method);
        console.log('URL:', req.url);
        console.log('Origin:', req.get('Origin'));
        console.log('Cookie header:', req.get('Cookie'));
        console.log('Session ID:', req.sessionID);
        console.log('Session exists:', !!req.session);
        console.log('Session data:', JSON.stringify(req.session, null, 2));
        console.log('Session token present:', !!req.session?.token);
        console.log('Session email:', req.session?.email);
        console.log('NODE_ENV:', process.env.NODE_ENV);
        console.log('=== END REQUEST DEBUG ===\n');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authController);
app.use('/api/chat', chatController);
app.use('/api/mail', mailController);

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
    res.json({
        success: true,
        message: 'CORS is working!',
        origin: req.get('Origin'),
        headers: req.headers,
        timestamp: new Date().toISOString()
    });
});

// Session test endpoint
app.get('/api/session-test', (req, res) => {
    res.json({
        success: true,
        message: 'Session endpoint reached',
        sessionId: req.sessionID,
        hasSession: !!req.session,
        sessionData: req.session,
        cookies: req.headers.cookie,
        timestamp: new Date().toISOString()
    });
});

// Auth test endpoint
app.post('/api/auth-test', (req, res) => {
    const authHeader = req.get('Authorization');
    const customToken = req.get('X-Auth-Token');
    const sessionToken = req.session?.token;

    res.json({
        success: true,
        message: 'Auth test endpoint reached',
        tokens: {
            authHeader: authHeader,
            customToken: customToken,
            sessionToken: sessionToken
        },
        hasAnyToken: !!(authHeader || customToken || sessionToken),
        sessionInfo: {
            sessionId: req.sessionID,
            hasSession: !!req.session,
            sessionData: req.session
        },
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Serve the main dashboard
app.use(express.static(path.join(__dirname, 'dist'), {
    maxAge: '1y',
    immutable: true
}));

// Catch-all handler for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});