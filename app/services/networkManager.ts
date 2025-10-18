import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { logger } from '../utils/logger';

/**
 * Network Manager Service
 * Handles network state detection and monitoring
 */

let currentNetworkState: NetInfoState | null = null;

// Initialize network state listener
NetInfo.fetch().then(state => {
  currentNetworkState = state;
  logger.log('🌐 [NetworkManager] Initial network state:', state.isConnected ? 'Online' : 'Offline');
});

/**
 * Check if device is currently online
 */
export const isOnline = async (): Promise<boolean> => {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
  } catch (error) {
    logger.error('Error checking network state:', error);
    // Default to online to avoid blocking functionality
    return true;
  }
};

/**
 * Get current network state synchronously (may be stale)
 */
export const getCurrentNetworkState = (): boolean => {
  return currentNetworkState?.isConnected ?? true;
};

/**
 * Subscribe to network state changes
 * Returns unsubscribe function
 */
export const onNetworkChange = (callback: (isConnected: boolean) => void): (() => void) => {
  const unsubscribe = NetInfo.addEventListener(state => {
    currentNetworkState = state;
    const connected = state.isConnected ?? false;
    logger.log('🌐 [NetworkManager] Network state changed:', connected ? 'Online' : 'Offline');
    callback(connected);
  });

  return unsubscribe;
};

/**
 * React hook for network state
 * Returns current network status and updates on change
 */
export const useNetworkState = () => {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then(state => {
      setIsConnected(state.isConnected ?? true);
      setIsLoading(false);
    });

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected ?? true;
      setIsConnected(connected);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return { isConnected, isLoading };
};

/**
 * Check if an error is a network-related error
 * Used to distinguish between network failures (use cache) vs real errors (show to user)
 */
export const isNetworkError = (error: any): boolean => {
  if (!error) return false;
  
  const errorString = error.toString().toLowerCase();
  const errorMessage = error.message?.toLowerCase() || '';
  
  // Check for common network error patterns
  const networkErrorPatterns = [
    'network request failed',
    'network error',
    'failed to fetch',
    'fetch failed',
    'timeout',
    'connection',
    'econnrefused',
    'enotfound',
    'offline',
    'no internet',
    'socket hang up',
  ];
  
  return networkErrorPatterns.some(pattern => 
    errorString.includes(pattern) || errorMessage.includes(pattern)
  );
};

