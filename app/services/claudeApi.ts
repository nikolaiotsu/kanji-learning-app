import axios, { AxiosError } from 'axios';
import Constants from 'expo-constants';

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
 * Processes Japanese text with Claude AI API to add furigana and provide translation
 * @param japaneseText The Japanese text to be processed
 * @returns Object containing text with furigana and English translation
 */
export async function processWithClaude(japaneseText: string): Promise<ClaudeResponse> {
  // Maximum number of retry attempts
  const MAX_RETRIES = 3;
  // Initial backoff delay in milliseconds
  const INITIAL_BACKOFF_DELAY = 1000;
  
  let retryCount = 0;
  let lastError: unknown = null;

  while (retryCount < MAX_RETRIES) {
    try {
      // Try to get Claude API key from environment variables or from Constants
      const apiKey = process.env.EXPO_PUBLIC_CLAUDE_API_KEY || 
                    (Constants.expoConfig?.extra?.claudeApiKey as string);
      
      console.log("API Key available:", apiKey ? "Yes (length: " + apiKey.length + ")" : "No");
      
      if (!apiKey) {
        throw new Error('Claude API key is not configured. Please add EXPO_PUBLIC_CLAUDE_API_KEY to your environment variables.');
      }

      // Define the user message with our prompt
      const userMessage = `
You are a Japanese language expert. I need you to analyze this Japanese text and add furigana to words containing kanji: "${japaneseText}"

IMPORTANT: You must follow this EXACT format:
- Keep all original text as is
- For each word containing kanji, add the hiragana reading in parentheses immediately after the COMPLETE word
- The reading should cover the entire word (including any hiragana parts)
- Add readings only for words containing kanji
- Non-kanji words should remain unchanged

Examples of correct formatting:
- "東京" should become "東京(とうきょう)"
- "日本語" should become "日本語(にほんご)"
- "勉強する" should become "勉強する(べんきょうする)"
- "引き金" should become "引き金(ひきがね)"

For this text: "${japaneseText}"
The response should maintain all original text but add readings for words containing kanji.

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Japanese text with furigana after each kanji word as shown in examples",
  "translatedText": "Accurate English translation reflecting the full meaning in context"
}
`;

      console.log("Sending request to Claude API...");
      console.log("Text to process:", japaneseText);
      
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