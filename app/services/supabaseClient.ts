import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY } from '@env';

import { logger } from '../utils/logger';
// Get the Supabase URL and anon key from environment variables
const supabaseUrl = EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('Supabase URL or Anon Key is missing! Check your .env file and babel.config.js');
}

logger.log('Supabase URL from @env:', supabaseUrl ? `${supabaseUrl.substring(0, 5)}...` : 'undefined');
logger.log('Supabase Key from @env exists:', !!supabaseAnonKey);

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // We handle OAuth callbacks manually
    flowType: 'pkce', // Use PKCE flow for better security
  },
});

// Export a function to get the current user
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Export a function to check if a user is logged in
export const isAuthenticated = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
};

// Add default export to satisfy Expo Router's requirement
export default { 
  supabase,
  getCurrentUser,
  isAuthenticated
}; 