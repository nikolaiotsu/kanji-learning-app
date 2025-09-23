-- Create users table (handled by Supabase Auth)
-- Supabase Auth automatically creates and manages the 'auth.users' table

-- Create decks table
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0
);

-- Create flashcards table
CREATE TABLE flashcards (
  id UUID PRIMARY KEY,
  original_text TEXT NOT NULL,
  furigana_text TEXT,
  translated_text TEXT,
  target_language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deck_id UUID REFERENCES decks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Migration for existing flashcards (run this if you have existing data)
-- ALTER TABLE flashcards ADD COLUMN target_language TEXT NOT NULL DEFAULT 'en';

-- Migration for existing decks (run this if you have existing data without order_index)
-- ALTER TABLE decks ADD COLUMN order_index INTEGER DEFAULT 0;
-- UPDATE decks SET order_index = (row_number() OVER (PARTITION BY user_id ORDER BY created_at ASC)) - 1 WHERE order_index IS NULL;

-- Add indexes for faster querying
CREATE INDEX flashcards_deck_id_idx ON flashcards(deck_id);
CREATE INDEX decks_user_id_idx ON decks(user_id);
CREATE INDEX decks_order_index_idx ON decks(order_index);

-- Row-level security policies (RLS)
-- This ensures that users can only access their own data

-- Enable RLS on both tables
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

-- Create policies for decks table
CREATE POLICY "Users can view their own decks" 
  ON decks FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own decks" 
  ON decks FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decks" 
  ON decks FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own decks" 
  ON decks FOR DELETE 
  USING (auth.uid() = user_id);

-- Create policies for flashcards table
CREATE POLICY "Users can view their own flashcards" 
  ON flashcards FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own flashcards" 
  ON flashcards FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own flashcards" 
  ON flashcards FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own flashcards" 
  ON flashcards FOR DELETE 
  USING (auth.uid() = user_id);

-- Create a function to automatically set user_id on insert
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers to automatically set user_id
CREATE TRIGGER set_decks_user_id
BEFORE INSERT ON decks
FOR EACH ROW
EXECUTE FUNCTION public.set_user_id();

CREATE TRIGGER set_flashcards_user_id
BEFORE INSERT ON flashcards
FOR EACH ROW
EXECUTE FUNCTION public.set_user_id();

-- ========================================
-- API Usage Logging Tables (Security & Monitoring)
-- ========================================

-- Create api_usage_logs table for monitoring and abuse detection
CREATE TABLE api_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL, -- 'claude_api', 'vision_api', 'flashcard_create', 'ocr_scan'
  endpoint TEXT, -- API endpoint called (for external APIs)
  request_size INTEGER, -- Size of request in characters/bytes
  response_size INTEGER, -- Size of response
  processing_time_ms INTEGER, -- How long the request took
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT, -- Error message if failed
  metadata JSONB, -- Additional data (language, model used, etc.)
  ip_address INET, -- User's IP (if available)
  user_agent TEXT, -- User agent string
  app_version TEXT, -- App version that made the request
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create user_daily_usage table for rate limiting and monitoring
CREATE TABLE user_daily_usage (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  claude_api_calls INTEGER DEFAULT 0,
  vision_api_calls INTEGER DEFAULT 0,
  flashcards_created INTEGER DEFAULT 0,
  ocr_scans_performed INTEGER DEFAULT 0,
  total_claude_tokens INTEGER DEFAULT 0, -- Track token usage for cost monitoring
  total_vision_requests INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, usage_date)
);

-- Add indexes for performance
CREATE INDEX api_usage_logs_user_id_idx ON api_usage_logs(user_id);
CREATE INDEX api_usage_logs_operation_type_idx ON api_usage_logs(operation_type);
CREATE INDEX api_usage_logs_created_at_idx ON api_usage_logs(created_at);
CREATE INDEX api_usage_logs_success_idx ON api_usage_logs(success);
CREATE INDEX user_daily_usage_date_idx ON user_daily_usage(usage_date);

-- Enable RLS on logging tables
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for api_usage_logs
CREATE POLICY "Users can view their own API usage logs" 
  ON api_usage_logs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API usage logs" 
  ON api_usage_logs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- RLS policies for user_daily_usage
CREATE POLICY "Users can view their own daily usage" 
  ON user_daily_usage FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert/update their own daily usage" 
  ON user_daily_usage FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create triggers to automatically set user_id
CREATE TRIGGER set_api_usage_logs_user_id
BEFORE INSERT ON api_usage_logs
FOR EACH ROW
EXECUTE FUNCTION public.set_user_id();

-- Function to update daily usage counters
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
    total_vision_requests
  ) VALUES (
    auth.uid(),
    CURRENT_DATE,
    CASE WHEN p_operation_type = 'claude_api' THEN 1 ELSE 0 END,
    CASE WHEN p_operation_type = 'vision_api' THEN 1 ELSE 0 END,
    CASE WHEN p_operation_type = 'flashcard_create' THEN 1 ELSE 0 END,
    CASE WHEN p_operation_type = 'ocr_scan' THEN 1 ELSE 0 END,
    CASE WHEN p_operation_type = 'claude_api' THEN p_tokens ELSE 0 END,
    CASE WHEN p_operation_type = 'vision_api' THEN 1 ELSE 0 END
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
    last_updated = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 