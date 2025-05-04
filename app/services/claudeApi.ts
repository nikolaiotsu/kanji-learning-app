import axios, { AxiosError } from 'axios';
import Constants from 'expo-constants';
import { 
  containsJapanese, 
  containsChineseJapanese, 
  containsChinese, 
  containsKoreanText,
  containsRussianText,
  containsArabicText,
  containsItalianText
} from '../utils/textFormatting';

// Define response structure
interface ClaudeResponse {
  furiganaText: string;
  translatedText: string;
}

// Define Claude API response content structure
interface ClaudeContentItem {
  type: string;
  text?: string;
}

/**
 * Sleep function for delay between retries
 * @param ms Milliseconds to sleep
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Determines the primary language of a text while acknowledging it may contain other languages
 * @param text The text to analyze
 * @returns The detected primary language
 */
function detectPrimaryLanguage(text: string): string {
  // Count characters by language category
  let russianChars = 0;
  let japaneseChars = 0;
  let chineseChars = 0;
  let koreanChars = 0;
  let arabicChars = 0;
  let italianChars = 0;
  
  // Check each character in the text
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Russian (Cyrillic)
    if (/[\u0400-\u04FF]/.test(char)) {
      russianChars++;
    }
    // Japanese specific (hiragana, katakana)
    else if (/[\u3040-\u30ff]/.test(char)) {
      japaneseChars++;
    }
    // CJK characters (could be either Chinese or Japanese kanji)
    else if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(char)) {
      if (!containsJapanese(text)) {
        // If no hiragana/katakana, more likely Chinese
        chineseChars++;
      } else {
        // Otherwise, count as Japanese
        japaneseChars++;
      }
    }
    // Korean
    else if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC]/.test(char)) {
      koreanChars++;
    }
    // Arabic
    else if (/[\u0600-\u06FF\u0750-\u077F]/.test(char)) {
      arabicChars++;
    }
  }
  
  // Check for Italian based on patterns (simpler approach)
  if (containsItalianText(text) && 
      !(russianChars || japaneseChars || chineseChars || koreanChars || arabicChars)) {
    return "Italian";
  }
  
  // Return language with highest character count
  const counts = [
    { lang: "Russian", count: russianChars },
    { lang: "Japanese", count: japaneseChars },
    { lang: "Chinese", count: chineseChars },
    { lang: "Korean", count: koreanChars },
    { lang: "Arabic", count: arabicChars }
  ];
  
  counts.sort((a, b) => b.count - a.count);
  
  // If the highest count is 0, return "unknown"
  if (counts[0].count === 0) return "unknown";
  
  return counts[0].lang;
}

/**
 * Processes text with Claude AI API to add furigana/romanization and provide translation
 * @param text The text to be processed
 * @returns Object containing text with furigana/romanization and English translation
 */
export async function processWithClaude(text: string): Promise<ClaudeResponse> {
  // Maximum number of retry attempts
  const MAX_RETRIES = 3;
  // Initial backoff delay in milliseconds
  const INITIAL_BACKOFF_DELAY = 1000;
  
  let retryCount = 0;
  let lastError: unknown = null;

  // Detect primary language
  const primaryLanguage = detectPrimaryLanguage(text);
  console.log("Primary language detected:", primaryLanguage);

  while (retryCount < MAX_RETRIES) {
    try {
      // Try to get Claude API key from environment variables or from Constants
      const apiKey = process.env.EXPO_PUBLIC_CLAUDE_API_KEY || 
                    (Constants.expoConfig?.extra?.claudeApiKey as string);
      
      console.log("API Key available:", apiKey ? "Yes (length: " + apiKey.length + ")" : "No");
      
      if (!apiKey) {
        throw new Error('Claude API key is not configured. Please add EXPO_PUBLIC_CLAUDE_API_KEY to your environment variables.');
      }

      // Define the user message with our prompt based on language detection
      let userMessage = '';
      
      if (primaryLanguage === "Chinese") {
        // Chinese-specific prompt with pinyin
        userMessage = `
You are a Chinese language expert. I need you to analyze and translate this text: "${text}"

IMPORTANT: You must follow this EXACT format:
- Keep all original text as is (including any English words, numbers, or punctuation)
- For each Chinese character or word, add the pinyin romanization in parentheses immediately after
- Do NOT add romanization to English words or numbers
- The pinyin should include tone marks (e.g., "你好" should become "你好(nǐ hǎo)")

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Chinese text with pinyin after each character/word as described",
  "translatedText": "Accurate English translation reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Korean") {
        // Korean-specific prompt with Revised Romanization
        userMessage = `
You are a Korean language expert. I need you to analyze and translate this text: "${text}"

IMPORTANT: You must follow this EXACT format:
- Keep all original text as is (including any English words, numbers, or punctuation)
- For each Korean word, add the Revised Romanization in parentheses immediately after
- Do NOT add romanization to English words or numbers
- Follow the official Revised Romanization system rules

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Korean text with Revised Romanization after each word in parentheses",
  "translatedText": "Accurate English translation reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Russian") {
        // Russian-specific prompt with Practical Romanization
        userMessage = `
You are a Russian language expert. I need you to analyze and translate this text: "${text}"

IMPORTANT: You must follow this EXACT format:
- Keep all original text as is (including any English words, numbers, or punctuation)
- For each Russian word, add the Practical Romanization in parentheses immediately after
- Do NOT add romanization to English words or numbers
- Follow practical, easy-to-read romanization standards

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Russian text with Practical Romanization after each word in parentheses",
  "translatedText": "Accurate English translation reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Arabic") {
        // Arabic-specific prompt with Arabic Chat Alphabet
        userMessage = `
You are an Arabic language expert. I need you to analyze and translate this text: "${text}"

IMPORTANT: You must follow this EXACT format:
- Keep all original text as is (including any English words, numbers, or punctuation)
- For each Arabic word, add the Arabic Chat Alphabet (Franco-Arabic) transliteration in parentheses immediately after
- Do NOT add transliteration to English words or numbers
- Follow common Arabic Chat Alphabet conventions used in online messaging

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Arabic text with Arabic Chat Alphabet transliteration after each word in parentheses",
  "translatedText": "Accurate English translation reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Italian") {
        // Italian-specific prompt (Western language - no need for romanization)
        userMessage = `
You are an Italian language expert. I need you to translate this Italian text: "${text}"

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate English translation reflecting the full meaning in context"
}
`;
      } else if (primaryLanguage === "Japanese") {
        // Japanese prompt
        userMessage = `
You are a Japanese language expert. I need you to analyze this text and add furigana to words containing kanji: "${text}"

IMPORTANT: You must follow this EXACT format:
- Keep all original text as is (including any English words, numbers, or punctuation)
- For each word containing kanji, add the hiragana reading in parentheses immediately after the COMPLETE word
- The reading should cover the entire word (including any hiragana parts)
- Add readings only for words containing kanji
- Non-kanji words, English words, and numbers should remain unchanged

Examples of correct formatting:
- "東京" should become "東京(とうきょう)"
- "日本語" should become "日本語(にほんご)"
- "勉強する" should become "勉強する(べんきょうする)"
- "iPhone 15" should remain "iPhone 15"

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Japanese text with furigana after each kanji word as shown in examples",
  "translatedText": "Accurate English translation reflecting the full meaning in context"
}
`;
      } else {
        // Default prompt for other languages
        userMessage = `
I need you to translate this text: "${text}"

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "", 
  "translatedText": "Accurate English translation reflecting the full meaning in context"
}
`;
      }

      console.log("Sending request to Claude API...");
      console.log("Text to process:", text);
      
      // Make API request to Claude using latest API format
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: "claude-3-haiku-20240307",
          max_tokens: 1000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: userMessage
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'x-api-key': apiKey
          }
        }
      );

      console.log("Received response from Claude API");
      
      // Extract and parse the content from Claude's response
      if (response.data && response.data.content && Array.isArray(response.data.content)) {
        // Get the first content item where type is "text"
        const textContent = response.data.content.find((item: ClaudeContentItem) => item.type === "text");
        
        if (textContent && textContent.text) {
          console.log("Claude response content:", textContent.text);
          
          try {
            // Look for JSON in the response text
            const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : textContent.text;
            const parsedContent = JSON.parse(jsonString);
            
            return {
              furiganaText: parsedContent.furiganaText || "",
              translatedText: parsedContent.translatedText || ""
            };
          } catch (parseError) {
            console.error("Error parsing JSON from Claude response:", parseError);
            console.log("Raw content received:", textContent.text);
            throw new Error("Failed to parse Claude API response");
          }
        } else {
          console.error("No text content found in response:", JSON.stringify(response.data));
          throw new Error("No text content in Claude API response");
        }
      } else {
        console.error("Unexpected response structure:", JSON.stringify(response.data));
        throw new Error("Unexpected response structure from Claude API");
      }
    } catch (error: unknown) {
      lastError = error;
      
      // Check if this is an overloaded error that we should retry
      const shouldRetry = error instanceof AxiosError && 
                          (error.response?.status === 529 || 
                           error.response?.headers['x-should-retry'] === 'true');
      
      if (shouldRetry && retryCount < MAX_RETRIES - 1) {
        // Calculate backoff delay with exponential increase
        const backoffDelay = INITIAL_BACKOFF_DELAY * Math.pow(2, retryCount);
        
        console.log(`Claude API overloaded. Retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        // Wait before retrying
        await sleep(backoffDelay);
        
        // Increment retry counter
        retryCount++;
      } else {
        // Max retries reached or non-retryable error, log and exit loop
        console.error('Error processing text with Claude:', error);
        
        // Log more details about the error
        if (error instanceof AxiosError && error.response) {
          // The request was made and the server responded with a status code
          console.error('Error data:', JSON.stringify(error.response.data));
          console.error('Error status:', error.response.status);
          console.error('Error headers:', JSON.stringify(error.response.headers));
        } else if (error instanceof AxiosError && error.request) {
          // The request was made but no response was received
          console.error('No response received:', error.request);
        } else {
          // Something happened in setting up the request
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('Error message:', errorMessage);
        }
        
        break;
      }
    }
  }
  
  // If we've exhausted all retries or encountered a non-retryable error
  if (retryCount >= MAX_RETRIES) {
    console.error(`Claude API still unavailable after ${MAX_RETRIES} retry attempts`);
  }
  
  return {
    furiganaText: '',
    translatedText: 'Error processing text with Claude API. The service may be temporarily overloaded. Please try again later.'
  };
}

// Add default export to satisfy Expo Router's requirement
export default {
  processWithClaude
}; 