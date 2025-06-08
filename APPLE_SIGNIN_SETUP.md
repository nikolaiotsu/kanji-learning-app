# Apple Sign In Setup Guide

This guide will help you set up Apple Sign In authentication for your Kanji Learning App with native iOS support and web fallback.

## Prerequisites

- Apple Developer Program account ($99/year)
- Supabase project
- Your app's bundle identifier: `com.bluve01.kanjilearningapp`
- Xcode 11+ (for iOS 13+ Apple Sign In support)

## Step 1: Apple Developer Console Setup

### 1.1 Configure App ID
1. Go to [Apple Developer Console](https://developer.apple.com/account/)
2. Navigate to "Certificates, Identifiers & Profiles" → "Identifiers"
3. Find your App ID: `com.bluve01.kanjilearningapp`
4. Edit the App ID and enable "Sign In with Apple" capability
5. Save the configuration

### 1.2 Create Service ID (for Web OAuth)
1. In "Identifiers", click the "+" button
2. Select "Services IDs" and continue
3. Create a new Service ID:
   - Description: "Kanji Learning App - Web Auth"
   - Identifier: `com.bluve01.kanjilearningapp.auth` (must be different from App ID)
4. Enable "Sign In with Apple"
5. Configure domains and redirect URLs:
   - Primary App Domain: `your-domain.com` (can be placeholder for now)
   - Return URLs: `https://[your-supabase-project-ref].supabase.co/auth/v1/callback`
6. Save the configuration

### 1.3 Create Key for Apple Sign In
1. Go to "Keys" section
2. Click "+" to create a new key
3. Enter key name: "Kanji Learning App Apple Sign In Key"
4. Enable "Sign In with Apple"
5. Configure the key:
   - Choose your primary App ID: `com.bluve01.kanjilearningapp`
6. Continue and register
7. **IMPORTANT**: Download the key file (.p8) - you can only download it once
8. Note the Key ID (10-character string)

## Step 2: iOS App Configuration

### 2.1 Add Sign In with Apple Capability
1. Open your project in Xcode
2. Select your app target
3. Go to "Signing & Capabilities" tab
4. Click "+" and add "Sign In with Apple" capability
5. Ensure your Team and Bundle Identifier are correct

### 2.2 Configure Entitlements
Your `ios/kanjilearningapp/kanjilearningapp.entitlements` file should include:
```xml
<key>com.apple.developer.applesignin</key>
<array>
    <string>Default</string>
</array>
```

## Step 3: Supabase Configuration

### 3.1 Enable Apple Provider
1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Navigate to Authentication → Providers
3. Find "Apple" and click to configure
4. Enable the provider
5. Enter your Apple credentials:
   - **Client ID**: Your Service ID identifier (e.g., `com.bluve01.kanjilearningapp.auth`)
   - **Client Secret**: Generate this using your Apple Key (see Step 3.2)

### 3.2 Generate Client Secret (JWT)
Apple requires a JWT as the client secret. Create a Node.js script:

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

const teamId = 'YOUR_TEAM_ID';           // 10-character Team ID
const clientId = 'com.bluve01.kanjilearningapp.auth';  // Your Service ID
const keyId = 'YOUR_KEY_ID';             // 10-character Key ID
const privateKey = fs.readFileSync('path/to/AuthKey_KEYID.p8', 'utf8');

const token = jwt.sign(
  {
    iss: teamId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 180, // 6 months
    aud: 'https://appleid.apple.com',
    sub: clientId,
  },
  privateKey,
  {
    algorithm: 'ES256',
    header: {
      kid: keyId,
    },
  }
);

console.log('Apple Client Secret:', token);
```

## Step 4: Environment Variables

Add Apple-specific environment variables to your `.env` file:

```env
# Apple Sign In Configuration
EXPO_PUBLIC_APPLE_SERVICE_ID=com.bluve01.kanjilearningapp.auth
EXPO_PUBLIC_APPLE_TEAM_ID=YOUR_TEAM_ID
EXPO_PUBLIC_APPLE_KEY_ID=YOUR_KEY_ID
```

## Step 5: Testing

### 5.1 Development Testing
1. Build and run your app on a physical iOS device (iOS 13+):
   ```bash
   npm run ios
   ```
2. Navigate to login/signup screen
3. Tap "Continue with Apple"
4. Verify the native Apple Sign In prompt appears
5. Complete the authentication flow

### 5.2 Testing Requirements
- **Physical iOS device required** (Simulator may not support Apple Sign In)
- **iOS 13.0 or later**
- **Valid Apple Developer account**

## Step 6: App Store Requirements

### 6.1 Mandatory Implementation
- Apple Sign In is **required** if you offer other social sign-in options
- Must be prominently displayed (same level as other sign-in options)
- Follow Apple's Human Interface Guidelines for button design

### 6.2 Privacy Compliance
- Users can choose to hide their email (relay service)
- Handle name privacy settings appropriately
- Update your privacy policy to include Apple Sign In data usage

## Step 7: Troubleshooting

### Common Issues

#### "Apple Sign In not available"
- Verify iOS version is 13+
- Check device supports Apple Sign In
- Ensure proper entitlements configuration

#### "Invalid client_id"
- Verify Service ID is correctly configured
- Check that the Service ID matches Supabase configuration
- Ensure domains are properly configured in Apple Developer Console

#### "Invalid client_secret"
- Regenerate JWT client secret
- Verify Team ID, Key ID, and private key are correct
- Check JWT expiration date

#### Native sign-in not working
- Verify bundle identifier matches Apple Developer Console
- Check Xcode signing configuration
- Ensure "Sign In with Apple" capability is added
- Test on physical device (not simulator)

### Debug Logs
Check console logs for Apple Sign In status:
```javascript
console.log('🍎 Apple Sign In supported:', await appleAuth.isSupported);
console.log('🍎 Platform:', Platform.OS);
```

## Implementation Status

✅ **Completed:**
- Native Apple Sign In library installed
- Enhanced authentication service with native iOS support
- Web fallback for Android/unsupported devices
- Proper error handling and user feedback
- UI components updated with availability checking

❌ **Remaining Tasks:**
1. Configure Apple Developer Console (App ID, Service ID, Key)
2. Set up Supabase Apple provider
3. Generate and configure client secret (JWT)
4. Add iOS entitlements in Xcode
5. Test on physical iOS device

## Next Steps

1. **Complete Apple Developer Setup** - Follow Steps 1-3 above
2. **Configure Supabase** - Add Apple provider and client secret
3. **Test Implementation** - Verify on physical iOS device
4. **App Store Submission** - Ensure compliance with guidelines

---

**Important**: This implementation provides a production-ready Apple Sign In solution that meets App Store requirements and provides the best user experience across platforms. 