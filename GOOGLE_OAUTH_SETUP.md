# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for your Kanji Learning App.

## Prerequisites

- Google Cloud Console account
- Supabase project
- Your app's bundle identifier: `com.bluve01.kanjilearningapp`

## Step 1: Google Cloud Console Setup

### 1.1 Create/Select Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### 1.2 Enable APIs
1. Go to "APIs & Services" → "Library"
2. Search for and enable:
   - **Google+ API** (for basic profile info)
   - **People API** (for profile data)

### 1.3 Configure OAuth Consent Screen
1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External" user type
3. Fill in required fields:
   - App name: "Kanji Learning App"
   - User support email: your email
   - Developer contact information: your email
4. Add scopes:
   - `email`
   - `profile`
   - `openid`
5. Save and continue

### 1.4 Create OAuth Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. Create **3 separate credentials**:

#### Web Application (for Supabase)
- Application type: Web application
- Name: "Kanji Learning App - Web"
- Authorized redirect URIs: `https://[your-supabase-project-ref].supabase.co/auth/v1/callback`

#### iOS Application
- Application type: iOS
- Name: "Kanji Learning App - iOS"
- Bundle ID: `com.bluve01.kanjilearningapp`

#### Android Application
- Application type: Android
- Name: "Kanji Learning App - Android"
- Package name: `com.bluve01.kanjilearningapp`
- SHA-1 certificate fingerprint: (get from your keystore)

## Step 2: Supabase Configuration

### 2.1 Enable Google Provider
1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Navigate to Authentication → Providers
3. Find "Google" and click to configure
4. Enable the provider
5. Enter your **Web Application** credentials:
   - Client ID: from Google Cloud Console (Web app)
   - Client Secret: from Google Cloud Console (Web app)
6. Save configuration

### 2.2 Configure Redirect URLs
Ensure your redirect URL in Supabase matches:
```
https://[your-supabase-project-ref].supabase.co/auth/v1/callback
```

## Step 3: Environment Variables

### 3.1 Create .env file
Create a `.env` file in your project root with:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Google OAuth Configuration
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_web_client_id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_ios_client_id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your_android_client_id.apps.googleusercontent.com

# Other APIs
EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY=your_vision_api_key
EXPO_PUBLIC_CLAUDE_API_KEY=your_claude_api_key
```

### 3.2 Get SHA-1 Fingerprint (Android)
For development:
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

For production, use your release keystore.

## Step 4: Testing

### 4.1 Test Configuration
Run the test script:
```bash
node scripts/test-google-auth.js
```

### 4.2 Test in App
1. Start your development server:
   ```bash
   npm start
   ```
2. Open the app on a device/simulator
3. Navigate to login/signup screen
4. Tap "Continue with Google"
5. Verify the OAuth flow works

## Step 5: Troubleshooting

### Common Issues

#### "OAuth client not found"
- Verify your Google Client IDs are correct
- Ensure you're using the Web Client ID in Supabase
- Check that the bundle identifier matches exactly

#### "Redirect URI mismatch"
- Verify the redirect URI in Google Cloud Console matches Supabase
- Format: `https://[project-ref].supabase.co/auth/v1/callback`

#### "App not verified"
- For testing, you can proceed with unverified app
- For production, submit for Google verification

#### Deep linking not working
- Verify your app scheme is set correctly: `kanjilearningapp://`
- Check that the redirect URL in your auth service matches

### Debug Logs
Enable debug logging in your app:
```javascript
// In your auth service
console.log('OAuth URL:', data.url);
console.log('Redirect URL:', 'kanjilearningapp://login');
```

## Step 6: Production Considerations

### 6.1 App Verification
- Submit your app for Google verification
- Provide privacy policy and terms of service
- Complete OAuth consent screen verification

### 6.2 Security
- Use production keystore for Android builds
- Ensure environment variables are properly secured
- Test on multiple devices and OS versions

### 6.3 Error Handling
- Implement proper error handling for network issues
- Handle OAuth cancellation gracefully
- Provide fallback authentication methods

## Testing Checklist

- [ ] Google Cloud Console project created
- [ ] APIs enabled (Google+, People API)
- [ ] OAuth consent screen configured
- [ ] Web, iOS, and Android credentials created
- [ ] Supabase Google provider enabled
- [ ] Environment variables set
- [ ] Test script passes
- [ ] OAuth flow works in development
- [ ] Deep linking redirects properly
- [ ] User profile data is retrieved
- [ ] Error handling works correctly

## Support Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Expo AuthSession Documentation](https://docs.expo.dev/guides/authentication/#google)

---

**Note**: This setup uses Supabase's OAuth flow with web browser authentication. For a more native experience, consider implementing Google Sign-In SDK, but the current approach works well for most use cases. 