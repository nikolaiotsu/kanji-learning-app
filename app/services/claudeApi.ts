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
 * Processes Japanese text with Claude AI API to add furigana and provide translation
 * @param japaneseText The Japanese text to be processed
 * @returns Object containing text with furigana and English translation
 */
export async function processWithClaude(japaneseText: string): Promise<ClaudeResponse> {
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
You are a Japanese language expert. I need you to analyze this Japanese text and add furigana to ALL kanji characters: "${japaneseText}"

Important instructions:
1. Add furigana (reading in hiragana) for EVERY kanji character
2. Consider the full context of the sentence to determine the correct readings
3. For compound words, provide the reading for the entire word
4. For words like "通い" (かよい), "抑え" (おさえ), ensure you provide the correct contextual reading
5. If there are multiple possible readings, choose the most likely one based on context

Format your response as valid JSON with these exact keys:
{
  "furiganaText": "Japanese text with all kanji accompanied by furigana",
  "translatedText": "Accurate English translation reflecting the full meaning"
}

Example format (using different text):
For input "東京に行きます", your response should contain:
"furiganaText": "東(とう)京(きょう)に行(い)きます"
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
    
    return {
      furiganaText: '',
      translatedText: 'Error processing text with Claude API. Please check console for details.'
    };
  }
} 