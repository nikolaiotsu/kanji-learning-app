import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCurrentUser } from './supabaseClient';
import { getUserIdOffline } from './offlineAuth';
import { logger } from '../utils/logger';

export interface Badge {
  id: string;
  name: string;
  description: string;
  imagePath: string;
  badgeType: string;
  threshold: number;
  createdAt: string;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: string;
  badge?: Badge;
}

const GUEST_BADGE_PROGRESS_KEY = 'guest_badge_progress';
const GUEST_EARNED_BADGES_KEY = 'guest_earned_badges';

/** Static badge definitions for guests (no DB). Must match badges table for cards_created. */
const GUEST_CARDS_CREATED_BADGES: Badge[] = [
  { id: 'guest_fc_1', name: '', description: '', imagePath: 'fc1.png', badgeType: 'cards_created', threshold: 1, createdAt: '' },
  { id: 'guest_fc_3', name: '', description: '', imagePath: 'fc3.png', badgeType: 'cards_created', threshold: 3, createdAt: '' },
  { id: 'guest_fc_10', name: '', description: '', imagePath: 'fc10.png', badgeType: 'cards_created', threshold: 10, createdAt: '' },
  { id: 'guest_fc_25', name: '', description: '', imagePath: 'fc25.png', badgeType: 'cards_created', threshold: 25, createdAt: '' },
  { id: 'guest_fc_50', name: '', description: '', imagePath: 'fc50.png', badgeType: 'cards_created', threshold: 50, createdAt: '' },
  { id: 'guest_fc_100', name: '', description: '', imagePath: 'fc100.png', badgeType: 'cards_created', threshold: 100, createdAt: '' },
  { id: 'guest_fc_250', name: '', description: '', imagePath: 'fc250.png', badgeType: 'cards_created', threshold: 250, createdAt: '' },
];

const transformBadge = (row: Record<string, unknown>): Badge => ({
  id: row.id as string,
  name: row.name as string,
  description: row.description as string,
  imagePath: row.image_path as string,
  badgeType: row.badge_type as string,
  threshold: (row.threshold as number) ?? 1,
  createdAt: row.created_at as string,
});

/**
 * Get user ID - tries Supabase first, falls back to offline storage
 */
const getUserId = async (): Promise<string | null> => {
  try {
    const user = await getCurrentUser();
    if (user) return user.id;
  } catch {
    logger.log('[BadgeService] Supabase failed, trying offline storage...');
  }
  return getUserIdOffline();
};

/**
 * Guest: increment progress in AsyncStorage and return newly unlocked badge if any.
 */
async function incrementGuestBadgeProgress(badgeType: string): Promise<Badge | null> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_BADGE_PROGRESS_KEY);
    const progress: Record<string, number> = raw ? JSON.parse(raw) : {};
    const count = (progress[badgeType] ?? 0) + 1;
    progress[badgeType] = count;
    await AsyncStorage.setItem(GUEST_BADGE_PROGRESS_KEY, JSON.stringify(progress));

    const earnedRaw = await AsyncStorage.getItem(GUEST_EARNED_BADGES_KEY);
    const earned: { badgeId: string; earnedAt: string }[] = earnedRaw ? JSON.parse(earnedRaw) : [];
    const earnedIds = new Set(earned.map((e) => e.badgeId));

    const badges = badgeType === 'cards_created' ? GUEST_CARDS_CREATED_BADGES : [];
    if (badges.length === 0) return null;

    // Newly unlocked: threshold <= count and not already earned; pick highest such threshold
    let toUnlock: Badge | null = null;
    for (const b of badges) {
      if (b.threshold <= count && !earnedIds.has(b.id)) toUnlock = b;
    }
    if (!toUnlock) return null;

    const earnedAt = new Date().toISOString();
    earned.push({ badgeId: toUnlock.id, earnedAt });
    await AsyncStorage.setItem(GUEST_EARNED_BADGES_KEY, JSON.stringify(earned));

    const badge: Badge = { ...toUnlock, createdAt: earnedAt };
    logger.log('[BadgeService] Guest unlocked badge:', badge.id);
    return badge;
  } catch (error) {
    logger.error('[BadgeService] Error in incrementGuestBadgeProgress:', error);
    return null;
  }
}

/**
 * Increment badge progress and check for newly unlocked badges.
 * Returns the badge if a new badge was unlocked, null otherwise.
 * Supports guests via AsyncStorage when no user is signed in.
 */
export async function incrementBadgeProgress(badgeType: string): Promise<Badge | null> {
  const userId = await getUserId();
  if (!userId) {
    return incrementGuestBadgeProgress(badgeType);
  }

  try {
    // Atomic increment via RPC
    const { data: newCount, error: rpcError } = await supabase.rpc('increment_badge_progress', {
      p_user_id: userId,
      p_badge_type: badgeType,
    });

    if (rpcError) {
      logger.error('[BadgeService] Failed to increment progress:', rpcError);
      return null;
    }

    const count = (newCount as number) ?? 0;

    // Find badges where threshold is now met
    const { data: badges, error: badgesError } = await supabase
      .from('badges')
      .select('*')
      .eq('badge_type', badgeType)
      .lte('threshold', count);

    if (badgesError || !badges?.length) {
      return null;
    }

    // Check which badges the user already has
    const badgeIds = badges.map((b) => b.id);
    const { data: existingUserBadges } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', userId)
      .in('badge_id', badgeIds);

    const earnedBadgeIds = new Set((existingUserBadges ?? []).map((ub) => ub.badge_id));

    // Find the first badge that is newly unlocked (threshold just met and not yet earned)
    for (const badgeRow of badges) {
      if (badgeRow.threshold <= count && !earnedBadgeIds.has(badgeRow.id)) {
        // Record the unlock
        const { error: insertError } = await supabase.from('user_badges').insert({
          user_id: userId,
          badge_id: badgeRow.id,
        });

        if (insertError) {
          logger.error('[BadgeService] Failed to record badge unlock:', insertError);
          return null;
        }

        return transformBadge(badgeRow as Record<string, unknown>);
      }
    }

    return null;
  } catch (error) {
    logger.error('[BadgeService] Error in incrementBadgeProgress:', error);
    return null;
  }
}

/**
 * Get earned badges for guest (from AsyncStorage). Used when user is not signed in.
 */
export async function getGuestEarnedBadges(): Promise<UserBadge[]> {
  try {
    const earnedRaw = await AsyncStorage.getItem(GUEST_EARNED_BADGES_KEY);
    const earned: { badgeId: string; earnedAt: string }[] = earnedRaw ? JSON.parse(earnedRaw) : [];
    const userBadges: UserBadge[] = [];
    for (const e of earned) {
      const badge = GUEST_CARDS_CREATED_BADGES.find((b) => b.id === e.badgeId);
      if (badge) {
        userBadges.push({
          id: `ub_${e.badgeId}`,
          userId: 'guest',
          badgeId: e.badgeId,
          earnedAt: e.earnedAt,
          badge: { ...badge, createdAt: e.earnedAt },
        });
      }
    }
    return userBadges.sort((a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime());
  } catch (error) {
    logger.error('[BadgeService] Error in getGuestEarnedBadges:', error);
    return [];
  }
}

/**
 * Get all badges a user has earned
 */
export async function getUserBadges(userId: string): Promise<UserBadge[]> {
  try {
    const { data, error } = await supabase
      .from('user_badges')
      .select(
        `
        id,
        user_id,
        badge_id,
        earned_at,
        badges (
          id,
          name,
          description,
          image_path,
          badge_type,
          threshold,
          created_at
        )
      `
      )
      .eq('user_id', userId)
      .order('earned_at', { ascending: false });

    if (error) {
      logger.error('[BadgeService] Failed to get user badges:', error);
      return [];
    }

    return (data ?? []).map((row: Record<string, unknown>) => {
      const badgeData = row.badges;
      return {
        id: row.id as string,
        userId: row.user_id as string,
        badgeId: row.badge_id as string,
        earnedAt: row.earned_at as string,
        badge: badgeData
          ? transformBadge(
              (Array.isArray(badgeData) ? badgeData[0] : badgeData) as Record<string, unknown>
            )
          : undefined,
      };
    });
  } catch (error) {
    logger.error('[BadgeService] Error in getUserBadges:', error);
    return [];
  }
}

/**
 * Reset badge progress for the current user (or guest) (for testing).
 * Signed-in: deletes badge_progress and user_badges in Supabase.
 * Guest: clears guest_badge_progress and guest_earned_badges from AsyncStorage.
 */
export async function resetBadgeProgress(): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) {
    return resetGuestBadgeProgress();
  }

  try {
    const { error: badgesError } = await supabase
      .from('user_badges')
      .delete()
      .eq('user_id', userId);

    if (badgesError) {
      logger.error('[BadgeService] Failed to delete user badges:', badgesError);
      return false;
    }

    const { error: progressError } = await supabase
      .from('badge_progress')
      .delete()
      .eq('user_id', userId);

    if (progressError) {
      logger.error('[BadgeService] Failed to delete badge progress:', progressError);
      return false;
    }

    logger.log('[BadgeService] Badge progress reset successfully');
    return true;
  } catch (error) {
    logger.error('[BadgeService] Error resetting badge progress:', error);
    return false;
  }
}

/**
 * Reset guest badge progress (AsyncStorage). Used when no user is signed in.
 */
export async function resetGuestBadgeProgress(): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(GUEST_BADGE_PROGRESS_KEY);
    await AsyncStorage.removeItem(GUEST_EARNED_BADGES_KEY);
    logger.log('[BadgeService] Guest badge progress reset successfully');
    return true;
  } catch (error) {
    logger.error('[BadgeService] Error resetting guest badge progress:', error);
    return false;
  }
}

/**
 * Check if user has earned a specific badge
 */
export async function hasBadge(userId: string, badgeId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_badges')
      .select('id')
      .eq('user_id', userId)
      .eq('badge_id', badgeId)
      .maybeSingle();

    if (error) {
      logger.error('[BadgeService] Failed to check badge:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    logger.error('[BadgeService] Error in hasBadge:', error);
    return false;
  }
}
