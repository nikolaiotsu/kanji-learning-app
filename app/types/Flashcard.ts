export interface Flashcard {
  id: string;
  originalText: string;
  furiganaText: string;
  translatedText: string;
  targetLanguage: string; // Language code (e.g., 'en', 'ru', 'fr') this flashcard was created with
  createdAt: number;
  deckId: string; // ID of the deck this flashcard belongs to
  imageUrl?: string; // URL to the image in Supabase storage (optional)
  scopeAnalysis?: string; // Etymology/grammar analysis from Scope and Translate feature
}

// Add default export to satisfy Expo Router's requirement
export default Flashcard; 