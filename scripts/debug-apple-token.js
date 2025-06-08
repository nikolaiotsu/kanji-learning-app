// Debug script to decode Apple JWT token and inspect claims
// This helps us understand what Apple is sending vs what Supabase expects

// Install jwt-decode if not already installed: npm install jwt-decode

try {
  // Note: You would paste the actual identity token from your app logs here
  const exampleTokenStructure = {
    "header": {
      "kid": "key-id-from-apple",
      "alg": "RS256"
    },
    "payload": {
      "iss": "https://appleid.apple.com",
      "aud": "com.bluve01.kanjilearningapp", // ← This is your App ID (causing the issue)
      "exp": 1234567890,
      "iat": 1234567890,
      "sub": "user-unique-id-from-apple",
      "email": "user@privaterelay.appleid.com",
      "email_verified": true
    }
  };

  console.log('🔍 Apple Identity Token Structure:');
  console.log('');
  console.log('Header:', JSON.stringify(exampleTokenStructure.header, null, 2));
  console.log('');
  console.log('Payload:', JSON.stringify(exampleTokenStructure.payload, null, 2));
  console.log('');
  console.log('🚨 ISSUE EXPLANATION:');
  console.log('- Apple puts your App ID in the "aud" (audience) claim');
  console.log('- Supabase expects your Service ID in the audience');
  console.log('- This mismatch causes the "Unacceptable audience" error');
  console.log('');
  console.log('🔧 SOLUTION:');
  console.log('1. In Supabase Dashboard → Auth → Providers → Apple');
  console.log('2. Change Client ID from "com.bluve01.kanjilearningapp.auth"');
  console.log('3. Change Client ID to "com.bluve01.kanjilearningapp"');
  console.log('4. This tells Supabase to accept your App ID as valid audience');
  console.log('');
  console.log('✅ This is the correct and official solution for native iOS Apple Sign In');

} catch (error) {
  console.error('Error:', error.message);
}

// If you want to decode an actual token, uncomment this:
/*
const jwt = require('jsonwebtoken');

function decodeAppleToken(token) {
  try {
    // Decode without verifying (just to inspect contents)
    const decoded = jwt.decode(token, { complete: true });
    console.log('Decoded Apple Token:');
    console.log('Header:', decoded.header);
    console.log('Payload:', decoded.payload);
    return decoded;
  } catch (error) {
    console.error('Error decoding token:', error.message);
  }
}

// Usage: decodeAppleToken('paste-your-identity-token-here');
*/ 