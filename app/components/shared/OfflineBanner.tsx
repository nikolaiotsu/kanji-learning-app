import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { onSyncStatusChange, getIsSyncing } from '../../services/syncManager';

interface OfflineBannerProps {
  visible: boolean;
}

const OfflineBanner: React.FC<OfflineBannerProps> = ({ visible }) => {
  const [isSyncing, setIsSyncing] = useState(getIsSyncing());
  
  // Listen to sync status changes
  useEffect(() => {
    const unsubscribe = onSyncStatusChange((syncing) => {
      setIsSyncing(syncing);
    });
    
    return unsubscribe;
  }, []);
  
  // Show sync indicator even when online
  if (isSyncing) {
    return (
      <View style={[styles.container, styles.syncingContainer]}>
        <ActivityIndicator size="small" color={COLORS.text} />
      </View>
    );
  }
  
  // Show offline indicator when offline
  if (visible) {
    return (
      <View style={styles.container}>
        <Ionicons name="cloud-offline" size={18} color={COLORS.text} />
      </View>
    );
  }
  
  return null;
};

const styles = StyleSheet.create({
  container: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255, 152, 0, 0.3)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.5)',
    marginHorizontal: 8,
  },
  syncingContainer: {
    backgroundColor: 'rgba(33, 150, 243, 0.3)',
    borderColor: 'rgba(33, 150, 243, 0.5)',
  },
});

export default OfflineBanner;

