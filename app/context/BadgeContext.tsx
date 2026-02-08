import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Badge,
  UserBadge,
  incrementBadgeProgress,
  getUserBadges,
  getGuestEarnedBadges,
} from '../services/badgeService';
import { getCurrentUser } from '../services/supabaseClient';
import { getUserIdOffline } from '../services/offlineAuth';
import { logger } from '../utils/logger';

interface BadgeContextType {
  pendingBadge: Badge | null;
  earnedBadges: UserBadge[];
  setPendingBadge: (badge: Badge) => void;
  clearPendingBadge: () => void;
  checkAndUnlockBadges: (badgeType: string) => Promise<void>;
  refreshEarnedBadges: () => Promise<void>;
}

const BadgeContext = createContext<BadgeContextType | undefined>(undefined);

const PENDING_BADGE_STORAGE_KEY = 'badge_pending_badge';

export const BadgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingBadge, setPendingBadgeState] = useState<Badge | null>(null);
  const [earnedBadges, setEarnedBadges] = useState<UserBadge[]>([]);

  // Load pending badge from AsyncStorage on mount
  useEffect(() => {
    const loadPendingBadge = async () => {
      try {
        const stored = await AsyncStorage.getItem(PENDING_BADGE_STORAGE_KEY);
        if (stored) {
          const badge: Badge = JSON.parse(stored);
          setPendingBadgeState(badge);
        }
      } catch (error) {
        logger.error('[BadgeContext] Error loading pending badge:', error);
      }
    };

    loadPendingBadge();
  }, []);

  const loadEarnedBadges = useCallback(async () => {
    try {
      let userId: string | null = null;
      const user = await getCurrentUser();
      if (user) userId = user.id;
      if (!userId) userId = await getUserIdOffline();

      if (userId) {
        const badges = await getUserBadges(userId);
        setEarnedBadges(badges);
      } else {
        const guestBadges = await getGuestEarnedBadges();
        setEarnedBadges(guestBadges);
      }
    } catch (error) {
      logger.error('[BadgeContext] Error loading earned badges:', error);
    }
  }, []);

  useEffect(() => {
    loadEarnedBadges();
  }, [pendingBadge, loadEarnedBadges]);

  const setPendingBadge = useCallback((badge: Badge) => {
    setPendingBadgeState(badge);
    AsyncStorage.setItem(PENDING_BADGE_STORAGE_KEY, JSON.stringify(badge)).catch((err) =>
      logger.error('[BadgeContext] Error saving pending badge:', err)
    );
  }, []);

  const clearPendingBadge = useCallback(() => {
    setPendingBadgeState(null);
    AsyncStorage.removeItem(PENDING_BADGE_STORAGE_KEY).catch((err) =>
      logger.error('[BadgeContext] Error clearing pending badge:', err)
    );
  }, []);

  const checkAndUnlockBadges = useCallback(async (badgeType: string) => {
    try {
      const newlyUnlockedBadge = await incrementBadgeProgress(badgeType);
      if (newlyUnlockedBadge) {
        setPendingBadge(newlyUnlockedBadge);
        logger.log('[BadgeContext] New badge unlocked:', newlyUnlockedBadge.name);
      }
    } catch (error) {
      logger.error('[BadgeContext] Error checking/unlocking badges:', error);
    }
  }, []);

  return (
    <BadgeContext.Provider
      value={{
        pendingBadge,
        earnedBadges,
        setPendingBadge,
        clearPendingBadge,
        checkAndUnlockBadges,
        refreshEarnedBadges: loadEarnedBadges,
      }}
    >
      {children}
    </BadgeContext.Provider>
  );
};

export const useBadge = (): BadgeContextType => {
  const context = useContext(BadgeContext);
  if (!context) {
    throw new Error('useBadge must be used within a BadgeProvider');
  }
  return context;
};
