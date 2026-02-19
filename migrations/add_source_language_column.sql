-- Add source_language column to flashcards for TTS accent selection
-- Run via Supabase SQL editor or: supabase db push (if using Supabase CLI)
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS source_language TEXT;
