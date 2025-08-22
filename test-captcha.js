// test-captcha.js - Test script for captcha solving functionality
import captchaService from './services/captchaService.js';

async function testCaptchaSolving() {
    console.log('🧪 Testing Captcha Solving Service...\n');

    // Test 1: Verify service status
    console.log('📋 Test 1: Service Status');
    try {
        const result = await captchaService.solveCaptcha('https://alpha.date/login', {
            timeout: 5000,
            headless: true,
            waitForManual: false
        });
        console.log('✅ Service is working:', result);
    } catch (error) {
        console.log('❌ Service error:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: Test with manual solving (will open browser)
    console.log('🌐 Test 2: Manual Captcha Solving (will open browser)');
    console.log('This test will open a browser window for manual captcha solving...');
    
    const shouldRunManualTest = process.argv.includes('--manual');
    
    if (shouldRunManualTest) {
        try {
            const result = await captchaService.solveCaptcha('https://alpha.date/login', {
                timeout: 300000, // 5 minutes
                headless: false, // Show browser
                waitForManual: true
            });
            console.log('✅ Manual test result:', result);
        } catch (error) {
            console.log('❌ Manual test error:', error.message);
        }
    } else {
        console.log('⏭️  Skipping manual test. Run with --manual flag to test manual solving.');
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 3: Test different captcha types
    console.log('🔍 Test 3: Captcha Type Detection');
    
    const testUrls = [
        'https://alpha.date/login',
        'https://www.google.com/recaptcha/api2/demo',
        'https://hcaptcha.com/demo'
    ];

    for (const url of testUrls) {
        console.log(`\nTesting URL: ${url}`);
        try {
            const result = await captchaService.solveCaptcha(url, {
                timeout: 10000,
                headless: true,
                waitForManual: false
            });
            console.log(`✅ Result: ${result.type} - ${result.message}`);
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 4: Test with credentials
    console.log('🔐 Test 4: Login with Credentials');
    
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    const testPassword = process.env.TEST_PASSWORD || 'testpassword';
    
    console.log(`Using test credentials: ${testEmail}`);
    
    try {
        const result = await captchaService.solveCaptcha('https://alpha.date/login', {
            email: testEmail,
            password: testPassword,
            timeout: 30000,
            headless: true,
            waitForManual: false
        });
        console.log('✅ Login test result:', result);
    } catch (error) {
        console.log('❌ Login test error:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');
    console.log('🎉 Captcha solving tests completed!');
}

// Run the tests
testCaptchaSolving().catch(console.error);
