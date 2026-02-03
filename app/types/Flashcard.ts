export interface Flashcard {
  id: string;
  originalText: string;
  readingsText: string; // Source text with readings (furigana/pinyin/romanization) - universal across languages
  translatedText: string;
  targetLanguage: string; // Language code (e.g., 'en', 'ru', 'fr') this flashcard was created with
  createdAt: number;
  deckId: string; // ID of the deck this flashcard belongs to
  imageUrl?: string; // URL to the image in Supabase storage (optional)
  scopeAnalysis?: string; // Etymology/grammar analysis from Scope and Translate feature
  box?: number; // Leitner box number (1-5) for spaced repetition scheduling (defaults to 1)
  nextReviewDate?: Date; // Next scheduled review date (defaults to today + box interval)
}

// Add default export to satisfy Expo Router's requirement
export default Flashcard; 