import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as authService from '../services/authService';
import { supabase } from '../services/supabaseClient';
import { syncAllUserData } from '../services/syncManager';
import { storeUserIdOffline, clearUserIdOffline, getUserIdOffline } from '../services/offlineAuth';
import { requestAccountDeletion } from '../services/userDataControlService';
import { clearCache } from '../services/offlineStorage';
import { isOnline } from '../services/networkManager';

import { logger } from '../utils/logger';
// Define the shape of our Auth context
type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isOfflineMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ user: User | null; session: Session | null } | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
};

// Create the Auth context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider props
type AuthProviderProps = {
  children: ReactNode;
};

// Auth Provider component
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Check for session on mount
  useEffect(() => {
    const getInitialSession = async () => {
      try {
        // Check network status first for offline-first approach
        const online = await isOnline();
        
        if (!online) {
          logger.log('📶 [AuthContext] Offline - checking for cached user...');
          
          // Try to get cached user ID for offline mode
          const cachedUserId = await getUserIdOffline();
          
          if (cachedUserId) {
            logger.log('✅ [AuthContext] Found cached user, entering offline mode');
            // Create a minimal "offline user" object to allow app access
            setUser({ id: cachedUserId } as User);
            setIsOfflineMode(true);
          } else {
            logger.log('⚠️ [AuthContext] No cached user - user will need to connect to sign in');
            // No cached user - they'll need to go online to authenticate
          }
          
          setIsLoading(false);
          return;
        }

        // Online flow - proceed with normal Supabase auth
        logger.log('🌐 [AuthContext] Online - checking Supabase session...');
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        setIsOfflineMode(false);
        
        // Store user ID offline for cache access when offline
        if (session?.user) {
          await storeUserIdOffline(session.user.id);
          logger.log('🔄 [AuthContext] User already authenticated on app start, syncing cache...');
          syncAllUserData().catch(err => {
            // Silent error - don't log network errors during sync
            const errorStr = err instanceof Error ? err.message : String(err);
            if (!errorStr.toLowerCase().includes('network')) {
              logger.error('❌ [AuthContext] Failed to sync user data on app start:', err);
            }
          });
        }
      } catch (error) {
        // On error (likely network), try offline fallback
        logger.log('⚠️ [AuthContext] Error getting session, trying offline fallback...');
        const cachedUserId = await getUserIdOffline();
        
        if (cachedUserId) {
          logger.log('✅ [AuthContext] Fallback: Found cached user, entering offline mode');
          setUser({ id: cachedUserId } as User);
          setIsOfflineMode(true);
        } else {
          // Silent error for network issues when no cached user
          const errorStr = error instanceof Error ? error.message : String(error);
          if (!errorStr.toLowerCase().includes('network')) {
            logger.error('Error getting initial session:', error);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    getInitialSession();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.log('🔐 [AuthContext] Auth state change event:', event);
        logger.log('🔐 [AuthContext] Session exists:', !!session);
        logger.log('🔐 [AuthContext] User email:', session?.user?.email || 'No user');
        logger.log('🔐 [AuthContext] Setting session and user state...');
        setSession(session);
        setUser(session?.user ?? null);
        setIsOfflineMode(false); // We're online if we got an auth state change
        setIsLoading(false);
        logger.log('✅ [AuthContext] Auth state updated');
        
        // Store or clear user ID for offline access
        if (session?.user) {
          await storeUserIdOffline(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          await clearUserIdOffline();
        }
        
        // Trigger cache sync when user signs in via auth state change
        if (event === 'SIGNED_IN' && session?.user) {
          logger.log('🔄 [AuthContext] User signed in via auth state change, syncing cache...');
          syncAllUserData().catch(err => {
            logger.error('❌ [AuthContext] Failed to sync user data after auth state change:', err);
          });
        }
      }
    );

    // Cleanup subscription
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sign in function
  const signIn = async (email: string, password: string) => {
    logger.log('🔐 [AuthContext] signIn called with email:', email);
    setIsLoading(true);
    try {
      logger.log('🔐 [AuthContext] Calling authService.signIn...');
      const { session } = await authService.signIn(email, password);
      logger.log('🔐 [AuthContext] authService.signIn returned session:', !!session);
      logger.log('🔐 [AuthContext] Session user email:', session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      logger.log('✅ [AuthContext] Session and user state updated');
      
      // Trigger proactive cache sync after successful login
      logger.log('🔄 [AuthContext] Triggering proactive cache sync...');
      syncAllUserData().catch(err => {
        logger.error('❌ [AuthContext] Failed to sync user data after login:', err);
        // Don't throw - login was successful, sync is just a bonus
      });
    } catch (error) {
      logger.error('❌ [AuthContext] Error signing in:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Sign up function
  const signUp = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      logger.log('🔐 [AuthContext] signUp called with email:', email);
      const data = await authService.signUp(email, password);
      
      if (data?.session) {
        logger.log('✅ [AuthContext] User signed up, setting session');
        setSession(data.session);
        setUser(data.session.user);
        
        // Trigger proactive cache sync after successful signup
        logger.log('🔄 [AuthContext] Triggering proactive cache sync...');
        syncAllUserData().catch(err => {
          logger.error('❌ [AuthContext] Failed to sync user data after signup:', err);
          // Don't throw - signup was successful, sync is just a bonus
        });
      }
      
      return data ? { user: data.user, session: data.session } : null;
    } catch (error) {
      logger.error('❌ [AuthContext] Error signing up:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Sign out function
  const signOut = async () => {
    setIsLoading(true);
    try {
      await authService.signOut();
      await clearUserIdOffline(); // Clear offline user ID
      setSession(null);
      setUser(null);
    } catch (error) {
      logger.error('Error signing out:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Delete account function
  const deleteAccount = async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      logger.log('🗑️ [AuthContext] Starting account deletion...');
      
      // Request account deletion via Edge Function
      const result = await requestAccountDeletion();
      
      if (!result.success) {
        logger.error('❌ [AuthContext] Account deletion failed:', result.error);
        return result;
      }
      
      logger.log('✅ [AuthContext] Account deleted successfully, cleaning up...');
      
      // Clear offline user ID and local cache
      await clearUserIdOffline();
      
      // Clear auth state
      setSession(null);
      setUser(null);
      
      return { success: true };
    } catch (error) {
      logger.error('❌ [AuthContext] Error deleting account:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    } finally {
      setIsLoading(false);
    }
  };

  // Reset password function
  const resetPassword = async (email: string) => {
    try {
      await authService.resetPassword(email);
    } catch (error) {
      logger.error('Error resetting password:', error);
      throw error;
    }
  };

  // Context value
  const value = {
    user,
    session,
    isLoading,
    isOfflineMode,
    signIn,
    signUp,
    signOut,
    resetPassword,
    deleteAccount,
  };

  // Provide the Auth context to children
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the Auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Add default export to satisfy Expo Router's requirement
export default {
  AuthContext,
  AuthProvider,
  useAuth
}; 