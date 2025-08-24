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
import captchaController from './controllers/captchaController.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Statistics tracking
let totalMessagesSent = 0;
let totalMailsSent = 0;
let statisticsLastUpdated = Date.now();

// Firebase statistics functions
async function loadStatisticsFromFirebase() {
    try {
        // Load messages statistics
        const messagesResponse = await fetch('https://firestore.googleapis.com/v1/projects/alpha-date-sender/databases/(default)/documents/statistics/messages');
        if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            totalMessagesSent = messagesData.fields?.count?.integerValue || 0;
        }
        
        // Load mails statistics
        const mailsResponse = await fetch('https://firestore.googleapis.com/v1/projects/alpha-date-sender/databases/(default)/documents/statistics/mails');
        if (mailsResponse.ok) {
            const mailsData = await mailsResponse.json();
            totalMailsSent = mailsData.fields?.count?.integerValue || 0;
        }
        
        console.log(`[STATISTICS] Loaded from Firebase: ${totalMessagesSent} messages, ${totalMailsSent} mails`);
    } catch (error) {
        console.error('[STATISTICS] Error loading from Firebase:', error);
    }
}

async function saveStatisticsToFirebase() {
    try {
        // Save messages statistics
        await fetch('https://firestore.googleapis.com/v1/projects/alpha-date-sender/databases/(default)/documents/statistics/messages', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    count: { integerValue: totalMessagesSent }
                }
            })
        });
        
        // Save mails statistics
        await fetch('https://firestore.googleapis.com/v1/projects/alpha-date-sender/databases/(default)/documents/statistics/mails', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    count: { integerValue: totalMailsSent }
                }
            })
        });
        
        console.log(`[STATISTICS] Saved to Firebase: ${totalMessagesSent} messages, ${totalMailsSent} mails`);
    } catch (error) {
        console.error('[STATISTICS] Error saving to Firebase:', error);
    }
}

// Statistics increment functions
function incrementMessagesSent() {
    totalMessagesSent++;
    statisticsLastUpdated = Date.now();
}

function incrementMailsSent() {
    totalMailsSent++;
    statisticsLastUpdated = Date.now();
}

// Make functions globally available
global.incrementMessagesSent = incrementMessagesSent;
global.incrementMailsSent = incrementMailsSent;

// Middleware - Order is important!
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'https://alpha-date-automation-depl.onrender.com',
            'https://alpha-date-automation-depl-commercial.onrender.com',
            'http://localhost:3000',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5173',
            'https://www.alpha-bot.date',
            'https://alpha-bot.date',
            process.env.VITE_API_URL,
        ];

        if (allowedOrigins.indexOf(origin) !== -1) {
            console.log('CORS allowed origin:', origin);
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            console.log('Allowed origins:', allowedOrigins);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Auth-Token', 'X-Session-Token'],
    optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

app.use(bodyParser.json());

// Session configuration - AFTER CORS, BEFORE routes
app.use(session({
    secret: process.env.SESSION_SECRET || 'alpha-date-automation-secret-very-long-and-secure',
    resave: false,
    saveUninitialized: true, // Allow session creation for new users
    name: 'alphaSessionId', // Custom session name
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Only secure in production
        httpOnly: true,
        maxAge: 9 * 60 * 60 * 1000, // 9 hours in milliseconds
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // Adjust for local development
        // Removed domain setting - let it default to current domain for proper subdomain handling
    }
}));

// Enhanced session debugging middleware
app.use((req, res, next) => {
    // if (req.url.includes('/api/')) {
    //     const timestamp = new Date().toISOString();
    //     console.log(`\n=== REQUEST DEBUG ${timestamp} ===`);
    //     console.log('Method:', req.method);
    //     console.log('URL:', req.url);
    //     console.log('Origin:', req.get('Origin'));
    //     console.log('Cookie header:', req.get('Cookie'));
    //     console.log('Session ID:', req.sessionID);
    //     console.log('Session exists:', !!req.session);
    //     console.log('Session data:', JSON.stringify(req.session, null, 2));
    //     console.log('Session token present:', !!req.session?.token);
    //     console.log('Session email:', req.session?.email);
    //     console.log('NODE_ENV:', process.env.NODE_ENV);
    //     console.log('=== END REQUEST DEBUG ===\n');
    // }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Statistics API endpoints
app.get('/api/statistics', (req, res) => {
    res.json({
        success: true,
        statistics: {
            totalMessagesSent,
            totalMailsSent,
            lastUpdated: statisticsLastUpdated
        }
    });
});

// Routes
app.use('/api/auth', authController);
app.use('/api/chat', chatController);
app.use('/api/mail', mailController);
app.use('/api/captcha', captchaController);

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

// Debug screenshots endpoint
app.get('/api/debug-screenshots', async (req, res) => {
    try {
        const { readdirSync } = await import('fs');
        const screenshots = readdirSync('/opt/render/project/src/debug-screenshots/')
            .filter(file => file.endsWith('.png'))
            .map(file => ({
                name: file,
                url: `/api/debug-screenshots/${file}`,
                timestamp: file.replace('.png', '').split('-').slice(-1)[0] // Extract timestamp
            }))
            .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp, newest first
        
        res.json({
            success: true,
            screenshots: screenshots,
            count: screenshots.length
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            screenshots: []
        });
    }
});

// Serve individual screenshot and HTML files
app.get('/api/debug-screenshots/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = `/opt/render/project/src/debug-screenshots/${filename}`;
        
        // Set appropriate content type
        if (filename.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (filename.endsWith('.png')) {
            res.setHeader('Content-Type', 'image/png');
        }
        
        res.sendFile(filepath);
    } catch (error) {
        res.status(404).json({ error: 'File not found' });
    }
});

// Chrome test endpoint
app.get('/api/chrome-test', async (req, res) => {
    try {
        const puppeteer = await import('puppeteer');
        const { existsSync } = await import('fs');
        
        const result = {
            success: true,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            executablePath: puppeteer.default.executablePath(),
            environmentVariables: {
                PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
                PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR,
                NODE_ENV: process.env.NODE_ENV
            },
            chromePaths: {
                puppeteerPath: puppeteer.default.executablePath(),
                puppeteerPathExists: existsSync(puppeteer.default.executablePath()),
                envPath: process.env.PUPPETEER_EXECUTABLE_PATH,
                envPathExists: process.env.PUPPETEER_EXECUTABLE_PATH ? existsSync(process.env.PUPPETEER_EXECUTABLE_PATH) : false,
                commonPaths: {
                    '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome': existsSync('/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome'),
                    '/opt/render/.cache/puppeteer/chrome-linux/chrome': existsSync('/opt/render/.cache/puppeteer/chrome-linux/chrome'),
                    '/usr/bin/google-chrome-stable': existsSync('/usr/bin/google-chrome-stable'),
                    '/usr/bin/google-chrome': existsSync('/usr/bin/google-chrome')
                }
            }
        };
        
        // Try to launch Chrome
        try {
            const browser = await puppeteer.default.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            await browser.close();
            result.chromeLaunch = { success: true, message: 'Chrome launched successfully' };
        } catch (error) {
            result.chromeLaunch = { success: false, error: error.message };
        }
        
        res.json(result);
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Captcha test interface
app.get('/captcha-test', (req, res) => {
    res.sendFile(path.join(__dirname, 'captcha-test.html'));
});

// Test endpoint for Mac server
app.get('/api/mac-server-test', (req, res) => {
    res.json({
        success: true,
        message: 'Mac server is running!',
        timestamp: new Date().toISOString(),
        server: 'Mac Local Server',
        tunnel: 'ngrok'
    });
});

// Serve the main dashboard
app.use(express.static(path.join(__dirname, 'dist'), {
    maxAge: '1y',
    immutable: true
}));

// Catch-all handler for SPA (only for non-API routes)
app.get('*', (req, res) => {
    // Don't serve frontend for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    
    // Load initial statistics from Firebase
    await loadStatisticsFromFirebase();
    
    // Set up hourly statistics save to Firebase
    setInterval(async () => {
        await saveStatisticsToFirebase();
    }, 60 * 60 * 1000); // Every hour
    
    console.log('[STATISTICS] Server started with statistics tracking enabled');
});