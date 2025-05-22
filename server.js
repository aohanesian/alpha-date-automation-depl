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
    origin: ['https://alpha-date-automation-depl.onrender.com', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

// Session configuration - BEFORE routes
app.use(session({
    secret: process.env.SESSION_SECRET || 'alpha-date-automation-secret-very-long-and-secure',
    resave: false,
    saveUninitialized: false,
    name: 'alphaSessionId', // Custom session name
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
}));

// Add session debugging middleware
app.use((req, res, next) => {
    console.log('Session ID:', req.sessionID);
    console.log('Session data:', req.session);
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authController);
app.use('/api/chat', chatController);
app.use('/api/mail', mailController);

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