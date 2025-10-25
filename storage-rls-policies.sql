-- ========================================
-- STORAGE RLS POLICIES FOR PRIVATE BUCKET
-- ========================================
-- Run this SQL in your Supabase SQL Editor
-- After making the 'flashcards' bucket private
-- ========================================

-- Enable Row Level Security on storage.objects table
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ========================================
-- POLICY 1: Users can view their images
-- ========================================
-- This policy allows users to view images that belong to their flashcards
-- It checks the flashcards table to verify ownership

CREATE POLICY "Users can view their flashcard images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'flashcards' 
  AND (
    -- Allow if user owns a flashcard with this image
    EXISTS (
      SELECT 1 FROM public.flashcards 
      WHERE flashcards.user_id = auth.uid() 
      AND flashcards.image_url LIKE '%' || storage.objects.name || '%'
    )
  )
);

-- ========================================
-- POLICY 2: Authenticated users can upload
-- ========================================
-- This policy allows any authenticated user to upload images
-- The flashcard will be created separately and link to this image

CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'flashcards'
  AND auth.role() = 'authenticated'
);

-- ========================================
-- POLICY 3: Users can update their images
-- ========================================
-- This policy allows users to update images they own

CREATE POLICY "Users can update their images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'flashcards'
  AND EXISTS (
    SELECT 1 FROM public.flashcards 
    WHERE flashcards.user_id = auth.uid() 
    AND flashcards.image_url LIKE '%' || storage.objects.name || '%'
  )
);

-- ========================================
-- POLICY 4: Users can delete their images
-- ========================================
-- This policy allows users to delete images they own

CREATE POLICY "Users can delete their images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'flashcards'
  AND EXISTS (
    SELECT 1 FROM public.flashcards 
    WHERE flashcards.user_id = auth.uid() 
    AND flashcards.image_url LIKE '%' || storage.objects.name || '%'
  )
);

-- ========================================
-- VERIFICATION QUERIES
-- ========================================
-- Run these after creating the policies to verify they're active

-- Check that RLS is enabled
SELECT 
  tablename,
  rowsecurity 
FROM pg_tables 
WHERE schemaname = 'storage' AND tablename = 'objects';
-- Expected: rowsecurity = true

-- View all policies on storage.objects
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage';
-- Expected: 4 policies listed

-- Count images per bucket
SELECT 
  bucket_id,
  COUNT(*) as image_count
FROM storage.objects
GROUP BY bucket_id;

-- ========================================
-- CLEANUP (If needed)
-- ========================================
-- If you need to remove these policies and start over:

/*
DROP POLICY IF EXISTS "Users can view their flashcard images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their images" ON storage.objects;
*/

-- ========================================
-- NOTES
-- ========================================
-- 1. These policies work with your CURRENT structure: flashcard-images/{filename}
-- 2. They check ownership via the flashcards table (not folder structure)
-- 3. Upload policy is permissive (any authenticated user can upload)
-- 4. View/Update/Delete policies check flashcard ownership
-- 5. RLS is enforced at the database level (can't be bypassed)

