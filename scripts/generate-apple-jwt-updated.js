const jwt = require('jsonwebtoken');
const fs = require('fs');

// Updated Apple Sign In Configuration
const teamId = '8FMP37RQXC';                    // Your Team ID
const clientId = 'com.bluve01.kanjilearningapp';  // Updated: Use App ID as Service ID
const keyId = 'MC73CXBKX4';                     // Your Key ID

// Read the private key from your downloaded .p8 file
// Update this path to your actual key file location
const privateKeyPath = './AuthKey_MC73CXBKX4.p8';

try {
  if (!fs.existsSync(privateKeyPath)) {
    console.error('❌ Private key file not found at:', privateKeyPath);
    console.log('💡 Please download your Apple Sign In key from Apple Developer Console');
    console.log('💡 Save it as AuthKey_MC73CXBKX4.p8 in the scripts directory');
    process.exit(1);
  }

  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

  const token = jwt.sign(
    {
      iss: teamId,              // Team ID
      iat: Math.floor(Date.now() / 1000),  // Issued at
      exp: Math.floor(Date.now() / 1000) + 86400 * 180, // Expires in 6 months
      aud: 'https://appleid.apple.com',     // Apple's audience
      sub: clientId,            // Subject (Service ID)
    },
    privateKey,
    {
      algorithm: 'ES256',
      header: {
        kid: keyId,  // Key ID
      },
    }
  );

  console.log('✅ Apple Client Secret (JWT) Generated Successfully!');
  console.log('');
  console.log('🔑 UPDATED Configuration:');
  console.log('   Service ID (Client ID): com.bluve01.kanjilearningapp');
  console.log('   Team ID: 8FMP37RQXC');
  console.log('   Key ID: MC73CXBKX4');
  console.log('');
  console.log('📝 Use this JWT as your Client Secret in Supabase:');
  console.log('');
  console.log(token);
  console.log('');
  console.log('💡 Next Steps:');
  console.log('1. Update Apple Developer Console Service ID to: com.bluve01.kanjilearningapp');
  console.log('2. Update Supabase Apple provider Client ID to: com.bluve01.kanjilearningapp');
  console.log('3. Update Supabase Apple provider Client Secret with the JWT above');
  console.log('4. Test Apple Sign In again');

} catch (error) {
  console.error('❌ Error generating JWT:', error.message);
  
  if (error.message.includes('ENOENT')) {
    console.log('💡 Make sure your Apple private key file exists at:', privateKeyPath);
  } else if (error.message.includes('jwt')) {
    console.log('💡 Make sure you have the jsonwebtoken package installed:');
    console.log('   npm install jsonwebtoken');
  }
} 