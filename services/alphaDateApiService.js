// services/alphaDateApiService.js
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

class AlphaDateApiService {
    constructor() {
        this.baseUrl = 'https://alpha.date/api';
    }

    /**
     * Detects if the response is a Cloudflare challenge page
     */
    isCloudflareChallenge(response, body) {
        const cloudflareKeywords = [
            'Just a moment...',
            'cf-mitigated',
            'cloudflare',
            'cf-browser-verification',
            'cf-challenge',
            'cf-error-code',
            'cf-ray',
            'cf-cache-status',
            'cf-request-id'
        ];

        // Check status code
        if (response.status === 403 || response.status === 429) {
            return true;
        }

        // Check content type
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html') && !contentType.includes('application/json')) {
            return true;
        }

        // Check for Cloudflare headers
        const cfHeaders = [
            'cf-ray',
            'cf-cache-status',
            'cf-request-id',
            'cf-mitigated'
        ];
        
        for (const header of cfHeaders) {
            if (response.headers.get(header)) {
                return true;
            }
        }

        // Check body content for Cloudflare keywords
        if (body && typeof body === 'string') {
            return cloudflareKeywords.some(keyword => 
                body.toLowerCase().includes(keyword.toLowerCase())
            );
        }

        return false;
    }

    /**
     * Saves Cloudflare challenge page to a timestamped file
     */
    saveCloudflareChallenge(body, status, contentType) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `cloudflare-challenge-${timestamp}.html`;
            const filepath = path.join(process.cwd(), filename);

            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Cloudflare Challenge - ${timestamp}</title>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f0f0; padding: 10px; margin-bottom: 20px; }
        .challenge-content { border: 1px solid #ccc; padding: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Cloudflare Challenge Detected</h1>
        <p><strong>Status:</strong> ${status}</p>
        <p><strong>Content-Type:</strong> ${contentType}</p>
        <p><strong>Timestamp:</strong> ${timestamp}</p>
        <p><strong>File:</strong> ${filename}</p>
    </div>
    <div class="challenge-content">
        ${body}
    </div>
</body>
</html>`;

            fs.writeFileSync(filepath, htmlContent, 'utf8');
            console.log(`[INFO] Cloudflare challenge saved to: ${filepath}`);
            return filepath;
        } catch (error) {
            console.error('[ERROR] Failed to save Cloudflare challenge:', error);
            return null;
        }
    }

    /**
     * Authenticates with Alpha.Date API with Cloudflare detection
     */
    async authenticate(email, password) {
        try {
            console.log(`[INFO] Attempting to authenticate with Alpha.Date API: ${this.baseUrl}/login/login`);

            const response = await fetch(`${this.baseUrl}/login/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const contentType = response.headers.get('content-type') || '';
            let body;

            try {
                body = await response.text();
            } catch (error) {
                console.error('[ERROR] Failed to read response body:', error);
                throw new Error('Failed to read response body');
            }

            // Check if response is JSON
            let jsonData;
            try {
                jsonData = JSON.parse(body);
            } catch (error) {
                // Not JSON, might be Cloudflare challenge
                if (this.isCloudflareChallenge(response, body)) {
                    const challengeFile = this.saveCloudflareChallenge(body, response.status, contentType);
                    
                    const errorMessage = `API returned HTML instead of JSON. Status: ${response.status}`;
                    console.error(`[ERROR] ${errorMessage}`);
                    console.error(`[ERROR] Response body preview: ${body.substring(0, 300)}...`);
                    
                    if (challengeFile) {
                        console.error(`[ERROR] Cloudflare challenge saved to: ${challengeFile}`);
                    }

                    throw new Error(`API returned HTML instead of JSON. Status: ${response.status}`);
                } else {
                    console.error(`[ERROR] API returned non-JSON response. Status: ${response.status}, Content-Type: ${contentType}`);
                    console.error(`[ERROR] Response body preview: ${body.substring(0, 300)}...`);
                    throw new Error(`API returned non-JSON response. Status: ${response.status}`);
                }
            }

            // Check if login was successful
            if (!response.ok) {
                console.error(`[ERROR] Authentication failed. Status: ${response.status}`);
                console.error(`[ERROR] Response:`, jsonData);
                throw new Error(`Authentication failed: ${jsonData.message || 'Unknown error'}`);
            }

            if (!jsonData.token) {
                console.error(`[ERROR] No token in response:`, jsonData);
                throw new Error('No authentication token received');
            }

            console.log(`[INFO] Authentication successful for ${email}`);
            return jsonData;

        } catch (error) {
            console.error(`[ERROR] Authentication failed for ${email}:`, error.message);
            throw error;
        }
    }

    /**
     * Makes an authenticated request to Alpha.Date API
     */
    async makeAuthenticatedRequest(endpoint, token, options = {}) {
        try {
            const url = `${this.baseUrl}${endpoint}`;
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    ...options.headers
                }
            });

            const contentType = response.headers.get('content-type') || '';
            let body;

            try {
                body = await response.text();
            } catch (error) {
                throw new Error('Failed to read response body');
            }

            // Check if response is JSON
            let jsonData;
            try {
                jsonData = JSON.parse(body);
            } catch (error) {
                // Not JSON, might be Cloudflare challenge
                if (this.isCloudflareChallenge(response, body)) {
                    const challengeFile = this.saveCloudflareChallenge(body, response.status, contentType);
                    
                    console.error(`[ERROR] Cloudflare protection detected on ${endpoint}`);
                    if (challengeFile) {
                        console.error(`[ERROR] Challenge saved to: ${challengeFile}`);
                    }
                    
                    throw new Error(`Cloudflare protection detected on ${endpoint}`);
                } else {
                    throw new Error(`API returned non-JSON response. Status: ${response.status}`);
                }
            }

            return {
                ok: response.ok,
                status: response.status,
                data: jsonData
            };

        } catch (error) {
            console.error(`[ERROR] Request failed for ${endpoint}:`, error.message);
            throw error;
        }
    }
}

export default new AlphaDateApiService(); 