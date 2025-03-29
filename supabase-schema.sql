-- Create users table (handled by Supabase Auth)
-- Supabase Auth automatically creates and manages the 'auth.users' table

-- Create decks table
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create flashcards table
CREATE TABLE flashcards (
  id UUID PRIMARY KEY,
  original_text TEXT NOT NULL,
  furigana_text TEXT,
  translated_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deck_id UUID REFERENCES decks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add indexes for faster querying
CREATE INDEX flashcards_deck_id_idx ON flashcards(deck_id);
CREATE INDEX decks_user_id_idx ON decks(user_id);

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