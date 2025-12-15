# Scope and Translate Feature - Technical Notes

## How It Works

The "Scope and Translate" feature now uses a **simpler, two-step approach**:

### Step 1: Translation (Reuses Existing Working Code)
- Calls the proven `processWithClaude()` function
- Gets translation and romanization using all the existing complex logic
- This ensures compatibility with all languages and edge cases

### Step 2: Scope Analysis (New Simple API Call)
- Makes a second, lightweight API call to Claude
- Asks for either etymology (words/idioms) or grammar analysis (sentences)
- Max 200 words, in the target learning language
- If this fails, you still get the translation (graceful degradation)

## Why This Approach?

The original `processWithClaude` function has **4,700+ lines** of carefully tuned prompts for:
- 14 different languages
- Special romanization rules (Japanese furigana, Chinese pinyin, Korean romanization)
- Edge cases and error handling
- Retry logic and fallbacks

Rather than duplicate or modify all that complexity, we:
1. ✅ Reuse the working translation code
2. ✅ Add a simple second call for scope analysis
3. ✅ Keep both features independent (scope failure doesn't break translation)

## Database Migration Required

**IMPORTANT**: Before testing, run this SQL in your Supabase dashboard:

```sql
ALTER TABLE flashcards 
ADD COLUMN scope_analysis TEXT;
```

## Testing

1. Run the migration above
2. Create a flashcard with "Scope & Translate" button
3. Try both:
   - **Word**: "love" or "猫" (should show etymology)
   - **Sentence**: "I love cats" or "私は猫が好きです" (should show grammar)
4. Check saved flashcards - flip to back to see scope analysis

## Troubleshooting

If you see 404 errors:
- Check your Claude API key is set: `EXPO_PUBLIC_CLAUDE_API_KEY`
- Verify it's in your environment/app.config.js
- The key should start with `sk-ant-`

If scope analysis is missing but translation works:
- This is expected behavior (graceful degradation)
- The second API call failed but translation succeeded
- Check logs for the specific error
