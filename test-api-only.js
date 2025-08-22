import { authService } from './services/authService.js';

async function testAPIOnly() {
    console.log('=== Testing API-Only Authentication ===');
    
    try {
        // Test with a dummy account (this will fail but should show the API flow)
        const result = await authService.authenticateWithAPI('test@example.com', 'password');
        console.log('API authentication result:', result);
        
        console.log('✅ API authentication flow is working');
        
    } catch (error) {
        console.error('❌ API authentication test failed:', error.message);
        console.error('Full error:', error);
    }
}

testAPIOnly();
