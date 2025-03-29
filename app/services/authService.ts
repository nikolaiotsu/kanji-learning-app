import { supabase } from './supabaseClient';

// Sign up with email and password
export const signUp = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error signing up:', error);
    throw error;
  }
};

// DEV ONLY: Sign up without email confirmation (remove before production)
export const devSignUpAndSignIn = async (email: string, password: string) => {
  try {
    console.log('Starting dev sign-up and sign-in for:', email);
    
    // First try to sign up
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (signUpError) {
      console.log('Sign-up error:', signUpError.message);
      
      // If "User already registered" error, try to sign in directly
      if (signUpError.message.includes('User already registered')) {
        console.log('User already exists, trying direct sign-in');
        return await signIn(email, password);
      }
      throw signUpError;
    }
    
    console.log('Sign-up successful, userId:', signUpData?.user?.id);
    console.log('Attempting immediate sign-in');
    
    // If sign up successful, attempt to sign in immediately
    // This is only for development to bypass email verification
    const signInResult = await signIn(email, password);
    console.log('Sign-in successful');
    
    return signInResult;
  } catch (error) {
    console.error('Error in dev sign up and sign in:', error);
    throw error;
  }
};

// Sign in with email and password
export const signIn = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error signing in:', error);
    throw error;
  }
};

// Sign out
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('Error signing out:', error);
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
    console.error('Error getting session:', error);
    return null;
  }
};

// Reset password
export const resetPassword = async (email: string) => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'kanjiapp://reset-password',
    });
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error resetting password:', error);
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
    console.error('Error updating profile:', error);
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
  onAuthStateChange
}; 