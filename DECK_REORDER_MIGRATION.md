# Deck Reordering Migration Guide

## Problem
Users were experiencing a "failed to update collection order" error when trying to reorder decks. This was caused by a missing `order_index` column in the `decks` table.

## Root Cause
The database schema in `supabase-schema.sql` was missing the `order_index` column that the application code was trying to use for deck reordering functionality.

## Solution

### For New Installations
The `supabase-schema.sql` file has been updated to include the `order_index` column. New users will have the correct schema from the start.

### For Existing Installations
If you have an existing database without the `order_index` column, you need to run a migration.

#### Option 1: Automated Migration (Recommended)
```bash
cd scripts
node migrateDeckOrderIndex.js
```

#### Option 2: Manual SQL Migration
Run the following SQL commands in your Supabase SQL editor:

```sql
-- Step 1: Add order_index column to decks table
ALTER TABLE decks ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Step 2: Create index for better performance
CREATE INDEX IF NOT EXISTS decks_order_index_idx ON decks(order_index);

-- Step 3: Set initial order values for existing decks (ordered by creation time)
UPDATE decks 
SET order_index = subquery.row_num - 1
FROM (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) as row_num
  FROM decks
) subquery
WHERE decks.id = subquery.id
AND (decks.order_index IS NULL OR decks.order_index = 0);
```

## What Was Fixed

1. **Database Schema**: Added `order_index INTEGER DEFAULT 0` column to the decks table
2. **Migration Script**: Created `scripts/migrateDeckOrderIndex.js` for automated migration
3. **Error Handling**: Improved error messages to provide specific guidance when the column is missing
4. **Code Consistency**: Consolidated the two different reordering approaches to use the same method (only updating `order_index`, not `name`)

## Files Modified

- `supabase-schema.sql` - Added order_index column and index
- `scripts/migrateDeckOrderIndex.js` - New migration script
- `app/components/flashcards/DeckReorderModal.tsx` - Better error handling
- `app/components/flashcards/DeckSelector.tsx` - Better error handling and consistent upsert approach

## Testing
After running the migration, test deck reordering functionality:
1. Open the flashcards screen
2. Try reordering decks using drag and drop
3. Verify that the order persists after closing and reopening the app

The "failed to update collection order" error should no longer occur.
