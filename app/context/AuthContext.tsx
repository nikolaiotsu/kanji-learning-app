import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as authService from '../services/authService';
import { supabase } from '../services/supabaseClient';
import { syncAllUserData } from '../services/syncManager';
import { storeUserIdOffline, clearUserIdOffline } from '../services/offlineAuth';

import { logger } from '../utils/logger';
// Define the shape of our Auth context
type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ user: User | null; session: Session | null } | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
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

  // Check for session on mount
  useEffect(() => {
    const getInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        
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
        // Silent error for network issues - auth state can be restored from local storage
        const errorStr = error instanceof Error ? error.message : String(error);
        if (!errorStr.toLowerCase().includes('network')) {
          logger.error('Error getting initial session:', error);
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
    signIn,
    signUp,
    signOut,
    resetPassword,
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