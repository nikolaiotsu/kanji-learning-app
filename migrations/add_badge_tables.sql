-- Migration: Add badge reward system tables
-- Description: Creates badges, user_badges, and badge_progress tables for the badge reward system

-- ========================================
-- Table 1: badges - Badge definitions (seeded once)
-- ========================================
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  image_path TEXT NOT NULL,
  badge_type TEXT NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Table 2: user_badges - Tracks which badges each user has earned
-- ========================================
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  badge_id UUID REFERENCES badges(id) ON DELETE CASCADE NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, badge_id)
);

-- ========================================
-- Table 3: badge_progress - Tracks progress toward badges
-- ========================================
CREATE TABLE badge_progress (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  badge_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, badge_type)
);

-- Add indexes for performance
CREATE INDEX user_badges_user_id_idx ON user_badges(user_id);
CREATE INDEX user_badges_badge_id_idx ON user_badges(badge_id);
CREATE INDEX badge_progress_user_id_idx ON badge_progress(user_id);

-- Enable RLS on all tables
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE badge_progress ENABLE ROW LEVEL SECURITY;

-- RLS policies for badges (read-only, badges are system-defined)
CREATE POLICY "Anyone can view badges" 
  ON badges FOR SELECT 
  USING (true);

-- RLS policies for user_badges (users can only access their own)
CREATE POLICY "Users can view their own badges" 
  ON user_badges FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own badges" 
  ON user_badges FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own badges"
  ON user_badges FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for badge_progress (users can only access their own)
CREATE POLICY "Users can view their own progress" 
  ON badge_progress FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress" 
  ON badge_progress FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress" 
  ON badge_progress FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own progress"
  ON badge_progress FOR DELETE
  USING (auth.uid() = user_id);

-- Seed the first badge: "First Flashcard"
INSERT INTO badges (id, name, description, image_path, badge_type, threshold)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
  'First Flashcard',
  'Created your first flashcard!',
  'fc1.png',
  'cards_created',
  1
) ON CONFLICT (id) DO NOTHING;

-- Function for atomic increment of badge progress
CREATE OR REPLACE FUNCTION increment_badge_progress(
  p_user_id UUID,
  p_badge_type TEXT
)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  -- Security: Only allow users to increment their own progress
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot update badge progress for another user';
  END IF;
  
  INSERT INTO badge_progress (user_id, badge_type, count, updated_at)
  VALUES (p_user_id, p_badge_type, 1, CURRENT_TIMESTAMP)
  ON CONFLICT (user_id, badge_type)
  DO UPDATE SET
    count = badge_progress.count + 1,
    updated_at = CURRENT_TIMESTAMP
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_badge_progress(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_badge_progress(UUID, TEXT) TO service_role;
