# Supabase Edge Functions

## Account Deletion Function

### Setup

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link to your project**:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

### Deployment

Deploy the delete-account function:

```bash
supabase functions deploy delete-account
```

### Environment Variables

The function requires the following environment variables (automatically available in Supabase Edge Functions):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (with admin privileges)

The service role key should be automatically available, but you can verify/set it using:

```bash
supabase secrets list
```

If needed, set it manually:
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### Testing

You can test the function locally:

```bash
supabase functions serve delete-account
```

Then call it with:
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/delete-account' \
  --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"userId":"user_id_here"}'
```

### Function Details

**Endpoint**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/delete-account`

**Method**: POST

**Authentication**: Requires user JWT token in Authorization header

**What it does**:
1. Verifies the user's JWT token
2. Fetches all flashcard images for the user
3. Deletes images from Supabase Storage
4. Deletes the user account (which cascades to delete all database records)

**Response**:
- Success: `{ "success": true, "message": "Account and all associated data have been permanently deleted" }`
- Error: `{ "error": "Error message", "details": "Detailed error info" }`

### Security

- The function verifies the user's JWT token before proceeding
- Uses service_role key only on the server side (never exposed to client)
- Implements CORS headers for web access
- All database deletions use CASCADE constraints for data integrity

### Monitoring

Check function logs in the Supabase Dashboard:
1. Go to your project in Supabase
2. Navigate to Edge Functions
3. Click on "delete-account"
4. View logs and invocations

