export interface Deck {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// Add default export to satisfy Expo Router's requirement
export default Deck; 