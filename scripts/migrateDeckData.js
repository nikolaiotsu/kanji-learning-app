// Script to migrate data from AsyncStorage to Supabase
// This is a placeholder for a potential migration script if needed
// This would typically be run with Node.js

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateDeckData() {
  try {
    console.log('Starting deck data migration...');
    
    // Get all flashcards
    const { data: flashcards, error } = await supabase
      .from('flashcards')
      .select('*');
    
    if (error) {
      console.error('Error fetching flashcards:', error);
      return;
    }
    
    console.log(`Found ${flashcards.length} flashcards to migrate`);
    
    // Add target_language column if it doesn't exist
    console.log('Adding target_language column to flashcards table...');
    const { error: alterError } = await supabase.rpc('add_target_language_column');
    
    if (alterError && !alterError.message.includes('already exists')) {
      console.error('Error adding target_language column:', alterError);
      return;
    }
    
    // Update flashcards without target_language to default to 'en'
    const { error: updateError } = await supabase
      .from('flashcards')
      .update({ target_language: 'en' })
      .is('target_language', null);
    
    if (updateError) {
      console.error('Error updating flashcards with default target_language:', updateError);
      return;
    }
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration error:', error);
  }
}

async function createRPCFunction() {
  console.log('Creating RPC function for column addition...');
  
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE OR REPLACE FUNCTION add_target_language_column()
      RETURNS void AS $$
      BEGIN
        -- Add target_language column if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'flashcards' 
          AND column_name = 'target_language'
        ) THEN
          ALTER TABLE flashcards ADD COLUMN target_language TEXT NOT NULL DEFAULT 'en';
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `
  });
  
  if (error) {
    console.error('Error creating RPC function:', error);
    return false;
  }
  
  return true;
}

// Run migration
async function runMigration() {
  console.log('Starting flashcard target language migration...');
  
  // First create the RPC function
  const rpcCreated = await createRPCFunction();
  if (!rpcCreated) {
    console.error('Failed to create RPC function');
    return;
  }
  
  // Then run the migration
  await migrateDeckData();
}

// Alternative simple migration for direct SQL execution
async function simpleColumnMigration() {
  console.log('Running simple column migration...');
  console.log('Execute this SQL in your Supabase SQL editor:');
  console.log('');
  console.log('-- Add target_language column to flashcards table');
  console.log('ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS target_language TEXT NOT NULL DEFAULT \'en\';');
  console.log('');
  console.log('-- Update any existing flashcards that might have NULL target_language');
  console.log('UPDATE flashcards SET target_language = \'en\' WHERE target_language IS NULL;');
  console.log('');
  console.log('Migration SQL provided above. Please run it in your Supabase dashboard.');
}

// Check if we should run the complex migration or just show SQL
if (process.argv.includes('--sql-only')) {
  simpleColumnMigration();
} else {
  runMigration();
}

module.exports = { migrateDeckData, simpleColumnMigration }; 