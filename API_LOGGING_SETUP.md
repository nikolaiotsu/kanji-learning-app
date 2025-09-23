# API Usage Logging Setup Guide

This guide will help you set up comprehensive API usage logging for monitoring and abuse detection in your Kanji Learning App.

## 🎯 What This Adds

- **Real-time API usage tracking** for Claude API, Google Vision API, flashcard creation, and OCR scans
- **Database-level rate limiting** and usage monitoring
- **Abuse detection** through detailed logging
- **Cost monitoring** with token/request tracking
- **Production-ready logging** that won't break your app

## 📋 Setup Steps

### Step 1: Update Your Database Schema

1. **Go to your Supabase Dashboard**
2. **Navigate to SQL Editor**
3. **Copy and paste the updated schema from `supabase-schema.sql`**
4. **Run the query**

This will create:
- `api_usage_logs` table for detailed request logging
- `user_daily_usage` table for rate limiting and monitoring
- Proper RLS policies and indexes
- Helper functions for usage tracking

### Step 2: Verify the Setup

After running the schema, you should see these new tables in your Supabase dashboard:
- ✅ `api_usage_logs`
- ✅ `user_daily_usage`

### Step 3: Test the Logging (Optional)

The logging is automatically integrated into your existing API calls. To test:

1. **Create a flashcard** - Check `api_usage_logs` for `flashcard_create` entries
2. **Perform OCR scan** - Check for `ocr_scan` and `vision_api` entries  
3. **Process text with Claude** - Check for `claude_api` entries

## 📊 What Gets Logged

### API Usage Logs (`api_usage_logs`)
- **Operation type**: `claude_api`, `vision_api`, `flashcard_create`, `ocr_scan`
- **Performance metrics**: Request/response size, processing time
- **Success/failure status** and error messages
- **Metadata**: Model used, language, text length, etc.
- **App version** and timestamp

### Daily Usage Tracking (`user_daily_usage`)
- **Per-user daily counters** for each operation type
- **Token usage tracking** for cost monitoring
- **Automatic reset** every 24 hours

## 🔍 Monitoring Your API Usage

### View Recent Activity
```sql
-- See recent API calls
SELECT 
  operation_type,
  success,
  processing_time_ms,
  created_at,
  metadata
FROM api_usage_logs 
ORDER BY created_at DESC 
LIMIT 50;
```

### Check Daily Usage
```sql
-- See today's usage by user
SELECT 
  user_id,
  claude_api_calls,
  vision_api_calls,
  flashcards_created,
  ocr_scans_performed,
  total_claude_tokens
FROM user_daily_usage 
WHERE usage_date = CURRENT_DATE;
```

### Detect Potential Abuse
```sql
-- Find users with high API usage
SELECT 
  user_id,
  COUNT(*) as total_requests,
  COUNT(CASE WHEN NOT success THEN 1 END) as failed_requests
FROM api_usage_logs 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
HAVING COUNT(*) > 100  -- Adjust threshold as needed
ORDER BY total_requests DESC;
```

## ⚙️ Configuration Options

### Disable Logging (if needed)
```typescript
import { apiLogger } from './services/apiUsageLogger';

// Disable logging temporarily
apiLogger.setEnabled(false);

// Re-enable logging
apiLogger.setEnabled(true);
```

### Adjust Rate Limits
Edit the `FREE_LIMITS` in `apiUsageLogger.ts`:
```typescript
const FREE_LIMITS = {
  claude: 100,    // Claude API calls per day
  vision: 500,    // Vision API calls per day  
  flashcards: 3,  // Flashcards per day
  ocr: 500        // OCR scans per day
};
```

## 🚨 Security Benefits

### What This Protects Against:
1. **API Cost Attacks** - Track expensive Claude/Vision API usage
2. **Database Spam** - Monitor flashcard creation patterns
3. **Abuse Detection** - Identify unusual usage patterns
4. **Rate Limit Bypass** - Server-side usage tracking

### What You Can Monitor:
- Users approaching rate limits
- Failed API calls (potential attacks)
- Expensive operations (high token usage)
- Unusual usage patterns (rapid requests)

## 📈 Production Considerations

### Performance Impact
- **Minimal** - Logging is asynchronous and won't slow down your app
- **Fails silently** - Logging errors won't break user experience
- **Optimized queries** - Proper indexes for fast lookups

### Data Retention
Consider adding a cleanup job to remove old logs:
```sql
-- Delete logs older than 30 days
DELETE FROM api_usage_logs 
WHERE created_at < NOW() - INTERVAL '30 days';
```

## ✅ Success Indicators

After setup, you should see:
1. **Console logs** in development showing API operations
2. **Database entries** in `api_usage_logs` table
3. **Daily usage counters** in `user_daily_usage` table
4. **No app crashes** or performance issues

## 🔧 Troubleshooting

### If logging isn't working:
1. **Check database schema** - Ensure tables were created
2. **Check RLS policies** - Users should be able to insert their own logs
3. **Check console logs** - Look for `[APILogger]` messages
4. **Verify imports** - Ensure logging functions are imported correctly

### Common Issues:
- **Permission errors**: Check RLS policies
- **Schema errors**: Re-run the database migration
- **Import errors**: Check file paths in import statements

## 🎉 You're Done!

Your app now has comprehensive API usage logging that will help you:
- **Monitor costs** and usage patterns
- **Detect abuse** early
- **Optimize performance** based on real usage data
- **Make informed decisions** about rate limits

The logging runs automatically in the background and provides valuable insights for both TestFlight and production deployment.
