/**
 * Cleans Japanese text by removing unwanted characters and formatting
 */
export function cleanJapaneseText(text: string): string {
  // Remove newlines and replace with spaces
  let cleanedText = text.replace(/\n/g, ' ');
  
  // Remove extra spaces
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
  
  // Remove all spaces between Japanese characters
  // This regex targets hiragana, katakana, and kanji specifically
  const japaneseCharRegex = /([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff])\s+([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff])/g;
  
  // Continue replacing until no more changes
  let previousText;
  do {
    previousText = cleanedText;
    cleanedText = cleanedText.replace(japaneseCharRegex, '$1$2');
  } while (previousText !== cleanedText);
  
  return cleanedText;
}

/**
 * Checks if text contains Japanese characters
 */
export function containsJapanese(text: string): boolean {
  // Regex for hiragana, katakana, and kanji
  const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
  return japaneseRegex.test(text);
}

// Add this default export to satisfy Expo Router
const TextFormatting = { cleanJapaneseText, containsJapanese };
export default TextFormatting; 