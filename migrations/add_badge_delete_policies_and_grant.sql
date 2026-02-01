-- Migration: Fix badge system - Add DELETE policies and GRANT RPC execution
-- Run this if badge reset or increment are not working

-- Allow users to delete their own user_badges (needed for reset/testing)
CREATE POLICY "Users can delete their own badges"
  ON user_badges FOR DELETE
  USING (auth.uid() = user_id);

-- Allow users to delete their own badge_progress (needed for reset/testing)
CREATE POLICY "Users can delete their own progress"
  ON badge_progress FOR DELETE
  USING (auth.uid() = user_id);

-- Grant execute permission on the increment function to authenticated users
GRANT EXECUTE ON FUNCTION increment_badge_progress(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_badge_progress(UUID, TEXT) TO service_role;
