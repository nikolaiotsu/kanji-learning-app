import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useNetworkState } from '../../services/networkManager';

/**
 * OfflineBanner Component
 * Displays a compact orange cloud icon when offline
 * Shows for both: no internet connection AND offline mode (using cached data)
 * Used next to navigation buttons to indicate offline status
 */
interface OfflineBannerProps {
  visible?: boolean; // Optional - if not provided, auto-detects offline state
}

export const OfflineBanner = ({ visible }: OfflineBannerProps) => {
  const { isOfflineMode } = useAuth();
  const { isConnected } = useNetworkState();
  
  // Show if explicitly visible OR if offline (no connection or using cached data)
  const shouldShow = visible ?? (!isConnected || isOfflineMode);
  
  if (!shouldShow) {
    return null;
  }
  
  return (
    <View style={styles.container}>
      <Ionicons 
        name="cloud-offline-outline" 
        size={24} 
        color={COLORS.secondary} 
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default OfflineBanner;
