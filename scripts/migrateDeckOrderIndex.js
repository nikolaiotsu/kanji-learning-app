// Script to add order_index column to existing decks table
// Run this if you have existing data and need to add the order_index column

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  console.log('Make sure to set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addOrderIndexColumn() {
  try {
    console.log('Starting deck order_index migration...');
    
    // First, check if the column already exists
    const { data: columns, error: columnError } = await supabase
      .rpc('get_table_columns', { table_name: 'decks' });
      
    if (columnError) {
      console.log('Could not check existing columns, proceeding with migration...');
    } else if (columns && columns.some(col => col.column_name === 'order_index')) {
      console.log('order_index column already exists, skipping migration.');
      return;
    }
    
    console.log('Adding order_index column to decks table...');
    
    // Add the order_index column with default value 0
    const { error: alterError } = await supabase.rpc('add_order_index_column');
    
    if (alterError) {
      if (alterError.message.includes('already exists')) {
        console.log('Column already exists, proceeding to update values...');
      } else {
        console.error('Error adding order_index column:', alterError);
        return;
      }
    } else {
      console.log('Successfully added order_index column');
    }
    
    // Update existing decks to have sequential order_index values per user
    console.log('Setting initial order_index values for existing decks...');
    const { error: updateError } = await supabase.rpc('set_initial_deck_order');
    
    if (updateError) {
      console.error('Error setting initial order values:', updateError);
      return;
    }
    
    console.log('Successfully set initial order values');
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration error:', error);
  }
}

async function createRPCFunctions() {
  console.log('Creating RPC functions for migration...');
  
  // Function to add order_index column
  const { error: error1 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE OR REPLACE FUNCTION add_order_index_column()
      RETURNS void AS $$
      BEGIN
        -- Add order_index column if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'decks' 
          AND column_name = 'order_index'
        ) THEN
          ALTER TABLE decks ADD COLUMN order_index INTEGER DEFAULT 0;
          CREATE INDEX IF NOT EXISTS decks_order_index_idx ON decks(order_index);
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `
  });
  
  if (error1) {
    console.error('Error creating add_order_index_column function:', error1);
    return false;
  }
  
  // Function to set initial order values
  const { error: error2 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE OR REPLACE FUNCTION set_initial_deck_order()
      RETURNS void AS $$
      BEGIN
        -- Update order_index for all existing decks
        UPDATE decks 
        SET order_index = subquery.row_num - 1
        FROM (
          SELECT id, 
                 ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) as row_num
          FROM decks
        ) subquery
        WHERE decks.id = subquery.id
        AND (decks.order_index IS NULL OR decks.order_index = 0);
      END;
      $$ LANGUAGE plpgsql;
    `
  });
  
  if (error2) {
    console.error('Error creating set_initial_deck_order function:', error2);
    return false;
  }
  
  // Function to check table columns (helper function)
  const { error: error3 } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE OR REPLACE FUNCTION get_table_columns(table_name text)
      RETURNS TABLE(column_name text) AS $$
      BEGIN
        RETURN QUERY
        SELECT c.column_name::text
        FROM information_schema.columns c
        WHERE c.table_name = get_table_columns.table_name;
      END;
      $$ LANGUAGE plpgsql;
    `
  });
  
  if (error3) {
    console.error('Error creating get_table_columns function:', error3);
    return false;
  }
  
  return true;
}

// Alternative simple migration for direct SQL execution
async function showMigrationSQL() {
  console.log('=== DECK ORDER INDEX MIGRATION SQL ===');
  console.log('Execute these SQL commands in your Supabase SQL editor:');
  console.log('');
  console.log('-- Step 1: Add order_index column to decks table');
  console.log('ALTER TABLE decks ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;');
  console.log('');
  console.log('-- Step 2: Create index for better performance');
  console.log('CREATE INDEX IF NOT EXISTS decks_order_index_idx ON decks(order_index);');
  console.log('');
  console.log('-- Step 3: Set initial order values for existing decks (ordered by creation time)');
  console.log(`UPDATE decks 
SET order_index = subquery.row_num - 1
FROM (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) as row_num
  FROM decks
) subquery
WHERE decks.id = subquery.id
AND (decks.order_index IS NULL OR decks.order_index = 0);`);
  console.log('');
  console.log('=== END MIGRATION SQL ===');
  console.log('');
  console.log('After running the above SQL, your deck reordering should work properly.');
}

// Run migration
async function runMigration() {
  console.log('Starting deck order_index migration...');
  
  // First create the RPC functions
  const rpcCreated = await createRPCFunctions();
  if (!rpcCreated) {
    console.error('Failed to create RPC functions');
    console.log('');
    console.log('Showing manual SQL migration instead:');
    showMigrationSQL();
    return;
  }
  
  // Then run the migration
  await addOrderIndexColumn();
}

// Check command line arguments
if (process.argv.includes('--sql-only')) {
  showMigrationSQL();
} else if (process.argv.includes('--help')) {
  console.log('Deck Order Index Migration Script');
  console.log('');
  console.log('Usage:');
  console.log('  node migrateDeckOrderIndex.js        # Run automated migration');
  console.log('  node migrateDeckOrderIndex.js --sql-only  # Show SQL commands only');
  console.log('  node migrateDeckOrderIndex.js --help      # Show this help');
  console.log('');
  console.log('This script adds the missing order_index column to the decks table');
  console.log('and sets initial ordering values for existing decks.');
} else {
  runMigration();
}

module.exports = { addOrderIndexColumn, showMigrationSQL };
