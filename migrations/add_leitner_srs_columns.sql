-- Migration: Add Leitner SRS columns to flashcards table
-- Date: 2025-01-XX
-- Description: Adds box (1-5) and next_review_date fields for Leitner spaced repetition system

-- Add the box column with constraint (1-5) and default value 1
ALTER TABLE flashcards 
ADD COLUMN box INTEGER DEFAULT 1 CHECK (box >= 1 AND box <= 5);

-- Add the next_review_date column with default value of today
ALTER TABLE flashcards 
ADD COLUMN next_review_date DATE DEFAULT CURRENT_DATE;

-- Migrate existing flashcards to have box = 1 and next_review_date = today
UPDATE flashcards 
SET box = 1, next_review_date = CURRENT_DATE 
WHERE box IS NULL OR next_review_date IS NULL;

-- Optional: Add comments to document the columns
COMMENT ON COLUMN flashcards.box IS 'Leitner box number (1-5) for spaced repetition scheduling';
COMMENT ON COLUMN flashcards.next_review_date IS 'Next scheduled review date based on Leitner box intervals';

