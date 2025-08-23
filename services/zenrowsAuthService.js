// services/zenrowsAuthService.js
import fetch from 'node-fetch';
import { ZenRows } from 'zenrows';

const zenrowsAuthService = {
    async authenticateWithAlphaDate(email, password) {
        try {
            console.log('[ZENROWS AUTH] Starting authentication with Alpha.Date...');
            
            // Initialize ZenRows client
            const apiKey = process.env.ZENROWS_API_KEY || 'a99283cb465506ebb89875eeff4df36020d71c7b';
            const client = new ZenRows(apiKey);
            
            // Step 1: Get the login page to extract any CSRF tokens or cookies
            console.log('[ZENROWS AUTH] Getting login page...');
            const loginPageResponse = await client.get('https://alpha.date/login', {
                // Use residential proxies for better success rate
                proxy: 'residential',
                // Add realistic headers
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });
            
            if (!loginPageResponse.ok) {
                throw new Error(`Failed to get login page: ${loginPageResponse.status}`);
            }
            
            const loginPageHtml = await loginPageResponse.text();
            console.log('[ZENROWS AUTH] Login page retrieved successfully');
            
            // Step 2: Submit login form
            console.log('[ZENROWS AUTH] Submitting login form...');
            const loginResponse = await client.post('https://alpha.date/api/auth/login', {
                // Use residential proxies
                proxy: 'residential',
                // Form data
                data: {
                    login: email,
                    password: password
                },
                // Headers
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://alpha.date',
                    'Referer': 'https://alpha.date/login',
                    'Connection': 'keep-alive'
                }
            });
            
            if (!loginResponse.ok) {
                throw new Error(`Login failed: ${loginResponse.status} - ${loginResponse.statusText}`);
            }
            
            const loginData = await loginResponse.json();
            console.log('[ZENROWS AUTH] Login response received');
            
            // Check if login was successful
            if (loginData.error) {
                throw new Error(`Login error: ${loginData.error}`);
            }
            
            if (!loginData.token) {
                throw new Error('No token received in login response');
            }
            
            console.log('[ZENROWS AUTH] Authentication successful!');
            
            // Step 3: Get operator info to extract operator ID
            console.log('[ZENROWS AUTH] Getting operator info...');
            const operatorResponse = await client.get('https://alpha.date/api/operator/info', {
                proxy: 'residential',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Authorization': `Bearer ${loginData.token}`,
                    'Connection': 'keep-alive'
                }
            });
            
            let operatorId = null;
            if (operatorResponse.ok) {
                const operatorData = await operatorResponse.json();
                operatorId = operatorData.operator_id || operatorData.id;
                console.log('[ZENROWS AUTH] Operator ID extracted:', operatorId);
            } else {
                // Try to decode JWT token as fallback
                console.log('[ZENROWS AUTH] Operator info failed, trying JWT decode...');
                operatorId = this.decodeJWTToken(loginData.token);
            }
            
            return {
                success: true,
                token: loginData.token,
                operatorId: operatorId,
                email: email,
                message: 'Authentication successful via ZenRows'
            };
            
        } catch (error) {
            console.error('[ZENROWS AUTH] Authentication failed:', error.message);
            return {
                success: false,
                error: error.message,
                message: 'Authentication failed via ZenRows'
            };
        }
    },
    
    decodeJWTToken(token) {
        try {
            // JWT tokens have 3 parts separated by dots
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid JWT format');
            }
            
            // Decode the payload (second part)
            const payload = parts[1];
            
            // Add padding if needed for base64 decode
            const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
            
            // Decode base64
            const decodedPayload = Buffer.from(paddedPayload, 'base64').toString('utf8');
            
            // Parse JSON
            const tokenData = JSON.parse(decodedPayload);
            
            console.log('[ZENROWS AUTH] JWT token decoded successfully:', {
                id: tokenData.id,
                email: tokenData.email,
                agency_id: tokenData.agency_id,
                external_id: tokenData.external_id
            });
            
            // Return the operator ID
            return tokenData.id ? tokenData.id.toString() : null;
            
        } catch (error) {
            console.error('[ZENROWS AUTH] Failed to decode JWT token:', error.message);
            return null;
        }
    },
    
    // Alternative method using regular proxy instead of ZenRows
    async authenticateWithProxy(email, password, proxyUrl = 'http://172.64.48.37:80') {
        try {
            console.log('[PROXY AUTH] Starting authentication with Alpha.Date using proxy...');
            
            // Step 1: Get the login page
            console.log('[PROXY AUTH] Getting login page...');
            const loginPageResponse = await fetch('https://alpha.date/login', {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                // Use proxy
                agent: new (await import('https-proxy-agent')).HttpsProxyAgent(proxyUrl)
            });
            
            if (!loginPageResponse.ok) {
                throw new Error(`Failed to get login page: ${loginPageResponse.status}`);
            }
            
            console.log('[PROXY AUTH] Login page retrieved successfully');
            
            // Step 2: Submit login form
            console.log('[PROXY AUTH] Submitting login form...');
            const formData = new URLSearchParams();
            formData.append('login', email);
            formData.append('password', password);
            
            const loginResponse = await fetch('https://alpha.date/api/auth/login', {
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://alpha.date',
                    'Referer': 'https://alpha.date/login',
                    'Connection': 'keep-alive'
                },
                body: formData,
                // Use proxy
                agent: new (await import('https-proxy-agent')).HttpsProxyAgent(proxyUrl)
            });
            
            if (!loginResponse.ok) {
                throw new Error(`Login failed: ${loginResponse.status} - ${loginResponse.statusText}`);
            }
            
            const loginData = await loginResponse.json();
            console.log('[PROXY AUTH] Login response received');
            
            // Check if login was successful
            if (loginData.error) {
                throw new Error(`Login error: ${loginData.error}`);
            }
            
            if (!loginData.token) {
                throw new Error('No token received in login response');
            }
            
            console.log('[PROXY AUTH] Authentication successful!');
            
            // Extract operator ID from JWT token
            const operatorId = this.decodeJWTToken(loginData.token);
            
            return {
                success: true,
                token: loginData.token,
                operatorId: operatorId,
                email: email,
                message: 'Authentication successful via proxy'
            };
            
        } catch (error) {
            console.error('[PROXY AUTH] Authentication failed:', error.message);
            return {
                success: false,
                error: error.message,
                message: 'Authentication failed via proxy'
            };
        }
    }
};

export default zenrowsAuthService;
