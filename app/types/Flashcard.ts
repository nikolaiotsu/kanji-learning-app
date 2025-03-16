export interface Flashcard {
  id: string;
  originalText: string;
  furiganaText: string;
  translatedText: string;
  createdAt: number;
  deckId: string; // ID of the deck this flashcard belongs to
} 