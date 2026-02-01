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
 * Increment badge progress and check for newly unlocked badges.
 * Returns the badge if a new badge was unlocked, null otherwise.
 */
export async function incrementBadgeProgress(badgeType: string): Promise<Badge | null> {
  const userId = await getUserId();
  if (!userId) {
    logger.log('[BadgeService] No user ID, skipping badge progress');
    return null;
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
 * Reset badge progress for the current user (for testing).
 * Deletes badge_progress and user_badges so the user can re-earn badges.
 */
export async function resetBadgeProgress(): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) {
    logger.log('[BadgeService] No user ID, cannot reset badge progress');
    return false;
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
