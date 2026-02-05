-- Run this in Supabase SQL Editor BEFORE running seed_milestone_badges.sql (or add_milestone_badges.sql)
-- if you previously ran a milestone badges migration and reverted / want a clean re-seed.
--
-- This removes only the milestone badges (fc3–fc250), not the First Flashcard (fc1) badge.
-- After this, run seed_milestone_badges.sql to insert the 6 milestone badges again.

DELETE FROM user_badges
WHERE badge_id IN (
  SELECT id FROM badges
  WHERE badge_type = 'cards_created' AND threshold IN (3, 10, 25, 50, 100, 250)
);

DELETE FROM badges
WHERE badge_type = 'cards_created' AND threshold IN (3, 10, 25, 50, 100, 250);
