import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { Alert, InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, User } from '@supabase/supabase-js';
import * as authService from '../services/authService';
import { supabase } from '../services/supabaseClient';
import { syncAllUserData } from '../services/syncManager';
import { storeUserIdOffline, clearUserIdOffline, getUserIdOffline } from '../services/offlineAuth';
import { requestAccountDeletion } from '../services/userDataControlService';
import { clearCache } from '../services/offlineStorage';
import { isOnline } from '../services/networkManager';
import { hasLocalDataToMigrate, migrateLocalDataToSupabase } from '../services/localFlashcardStorage';

import { logger } from '../utils/logger';

const GUEST_MODE_STORAGE_KEY = '@worddex_guest_mode';

// Define the shape of our Auth context
type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isOfflineMode: boolean;
  isGuest: boolean;
  setGuestMode: (value: boolean) => Promise<void>;
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
  const [isGuest, setIsGuestState] = useState(false);

  // Load guest mode from storage on mount
  useEffect(() => {
    const loadGuestMode = async () => {
      try {
        const stored = await AsyncStorage.getItem(GUEST_MODE_STORAGE_KEY);
        setIsGuestState(stored === 'true');
      } catch (e) {
        logger.error('Failed to load guest mode:', e);
      }
    };
    loadGuestMode();
  }, []);

  const setGuestMode = async (value: boolean) => {
    // Set React state synchronously first so AuthGuard sees the change immediately
    // (prevents brief redirect to /login before async storage write completes)
    setIsGuestState(value);
    try {
      await AsyncStorage.setItem(GUEST_MODE_STORAGE_KEY, value ? 'true' : 'false');
    } catch (e) {
      logger.error('Failed to persist guest mode:', e);
    }
  };

  const clearGuestMode = async () => {
    try {
      await AsyncStorage.removeItem(GUEST_MODE_STORAGE_KEY);
      setIsGuestState(false);
    } catch (e) {
      logger.error('Failed to clear guest mode:', e);
      setIsGuestState(false);
    }
  };

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
        setIsOfflineMode(false);
        
        if (session?.user) {
          // Complete migration BEFORE setting user state so UI fetches cards after migration
          await clearGuestMode();
          await storeUserIdOffline(session.user.id);
          const hadLocal = await hasLocalDataToMigrate();
          if (hadLocal) {
            try {
              logger.log('🔄 [AuthContext] Migrating guest data on app start...');
              await migrateLocalDataToSupabase(session.user.id);
              Alert.alert('Synced', 'Your cards have been synced to your account.');
            } catch (migErr) {
              const msg = migErr instanceof Error ? migErr.message : String(migErr);
              logger.error('Migration on app start failed:', msg, migErr);
              Alert.alert(
                'Sync issue',
                'Guest cards could not be synced to your account. You can try again later or use your existing cards. ' + (msg ? `(${msg})` : '')
              );
            }
          }
          // NOW set user state - UI will fetch cards (even if migration failed, so user can still use the app)
          setUser(session.user);
          logger.log('🔄 [AuthContext] User already authenticated on app start, syncing cache...');
          syncAllUserData().catch(err => {
            // Silent error - don't log network errors during sync
            const errorStr = err instanceof Error ? err.message : String(err);
            if (!errorStr.toLowerCase().includes('network')) {
              logger.error('❌ [AuthContext] Failed to sync user data on app start:', err);
            }
          });
        } else {
          setUser(null);
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
        
        // For SIGNED_IN events, we need to complete migration BEFORE setting user state.
        // Otherwise UI components will fetch cards before migration finishes.
        // Defer with InteractionManager so we don't block the UI when returning from OAuth browser.
        if (event === 'SIGNED_IN' && session?.user) {
          logger.log('🔐 [AuthContext] SIGNED_IN - deferring guest data migration...');
          setSession(session);
          setIsOfflineMode(false);
          const signedInUser = session.user;

          InteractionManager.runAfterInteractions(() => {
            (async () => {
              try {
                await clearGuestMode();
                await storeUserIdOffline(signedInUser.id);
                const hadLocal = await hasLocalDataToMigrate();
                if (hadLocal) {
                  try {
                    logger.log('🔄 [AuthContext] Migrating guest data before setting user state...');
                    await migrateLocalDataToSupabase(signedInUser.id);
                    Alert.alert('Synced', 'Your cards have been synced to your account.');
                  } catch (migErr) {
                    const msg = migErr instanceof Error ? migErr.message : String(migErr);
                    logger.error('Migration on sign-in failed:', msg, migErr);
                    Alert.alert(
                      'Sync issue',
                      'Guest cards could not be synced to your account. You can try again later or use your existing cards. ' + (msg ? `(${msg})` : '')
                    );
                  }
                }
                logger.log('🔐 [AuthContext] Migration complete, setting user state...');
              } catch (err) {
                logger.error('🔐 [AuthContext] Error during sign-in migration/setup:', err);
              } finally {
                setUser(signedInUser);
                setIsLoading(false);
                logger.log('✅ [AuthContext] Auth state updated (after migration)');
                syncAllUserData().catch(syncErr => {
                  logger.error('❌ [AuthContext] Failed to sync user data after auth state change:', syncErr);
                });
              }
            })();
          });
        } else {
          // For all other events (SIGNED_OUT, TOKEN_REFRESHED, etc.), set state immediately
          logger.log('🔐 [AuthContext] Setting session and user state...');
          setSession(session);
          setUser(session?.user ?? null);
          setIsOfflineMode(false);
          setIsLoading(false);
          logger.log('✅ [AuthContext] Auth state updated');
          
          if (session?.user) {
            await clearGuestMode();
            await storeUserIdOffline(session.user.id);
          } else if (event === 'SIGNED_OUT') {
            await clearUserIdOffline();
          }
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
      await clearUserIdOffline();
      await clearGuestMode();
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
    isGuest,
    setGuestMode,
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