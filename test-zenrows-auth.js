// test-zenrows-auth.js
import zenrowsAuthService from './services/zenrowsAuthService.js';

async function testZenRowsAuth() {
    console.log('=== Testing ZenRows Authentication ===');
    
    // Test credentials (replace with real ones)
    const email = 'OP1738185120@alpha.date';
    const password = 'xGgeUhHwyF';
    
    try {
        console.log('1. Testing ZenRows authentication...');
        const zenrowsResult = await zenrowsAuthService.authenticateWithAlphaDate(email, password);
        console.log('ZenRows Result:', zenrowsResult);
        
        if (zenrowsResult.success) {
            console.log('✅ ZenRows authentication successful!');
            console.log('Token:', zenrowsResult.token ? 'Present' : 'Missing');
            console.log('Operator ID:', zenrowsResult.operatorId);
        } else {
            console.log('❌ ZenRows authentication failed:', zenrowsResult.error);
        }
        
        console.log('\n2. Testing Proxy authentication...');
        const proxyResult = await zenrowsAuthService.authenticateWithProxy(email, password);
        console.log('Proxy Result:', proxyResult);
        
        if (proxyResult.success) {
            console.log('✅ Proxy authentication successful!');
            console.log('Token:', proxyResult.token ? 'Present' : 'Missing');
            console.log('Operator ID:', proxyResult.operatorId);
        } else {
            console.log('❌ Proxy authentication failed:', proxyResult.error);
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testZenRowsAuth();
