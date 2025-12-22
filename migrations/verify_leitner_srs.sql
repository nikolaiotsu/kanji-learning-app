-- Verification query to check Leitner SRS fields on flashcards
-- Run this in Supabase SQL Editor to verify the migration worked

-- Check that all flashcards have box and next_review_date set
SELECT 
  id,
  original_text,
  box,
  next_review_date,
  created_at
FROM flashcards
ORDER BY created_at DESC
LIMIT 10;

-- Count flashcards by box number
SELECT 
  box,
  COUNT(*) as count
FROM flashcards
GROUP BY box
ORDER BY box;

-- Check for any flashcards missing SRS fields (should return 0 rows)
SELECT 
  id,
  original_text,
  box,
  next_review_date
FROM flashcards
WHERE box IS NULL OR next_review_date IS NULL;

