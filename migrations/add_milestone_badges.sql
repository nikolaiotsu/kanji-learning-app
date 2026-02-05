-- Migration: Add flashcard milestone badges (fc3, fc10, fc25, fc50, fc100, fc250)
-- Description: Inserts badge definitions for milestones at 3, 10, 25, 50, 100, and 250 flashcards created.

INSERT INTO badges (id, name, description, image_path, badge_type, threshold)
VALUES
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid, '3 Flashcards', 'Created 3 flashcards!', 'fc3.png', 'cards_created', 3),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012'::uuid, '10 Flashcards', 'Created 10 flashcards!', 'fc10.png', 'cards_created', 10),
  ('d4e5f6a7-b8c9-0123-def0-234567890123'::uuid, '25 Flashcards', 'Created 25 flashcards!', 'fc25.png', 'cards_created', 25),
  ('e5f6a7b8-c9d0-1234-ef01-345678901234'::uuid, '50 Flashcards', 'Created 50 flashcards!', 'fc50.png', 'cards_created', 50),
  ('f6a7b8c9-d0e1-2345-f012-456789012345'::uuid, '100 Flashcards', 'Created 100 flashcards!', 'fc100.png', 'cards_created', 100),
  ('a7b8c9d0-e1f2-3456-0123-567890123456'::uuid, '250 Flashcards', 'Created 250 flashcards!', 'fc250.png', 'cards_created', 250)
ON CONFLICT (id) DO NOTHING;
