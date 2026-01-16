-- Migration: Add translate_api_calls and wordscope_api_calls columns
-- Date: 2025-01-XX
-- Description: Adds separate tracking for translate API calls and wordscope API calls for rate limiting

-- Add the new columns to user_daily_usage table
ALTER TABLE user_daily_usage 
ADD COLUMN IF NOT EXISTS translate_api_calls INTEGER DEFAULT 0;

ALTER TABLE user_daily_usage 
ADD COLUMN IF NOT EXISTS wordscope_api_calls INTEGER DEFAULT 0;

-- Update the update_daily_usage function to handle translate_api and wordscope_api
CREATE OR REPLACE FUNCTION update_daily_usage(
  p_operation_type TEXT,
  p_tokens INTEGER DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  INSERT INTO user_daily_usage (
    user_id, 
    usage_date,
    claude_api_calls,
    vision_api_calls,
    flashcards_created,
    ocr_scans_performed,
    total_claude_tokens,
    total_vision_requests,
    translate_api_calls,
    wordscope_api_calls
  ) VALUES (
    auth.uid(),
    CURRENT_DATE,
    CASE WHEN p_operation_type = 'claude_api' THEN 1 ELSE 0 END,
    CASE WHEN p_operation_type = 'vision_api' THEN 1 ELSE 0 END,
    CASE WHEN p_operation_type = 'flashcard_create' THEN 1 ELSE 0 END,
    CASE WHEN p_operation_type = 'ocr_scan' THEN 1 ELSE 0 END,
    CASE WHEN p_operation_type = 'claude_api' THEN p_tokens ELSE 0 END,
    CASE WHEN p_operation_type = 'vision_api' THEN 1 ELSE 0 END,
    CASE WHEN p_operation_type = 'translate_api' THEN 1 ELSE 0 END,
    CASE WHEN p_operation_type = 'wordscope_api' THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, usage_date) 
  DO UPDATE SET
    claude_api_calls = user_daily_usage.claude_api_calls + 
      CASE WHEN p_operation_type = 'claude_api' THEN 1 ELSE 0 END,
    vision_api_calls = user_daily_usage.vision_api_calls + 
      CASE WHEN p_operation_type = 'vision_api' THEN 1 ELSE 0 END,
    flashcards_created = user_daily_usage.flashcards_created + 
      CASE WHEN p_operation_type = 'flashcard_create' THEN 1 ELSE 0 END,
    ocr_scans_performed = user_daily_usage.ocr_scans_performed + 
      CASE WHEN p_operation_type = 'ocr_scan' THEN 1 ELSE 0 END,
    total_claude_tokens = user_daily_usage.total_claude_tokens + 
      CASE WHEN p_operation_type = 'claude_api' THEN p_tokens ELSE 0 END,
    total_vision_requests = user_daily_usage.total_vision_requests + 
      CASE WHEN p_operation_type = 'vision_api' THEN 1 ELSE 0 END,
    translate_api_calls = user_daily_usage.translate_api_calls + 
      CASE WHEN p_operation_type = 'translate_api' THEN 1 ELSE 0 END,
    wordscope_api_calls = user_daily_usage.wordscope_api_calls + 
      CASE WHEN p_operation_type = 'wordscope_api' THEN 1 ELSE 0 END,
    last_updated = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments to document the columns
COMMENT ON COLUMN user_daily_usage.translate_api_calls IS 'Number of translate API calls made today';
COMMENT ON COLUMN user_daily_usage.wordscope_api_calls IS 'Number of wordscope API calls made today';
