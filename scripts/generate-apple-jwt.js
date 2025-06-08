#!/usr/bin/env node

/**
 * Apple Client Secret (JWT) Generator
 * This script generates the JWT client secret needed for Supabase Apple OAuth configuration
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

console.log('🍎 Apple Client Secret (JWT) Generator');
console.log('=====================================\n');

// Configuration - UPDATE THESE VALUES
const CONFIG = {
  teamId: '8FMP37RQXC',                                    // Your Team ID
  clientId: 'com.bluve01.kanjilearningapp.auth',           // Your Service ID
  keyId: 'MC73CXBKX4',                                    // Your Key ID from Apple Developer
  privateKeyPath: './AuthKey_MC73CXBKX4.p8'               // Path to your .p8 file
};

console.log('📋 Configuration:');
console.log('Team ID:', CONFIG.teamId);
console.log('Service ID (Client ID):', CONFIG.clientId);
console.log('Key ID:', CONFIG.keyId);
console.log('Private Key Path:', CONFIG.privateKeyPath);
console.log('');

// Validation
if (CONFIG.keyId === 'YOUR_KEY_ID') {
  console.log('❌ Please update the KEY_ID in this script');
  console.log('   1. Open scripts/generate-apple-jwt.js');
  console.log('   2. Replace "YOUR_KEY_ID" with your actual Key ID');
  console.log('   3. Update privateKeyPath to point to your .p8 file');
  process.exit(1);
}

if (!fs.existsSync(CONFIG.privateKeyPath)) {
  console.log('❌ Private key file not found:', CONFIG.privateKeyPath);
  console.log('');
  console.log('💡 Solutions:');
  console.log('1. Download your .p8 file from Apple Developer Console');
  console.log('2. Place it in this directory');
  console.log('3. Update the privateKeyPath in this script');
  console.log('');
  console.log('Expected filename format: AuthKey_[YOUR_KEY_ID].p8');
  process.exit(1);
}

try {
  console.log('🔐 Reading private key...');
  const privateKey = fs.readFileSync(CONFIG.privateKeyPath, 'utf8');
  
  console.log('🏗️  Generating JWT...');
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + (86400 * 180); // 6 months from now
  
  const payload = {
    iss: CONFIG.teamId,      // Team ID
    iat: now,                // Issued at
    exp: expiry,             // Expires at (6 months)
    aud: 'https://appleid.apple.com',
    sub: CONFIG.clientId,    // Service ID
  };
  
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'ES256',
    header: {
      kid: CONFIG.keyId,     // Key ID
    },
  });
  
  console.log('✅ JWT Generated Successfully!\n');
  
  console.log('🔑 Apple Client Secret (JWT):');
  console.log('=====================================');
  console.log(token);
  console.log('=====================================\n');
  
  console.log('📋 Next Steps:');
  console.log('1. Copy the JWT above');
  console.log('2. Go to Supabase Dashboard → Authentication → Providers');
  console.log('3. Find Apple and configure:');
  console.log('   - Client ID:', CONFIG.clientId);
  console.log('   - Client Secret: [paste the JWT above]');
  console.log('4. Save the configuration');
  console.log('');
  
  console.log('🕐 Token Details:');
  console.log('- Issued at:', new Date(now * 1000).toISOString());
  console.log('- Expires at:', new Date(expiry * 1000).toISOString());
  console.log('- Valid for: 6 months');
  console.log('');
  
  console.log('💾 Saving configuration to apple-config.json...');
  const configData = {
    teamId: CONFIG.teamId,
    serviceId: CONFIG.clientId,
    keyId: CONFIG.keyId,
    clientSecret: token,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(expiry * 1000).toISOString()
  };
  
  fs.writeFileSync('apple-config.json', JSON.stringify(configData, null, 2));
  console.log('✅ Configuration saved to apple-config.json');
  
} catch (error) {
  console.error('❌ Error generating JWT:', error.message);
  
  if (error.message.includes('PEM')) {
    console.log('');
    console.log('💡 This looks like a private key format issue.');
    console.log('Make sure your .p8 file was downloaded correctly from Apple Developer Console.');
  }
  
  process.exit(1);
} 