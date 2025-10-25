-- ========================================
-- STORAGE RLS POLICIES FOR PRIVATE BUCKET
-- ========================================
-- FIXED VERSION: Works without superuser privileges
-- Run this SQL in your Supabase SQL Editor
-- ========================================

-- Note: RLS on storage.objects is already enabled by Supabase
-- We just need to add our custom policies

-- ========================================
-- POLICY 1: Users can view their images
-- ========================================
-- This policy allows users to view images that belong to their flashcards

CREATE POLICY "Users can view their flashcard images"
ON storage.objects FOR SELECT
TO authenticated
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

CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'flashcards'
);

-- ========================================
-- POLICY 3: Users can update their images
-- ========================================

CREATE POLICY "Users can update their images"
ON storage.objects FOR UPDATE
TO authenticated
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

CREATE POLICY "Users can delete their images"
ON storage.objects FOR DELETE
TO authenticated
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

-- View all policies on storage.objects
SELECT 
  policyname,
  cmd as operation,
  roles
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage'
ORDER BY policyname;

