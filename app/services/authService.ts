import { supabase } from './supabaseClient';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import appleAuth from '@invertase/react-native-apple-authentication';
import { logger } from '../utils/logger';

// Sign up with email and password
export const signUp = async (email: string, password: string) => {
  try {
    logger.log('🔐 [authService] signUp called with email:', email);
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          email: email,
        }
      }
    });
    
    logger.log('🔐 [authService] signUp response:', {
      user: !!data?.user,
      session: !!data?.session,
      error: !!error
    });
    
    if (error) {
      logger.error('❌ [authService] signUp error:', error.message);
      throw error;
    }
    
    return data;
  } catch (error) {
    logger.error('❌ [authService] Error signing up:', error);
    throw error;
  }
};

// Sign in with email and password
export const signIn = async (email: string, password: string) => {
  try {
    logger.log('🔐 [authService] signIn called with email:', email);
    logger.log('🔐 [authService] Calling supabase.auth.signInWithPassword...');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    logger.log('🔐 [authService] Supabase response - error:', !!error);
    logger.log('🔐 [authService] Supabase response - session:', !!data?.session);
    logger.log('🔐 [authService] Supabase response - user:', !!data?.user);
    
    if (error) {
      logger.error('❌ [authService] Supabase auth error:', error.message);
      throw error;
    }
    
    logger.log('✅ [authService] Sign in successful, returning data');
    return data;
  } catch (error) {
    logger.error('❌ [authService] Error signing in:', error);
    throw error;
  }
};

// Sign up with Google OAuth (checks if user already exists)
export const signUpWithGoogle = async () => {
  try {
    logger.log('🔍 Starting Google OAuth sign-up flow...');
    logger.log('Platform:', Platform.OS);
    
    // Make sure we close any existing web browser sessions
    WebBrowser.maybeCompleteAuthSession();
    
    // Start the OAuth flow with Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'kanjilearningapp://signup',
        skipBrowserRedirect: true, // We'll handle the browser manually
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    });
    
    if (error) {
      logger.error('❌ Supabase OAuth error:', error);
      throw error;
    }
    
    logger.log('✅ OAuth URL generated:', data?.url ? 'Yes' : 'No');
    logger.log('OAuth URL preview:', data?.url ? `${data.url.substring(0, 50)}...` : 'None');
    
    // On native platforms, we need to open the authorization URL in a web browser
    if (data?.url && (Platform.OS === 'ios' || Platform.OS === 'android')) {
      logger.log('🌐 Opening OAuth URL in browser...');
      
      // Open the URL in an in-app browser and wait for the callback
      const result = await WebBrowser.openAuthSessionAsync(
        data.url, 
        'kanjilearningapp://signup',
        {
          showInRecents: false,
        }
      );
      
      logger.log('🔄 Browser session result:', result.type);
      logger.log('🔄 Browser session URL:', result.type === 'success' ? result.url : 'No URL');
      
      if (result.type === 'cancel') {
        throw new Error('OAuth flow was cancelled by user');
      }
      
      if (result.type === 'dismiss') {
        throw new Error('OAuth flow was dismissed');
      }
      
      // If we got a successful result with a URL, process it
      if (result.type === 'success' && result.url) {
        logger.log('🔗 Processing OAuth callback URL:', result.url);
        
        // Parse the callback URL
        const callbackUrl = new URL(result.url);
        
        // Check for authorization code (PKCE flow)
        const code = callbackUrl.searchParams.get('code');
        
        if (code) {
          logger.log('🔗 Processing authorization code from PKCE flow');
          
          // Exchange the authorization code for a session
          const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
          
          if (sessionError) {
            logger.error('🔗 Error exchanging code for session:', sessionError.message);
            throw sessionError;
          } else if (sessionData.session) {
            // Check if this is a new user or existing user
            const user = sessionData.session.user;
            const isNewUser = new Date(user.created_at).getTime() === new Date(user.last_sign_in_at || user.created_at).getTime();
            
            if (!isNewUser) {
              // User already exists - this should be a sign-in instead
              logger.log('🔗 Existing user detected during sign-up:', user.email);
              
              // Sign out the user since they should use sign-in instead
              await supabase.auth.signOut();
              
              throw new Error('Account already exists. Please use "Continue with Google" to sign in instead.');
            }
            
            logger.log('🔗 New user account created via Google:', user.email);
            return sessionData;
          }
        } else {
          // Fallback: Check for tokens in URL fragment (implicit flow)
          const fragment = callbackUrl.hash.substring(1); // Remove the # character
          
          if (fragment) {
            logger.log('🔗 Processing OAuth fragment (implicit flow):', fragment);
            
            const params = new URLSearchParams(fragment);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            
            if (accessToken) {
              logger.log('🔗 Setting session from OAuth tokens');
              
              // Set the session using the tokens
              const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || '',
              });
              
              if (sessionError) {
                logger.error('🔗 Error setting OAuth session:', sessionError.message);
                throw sessionError;
              } else if (sessionData.session) {
                // Check if this is a new user or existing user
                const user = sessionData.session.user;
                const isNewUser = new Date(user.created_at).getTime() === new Date(user.last_sign_in_at || user.created_at).getTime();
                
                if (!isNewUser) {
                  // User already exists - this should be a sign-in instead
                  logger.log('🔗 Existing user detected during sign-up:', user.email);
                  
                  // Sign out the user since they should use sign-in instead
                  await supabase.auth.signOut();
                  
                  throw new Error('Account already exists. Please use "Continue with Google" to sign in instead.');
                }
                
                logger.log('🔗 New user account created via Google:', user.email);
                return sessionData;
              }
            }
          }
          
          logger.error('🔗 No authorization code or access token found in OAuth callback');
          throw new Error('OAuth callback did not contain valid authentication data');
        }
      }
    }
    
    return data;
  } catch (error: any) {
    logger.error('❌ Error signing up with Google:', error);
    
    // Provide more specific error messages
    if (error.message?.includes('Account already exists')) {
      throw error; // Re-throw our custom message
    } else if (error.message?.includes('Invalid login credentials')) {
      throw new Error('Google authentication failed. Please try again.');
    } else if (error.message?.includes('OAuth client not found')) {
      throw new Error('Google OAuth is not properly configured. Please contact support.');
    } else if (error.message?.includes('redirect_uri_mismatch')) {
      throw new Error('OAuth configuration error. Please contact support.');
    }
    
    throw error;
  }
};

// Sign in with Google OAuth
export const signInWithGoogle = async () => {
  try {
    logger.log('🔍 Starting Google OAuth flow...');
    logger.log('Platform:', Platform.OS);
    
    // Make sure we close any existing web browser sessions
    WebBrowser.maybeCompleteAuthSession();
    
    // Start the OAuth flow with Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'kanjilearningapp://login',
        skipBrowserRedirect: true, // We'll handle the browser manually
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    });
    
    if (error) {
      logger.error('❌ Supabase OAuth error:', error);
      throw error;
    }
    
    logger.log('✅ OAuth URL generated:', data?.url ? 'Yes' : 'No');
    logger.log('OAuth URL preview:', data?.url ? `${data.url.substring(0, 50)}...` : 'None');
    
    // On native platforms, we need to open the authorization URL in a web browser
    if (data?.url && (Platform.OS === 'ios' || Platform.OS === 'android')) {
      logger.log('🌐 Opening OAuth URL in browser...');
      
      // Open the URL in an in-app browser and wait for the callback
      const result = await WebBrowser.openAuthSessionAsync(
        data.url, 
        'kanjilearningapp://login',
        {
          showInRecents: false,
        }
      );
      
      logger.log('🔄 Browser session result:', result.type);
      logger.log('🔄 Browser session URL:', result.type === 'success' ? result.url : 'No URL');
      
      if (result.type === 'cancel') {
        throw new Error('OAuth flow was cancelled by user');
      }
      
      if (result.type === 'dismiss') {
        throw new Error('OAuth flow was dismissed');
      }
      
      // If we got a successful result with a URL, process it
      if (result.type === 'success' && result.url) {
        logger.log('🔗 Processing OAuth callback URL:', result.url);
        
        // Parse the callback URL
        const callbackUrl = new URL(result.url);
        
        // Check for authorization code (PKCE flow)
        const code = callbackUrl.searchParams.get('code');
        
        if (code) {
          logger.log('🔗 Processing authorization code from PKCE flow');
          
          // Exchange the authorization code for a session
          // Supabase will handle this automatically when we call getSession
          // after the OAuth flow completes
          const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
          
          if (sessionError) {
            logger.error('🔗 Error exchanging code for session:', sessionError.message);
            throw sessionError;
          } else if (sessionData.session) {
            logger.log('🔗 OAuth session established via PKCE:', sessionData.session.user?.email);
            return sessionData;
          }
        } else {
          // Fallback: Check for tokens in URL fragment (implicit flow)
          const fragment = callbackUrl.hash.substring(1); // Remove the # character
          
          if (fragment) {
            logger.log('🔗 Processing OAuth fragment (implicit flow):', fragment);
            
            const params = new URLSearchParams(fragment);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            
            if (accessToken) {
              logger.log('🔗 Setting session from OAuth tokens');
              
              // Set the session using the tokens
              const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || '',
              });
              
              if (sessionError) {
                logger.error('🔗 Error setting OAuth session:', sessionError.message);
                throw sessionError;
              } else if (sessionData.session) {
                logger.log('🔗 OAuth session established via tokens:', sessionData.session.user?.email);
                return sessionData;
              }
            }
          }
          
          logger.error('🔗 No authorization code or access token found in OAuth callback');
          throw new Error('OAuth callback did not contain valid authentication data');
        }
      }
    }
    
    return data;
  } catch (error: any) {
    logger.error('❌ Error signing in with Google:', error);
    
    // Provide more specific error messages
    if (error.message?.includes('Invalid login credentials')) {
      throw new Error('Google authentication failed. Please try again.');
    } else if (error.message?.includes('OAuth client not found')) {
      throw new Error('Google OAuth is not properly configured. Please contact support.');
    } else if (error.message?.includes('redirect_uri_mismatch')) {
      throw new Error('OAuth configuration error. Please contact support.');
    }
    
    throw error;
  }
};

// Sign in with Apple (Native iOS + Web fallback)
export const signInWithApple = async () => {
  try {
    logger.log('🍎 Starting Apple Sign In flow...');
    logger.log('🍎 Platform:', Platform.OS);
    
    // Check if Apple Sign In is available (iOS 13+)
    if (Platform.OS === 'ios') {
      logger.log('🍎 Checking Apple Sign In availability...');
      
      // Check if Sign In with Apple is supported on this device
      const isSupported = await appleAuth.isSupported;
      logger.log('🍎 Apple Sign In supported:', isSupported);
      
      if (isSupported) {
        return await signInWithAppleNative();
      } else {
        logger.log('🍎 Native Apple Sign In not supported, falling back to web OAuth');
        return await signInWithAppleWeb();
      }
    } else {
      // For Android and Web, use web-based OAuth
      logger.log('🍎 Using web-based Apple OAuth for non-iOS platform');
      return await signInWithAppleWeb();
    }
  } catch (error: any) {
    logger.error('❌ Error in Apple Sign In:', error);
    
    // Provide more specific error messages
    if (error.code === '1001') {
      throw new Error('Apple Sign In was cancelled by user');
    } else if (error.code === '1000') {
      throw new Error('Apple Sign In failed. Please try again.');
    } else if (error.message?.includes('not supported')) {
      throw new Error('Apple Sign In is not available on this device');
    }
    
    throw error;
  }
};

// Native Apple Sign In for iOS
const signInWithAppleNative = async () => {
  try {
    logger.log('🍎 Starting native Apple Sign In...');
    
    // Generate a cryptographically secure nonce (best practice for security)
    const generateNonce = (): string => {
      const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
      let result = '';
      for (let i = 0; i < 32; i++) {
        result += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return result;
    };
    
    const nonce = generateNonce();
    logger.log('🍎 Generated nonce for security');
    
    // Perform the sign in request with nonce
    const appleAuthRequestResponse = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      nonce: nonce, // Pass nonce to Apple
    });
    
    logger.log('🍎 Apple Auth Response received');
    logger.log('🍎 User ID:', appleAuthRequestResponse.user ? 'Present' : 'None');
    logger.log('🍎 Email:', appleAuthRequestResponse.email ? 'Present' : 'None');
    logger.log('🍎 Identity Token:', appleAuthRequestResponse.identityToken ? 'Present' : 'None');
    
    // Check if we got the required data
    if (!appleAuthRequestResponse.identityToken) {
      throw new Error('Apple Sign In did not return required identity token');
    }
    
    // Get the credential state for the user
    const credentialState = await appleAuth.getCredentialStateForUser(appleAuthRequestResponse.user);
    logger.log('🍎 Credential State:', credentialState);
    
    if (credentialState !== appleAuth.State.AUTHORIZED) {
      throw new Error('Apple credentials are not authorized');
    }
    
    // Create the custom token data for Supabase
    const tokenData = {
      provider: 'apple',
      access_token: appleAuthRequestResponse.identityToken,
      id_token: appleAuthRequestResponse.identityToken,
    };
    
    logger.log('🍎 Signing in to Supabase with Apple credentials...');
    
    // Sign in to Supabase using the Apple identity token
    // This is the correct method for native Apple Sign In
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: appleAuthRequestResponse.identityToken,
      nonce: nonce, // Pass the same nonce to Supabase for verification
    });
    
    if (error) {
      logger.error('🍎 Supabase Apple Sign In error:', error.message);
      throw error;
    }
    
    if (data.session) {
      logger.log('✅ Apple Sign In successful:', data.session.user?.email);
      
      // Update user metadata if we have name information
      if (appleAuthRequestResponse.fullName) {
        const { givenName, familyName } = appleAuthRequestResponse.fullName;
        const fullName = [givenName, familyName].filter(Boolean).join(' ');
        
        if (fullName) {
          logger.log('🍎 Updating user profile with name:', fullName);
          try {
            await supabase.auth.updateUser({
              data: { full_name: fullName }
            });
          } catch (updateError) {
            logger.warn('🍎 Could not update user profile:', updateError);
            // Don't throw here, as the sign in was successful
          }
        }
      }
    }
    
    return data;
  } catch (error: any) {
    logger.error('❌ Native Apple Sign In error:', error);
    throw error;
  }
};

// Web-based Apple OAuth fallback
const signInWithAppleWeb = async () => {
  try {
    logger.log('🍎 Starting web-based Apple OAuth...');
    
    // Make sure we close any existing web browser sessions
    WebBrowser.maybeCompleteAuthSession();
    
    // Start the OAuth flow with Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: 'kanjilearningapp://login',
        skipBrowserRedirect: Platform.OS === 'web' ? false : true,
      }
    });
    
    if (error) {
      logger.error('🍎 Supabase Apple OAuth error:', error);
      throw error;
    }
    
    logger.log('🍎 OAuth URL generated:', data?.url ? 'Yes' : 'No');
    
    // On native platforms, open the authorization URL in a web browser
    if (data?.url && (Platform.OS === 'ios' || Platform.OS === 'android')) {
      logger.log('🌐 Opening Apple OAuth URL in browser...');
      
      const result = await WebBrowser.openAuthSessionAsync(
        data.url, 
        'kanjilearningapp://login',
        {
          showInRecents: false,
        }
      );
      
      logger.log('🔄 Browser session result:', result.type);
      
      if (result.type === 'cancel') {
        throw new Error('Apple Sign In was cancelled by user');
      }
      
      if (result.type === 'dismiss') {
        throw new Error('Apple Sign In was dismissed');
      }
      
      // Process the callback URL if successful
      if (result.type === 'success' && result.url) {
        logger.log('🔗 Processing Apple OAuth callback URL...');
        
        const callbackUrl = new URL(result.url);
        const code = callbackUrl.searchParams.get('code');
        
        if (code) {
          logger.log('🔗 Processing authorization code from Apple PKCE flow');
          
          const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
          
          if (sessionError) {
            logger.error('🔗 Error exchanging Apple code for session:', sessionError.message);
            throw sessionError;
          } else if (sessionData.session) {
            logger.log('✅ Apple OAuth session established:', sessionData.session.user?.email);
            return sessionData;
          }
        }
      }
    }
    
    return data;
  } catch (error: any) {
    logger.error('❌ Web Apple OAuth error:', error);
    throw error;
  }
};

// Get OAuth session from URL
export const getOAuthSession = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  } catch (error) {
    logger.error('Error getting OAuth session:', error);
    return null;
  }
};

// Sign out
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    logger.error('Error signing out:', error);
    throw error;
  }
};

// Get current session
export const getSession = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  } catch (error) {
    logger.error('Error getting session:', error);
    return null;
  }
};

// Reset password
export const resetPassword = async (email: string) => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'kanjilearningapp://reset-password',
    });
    
    if (error) throw error;
    return true;
  } catch (error) {
    logger.error('Error resetting password:', error);
    throw error;
  }
};

// Update user profile
export const updateProfile = async (profile: { username?: string, avatar_url?: string }) => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      data: profile,
    });
    
    if (error) throw error;
    return data.user;
  } catch (error) {
    logger.error('Error updating profile:', error);
    throw error;
  }
};

// Subscribe to auth changes
export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  return supabase.auth.onAuthStateChange(callback);
};

// Add default export to satisfy Expo Router's requirement
export default {
  signUp,
  signIn,
  signOut,
  getSession,
  resetPassword,
  updateProfile,
  onAuthStateChange,
  signInWithGoogle,
  signInWithApple,
  getOAuthSession,
  signUpWithGoogle
}; 