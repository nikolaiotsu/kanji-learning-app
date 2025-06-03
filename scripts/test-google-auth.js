/**
 * Google OAuth Test Script
 * 
 * This script helps test and debug Google OAuth configuration.
 * Run this with: node scripts/test-google-auth.js
 */

// Load environment variables from .env file
require('dotenv').config();

const https = require('https');
const url = require('url');

// Test configuration
const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};

console.log('🔍 Testing Google OAuth Configuration...\n');

// Check environment variables
console.log('📋 Environment Variables:');
console.log(`✓ Supabase URL: ${config.supabaseUrl ? 'Set' : '❌ Missing'}`);
console.log(`✓ Supabase Anon Key: ${config.supabaseAnonKey ? 'Set' : '❌ Missing'}`);
console.log(`✓ Google Web Client ID: ${config.googleWebClientId ? 'Set' : '❌ Missing'}\n`);

// Test Supabase connection
async function testSupabaseConnection() {
  return new Promise((resolve, reject) => {
    if (!config.supabaseUrl) {
      reject(new Error('Supabase URL not configured'));
      return;
    }

    const testUrl = `${config.supabaseUrl}/rest/v1/`;
    const parsedUrl = url.parse(testUrl);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'apikey': config.supabaseAnonKey,
        'Authorization': `Bearer ${config.supabaseAnonKey}`
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200 || res.statusCode === 404) {
        resolve('✅ Supabase connection successful');
      } else {
        reject(new Error(`❌ Supabase connection failed: ${res.statusCode}`));
      }
    });

    req.on('error', (error) => {
      reject(new Error(`❌ Supabase connection error: ${error.message}`));
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('❌ Supabase connection timeout'));
    });

    req.end();
  });
}

// Test Google OAuth endpoint
async function testGoogleOAuthEndpoint() {
  return new Promise((resolve, reject) => {
    if (!config.supabaseUrl) {
      reject(new Error('Supabase URL not configured'));
      return;
    }

    const testUrl = `${config.supabaseUrl}/auth/v1/authorize?provider=google`;
    const parsedUrl = url.parse(testUrl);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'apikey': config.supabaseAnonKey
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 302 || res.statusCode === 400) {
        resolve('✅ Google OAuth endpoint accessible');
      } else {
        reject(new Error(`❌ Google OAuth endpoint issue: ${res.statusCode}`));
      }
    });

    req.on('error', (error) => {
      reject(new Error(`❌ Google OAuth endpoint error: ${error.message}`));
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('❌ Google OAuth endpoint timeout'));
    });

    req.end();
  });
}

// Run tests
async function runTests() {
  console.log('🧪 Running Connection Tests:\n');
  
  try {
    const supabaseResult = await testSupabaseConnection();
    console.log(supabaseResult);
  } catch (error) {
    console.log(error.message);
  }

  try {
    const googleResult = await testGoogleOAuthEndpoint();
    console.log(googleResult);
  } catch (error) {
    console.log(error.message);
  }

  console.log('\n📝 Next Steps:');
  console.log('1. Ensure all environment variables are set in your .env file');
  console.log('2. Configure Google OAuth in Google Cloud Console');
  console.log('3. Enable Google provider in Supabase Dashboard');
  console.log('4. Test the OAuth flow in your app');
  console.log('\n🔗 Useful Links:');
  console.log('- Google Cloud Console: https://console.cloud.google.com/');
  console.log('- Supabase Dashboard: https://app.supabase.com/');
  console.log('- Supabase Auth Docs: https://supabase.com/docs/guides/auth/social-login/auth-google');
}

runTests().catch(console.error); 