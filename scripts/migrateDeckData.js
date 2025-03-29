// Script to migrate data from AsyncStorage to Supabase
// This is a placeholder for a potential migration script if needed
// This would typically be run with Node.js

const migrateDataToSupabase = async () => {
  console.log('This script would migrate data from AsyncStorage to Supabase if needed.');
  console.log('To properly migrate data:');
  console.log('1. Use the app\'s Settings screen to check for local data');
  console.log('2. If local data exists:');
  console.log('   a. Sign in to your account if not already signed in');
  console.log('   b. After signing in, back up any important flashcards from the app');
  console.log('   c. Use the "Clear Local Storage" button in Settings');
  console.log('3. Your app will now use only Supabase storage for all operations');
  console.log('');
  console.log('Note: This migration process does NOT transfer your old local data to Supabase.');
  console.log('It simply clears local storage so the app consistently uses Supabase for storage.');
};

// If running as a script
if (require.main === module) {
  migrateDataToSupabase();
}

module.exports = migrateDataToSupabase; 