#!/usr/bin/env node

/**
 * Apple Sign In Configuration Test Script
 * This script validates your Apple Sign In setup and configuration
 */

const fs = require('fs');
const path = require('path');

console.log('🍎 Apple Sign In Configuration Test');
console.log('=====================================\n');

// Test 1: Check if Apple authentication library is installed
console.log('1. Checking Apple Authentication Library...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const hasAppleAuth = packageJson.dependencies['@invertase/react-native-apple-authentication'];
  
  if (hasAppleAuth) {
    console.log('✅ @invertase/react-native-apple-authentication installed:', hasAppleAuth);
  } else {
    console.log('❌ @invertase/react-native-apple-authentication not found in dependencies');
    console.log('   Run: npm install @invertase/react-native-apple-authentication');
  }
} catch (error) {
  console.log('❌ Could not read package.json:', error.message);
}

// Test 2: Check iOS configuration files
console.log('\n2. Checking iOS Configuration...');

const iosProjectPath = 'ios/kanjilearningapp.xcodeproj/project.pbxproj';
if (fs.existsSync(iosProjectPath)) {
  console.log('✅ iOS project found');
  
  try {
    const projectContent = fs.readFileSync(iosProjectPath, 'utf8');
    
    // Check for Apple Sign In capability
    if (projectContent.includes('com.apple.developer.applesignin')) {
      console.log('✅ Sign In with Apple capability found in project');
    } else {
      console.log('⚠️  Sign In with Apple capability not found in project');
      console.log('   Add this capability in Xcode: Signing & Capabilities → + → Sign In with Apple');
    }
    
    // Check for RNAppleAuthentication
    if (projectContent.includes('RNAppleAuthentication')) {
      console.log('✅ RNAppleAuthentication library linked');
    } else {
      console.log('⚠️  RNAppleAuthentication not found in project');
      console.log('   Run: cd ios && pod install');
    }
  } catch (error) {
    console.log('❌ Could not read iOS project file:', error.message);
  }
} else {
  console.log('❌ iOS project not found at expected path');
}

// Test 3: Check entitlements file
console.log('\n3. Checking iOS Entitlements...');

const entitlementsPath = 'ios/kanjilearningapp/kanjilearningapp.entitlements';
if (fs.existsSync(entitlementsPath)) {
  console.log('✅ Entitlements file found');
  
  try {
    const entitlementsContent = fs.readFileSync(entitlementsPath, 'utf8');
    
    if (entitlementsContent.includes('com.apple.developer.applesignin')) {
      console.log('✅ Apple Sign In entitlement configured');
    } else {
      console.log('⚠️  Apple Sign In entitlement not found');
      console.log('   Add this to your entitlements file:');
      console.log('   <key>com.apple.developer.applesignin</key>');
      console.log('   <array><string>Default</string></array>');
    }
  } catch (error) {
    console.log('❌ Could not read entitlements file:', error.message);
  }
} else {
  console.log('⚠️  Entitlements file not found - this will be created automatically by Xcode');
}

// Test 4: Check environment variables
console.log('\n4. Checking Environment Variables...');

if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  
  const requiredVars = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY'
  ];
  
  const optionalAppleVars = [
    'EXPO_PUBLIC_APPLE_SERVICE_ID',
    'EXPO_PUBLIC_APPLE_TEAM_ID',
    'EXPO_PUBLIC_APPLE_KEY_ID'
  ];
  
  console.log('Required environment variables:');
  requiredVars.forEach(varName => {
    if (envContent.includes(varName)) {
      console.log(`✅ ${varName} found`);
    } else {
      console.log(`❌ ${varName} missing - required for Supabase integration`);
    }
  });
  
  console.log('\nOptional Apple-specific variables:');
  optionalAppleVars.forEach(varName => {
    if (envContent.includes(varName)) {
      console.log(`✅ ${varName} found`);
    } else {
      console.log(`⚠️  ${varName} not found - add after Apple Developer setup`);
    }
  });
} else {
  console.log('❌ .env file not found');
  console.log('   Create a .env file with your Supabase configuration');
}

// Test 5: Check authentication service
console.log('\n5. Checking Authentication Service...');

const authServicePath = 'app/services/authService.ts';
if (fs.existsSync(authServicePath)) {
  console.log('✅ Authentication service found');
  
  try {
    const authContent = fs.readFileSync(authServicePath, 'utf8');
    
    if (authContent.includes('@invertase/react-native-apple-authentication')) {
      console.log('✅ Apple authentication library imported');
    } else {
      console.log('❌ Apple authentication library not imported');
    }
    
    if (authContent.includes('signInWithApple')) {
      console.log('✅ signInWithApple function found');
    } else {
      console.log('❌ signInWithApple function not found');
    }
    
    if (authContent.includes('signInWithAppleNative')) {
      console.log('✅ Native Apple Sign In implementation found');
    } else {
      console.log('❌ Native Apple Sign In implementation not found');
    }
  } catch (error) {
    console.log('❌ Could not read authentication service:', error.message);
  }
} else {
  console.log('❌ Authentication service not found');
}

// Test 6: Check UI components
console.log('\n6. Checking UI Components...');

const socialAuthPath = 'app/components/SocialAuth.tsx';
if (fs.existsSync(socialAuthPath)) {
  console.log('✅ SocialAuth component found');
  
  try {
    const socialAuthContent = fs.readFileSync(socialAuthPath, 'utf8');
    
    if (socialAuthContent.includes('isAppleSignInSupported')) {
      console.log('✅ Apple Sign In availability checking implemented');
    } else {
      console.log('❌ Apple Sign In availability checking not found');
    }
    
    if (socialAuthContent.includes('handleAppleSignIn')) {
      console.log('✅ Apple Sign In handler found');
    } else {
      console.log('❌ Apple Sign In handler not found');
    }
  } catch (error) {
    console.log('❌ Could not read SocialAuth component:', error.message);
  }
} else {
  console.log('❌ SocialAuth component not found');
}

console.log('\n=====================================');
console.log('🍎 Apple Sign In Test Complete\n');

console.log('📋 Next Steps:');
console.log('1. Configure Apple Developer Console (see APPLE_SIGNIN_SETUP.md)');
console.log('2. Set up Supabase Apple provider');
console.log('3. Generate client secret (JWT)');
console.log('4. Test on physical iOS device');
console.log('5. Verify App Store compliance\n');

console.log('📖 Documentation:');
console.log('- Setup Guide: APPLE_SIGNIN_SETUP.md');
console.log('- Google Setup: GOOGLE_OAUTH_SETUP.md');
console.log('- Apple Developer: https://developer.apple.com/account/');
console.log('- Supabase Dashboard: https://app.supabase.com/\n'); 