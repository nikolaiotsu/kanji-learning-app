export interface Flashcard {
  id: string;
  originalText: string;
  furiganaText: string;
  translatedText: string;
  createdAt: number;
  deckId: string; // ID of the deck this flashcard belongs to
  imageUrl?: string; // URL to the image in Supabase storage (optional)
}

// Add default export to satisfy Expo Router's requirement
export default Flashcard; 