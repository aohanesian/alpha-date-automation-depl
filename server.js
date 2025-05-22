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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'alpha-date-automation-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Routes
app.use('/api/auth', authController);
app.use('/api/chat', chatController);
app.use('/api/mail', mailController);

// Serve the main dashboard
app.use(express.static(path.join(__dirname, 'dist'), {
    maxAge: '1y',
    immutable: true
}));

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});