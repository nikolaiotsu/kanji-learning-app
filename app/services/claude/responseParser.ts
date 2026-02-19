/**
 * JSON cleaning and WordScope response parsing (extracted from claudeApi to reduce bundle size).
 */
import { logger } from '../../utils/logger';

/**
 * Cleans common JSON formatting issues from LLM responses
 */
export function cleanJsonString(jsonString: string): string {
  let cleaned = jsonString;

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  logger.log('🧹 Starting cleanup for:', cleaned.substring(0, 100) + '...');

  const isInlineComma = (commaIndex: number): boolean => {
    if (commaIndex < 0 || commaIndex >= cleaned.length) {
      return false;
    }
    let lookAhead = commaIndex + 1;
    while (lookAhead < cleaned.length && /\s/.test(cleaned[lookAhead])) {
      lookAhead++;
    }
    if (lookAhead >= cleaned.length) {
      return false;
    }
    const lookAheadChar = cleaned[lookAhead];
    return lookAheadChar !== '"' && lookAheadChar !== '}' && lookAheadChar !== ']';
  };

  const logInlineQuoteDetection = (context: 'furigana' | 'translation', pointer: number) => {
    const snippetStart = Math.max(pointer - 15, 0);
    const snippetEnd = Math.min(pointer + 25, cleaned.length);
    const snippet = cleaned.substring(snippetStart, snippetEnd);
    logger.log(`[cleanJsonString] inline quote/comma detected inside ${context} field. Snippet: ${snippet}`);
  };

  try {
    const furiganaStart = cleaned.indexOf('"readingsText"');
    const translationStart = cleaned.indexOf('"translatedText"');

    if (translationStart === -1) {
      throw new Error('Could not find required translatedText field');
    }

    let furiganaValue = '';

    if (furiganaStart !== -1) {
      const furiganaColonIndex = cleaned.indexOf(':', furiganaStart);
      const furiganaQuoteStart = cleaned.indexOf('"', furiganaColonIndex) + 1;

      let furiganaQuoteEnd = furiganaQuoteStart;
      let inEscapeFurigana = false;

      while (furiganaQuoteEnd < cleaned.length) {
        const char = cleaned[furiganaQuoteEnd];

        if (inEscapeFurigana) {
          inEscapeFurigana = false;
          furiganaQuoteEnd++;
          continue;
        }

        if (char === '\\') {
          inEscapeFurigana = true;
          furiganaQuoteEnd++;
          continue;
        }

        if (char === '"') {
          let nextNonWhitespace = furiganaQuoteEnd + 1;
          while (nextNonWhitespace < cleaned.length &&
                 /\s/.test(cleaned[nextNonWhitespace])) {
            nextNonWhitespace++;
          }
          const nextChar = cleaned[nextNonWhitespace];
          if (nextChar === ',' && isInlineComma(nextNonWhitespace)) {
            logInlineQuoteDetection('furigana', furiganaQuoteEnd);
            furiganaQuoteEnd++;
            continue;
          }
          if (nextChar === ',' || nextChar === '}' || nextNonWhitespace >= cleaned.length) {
            break;
          }
        }

        furiganaQuoteEnd++;
      }

      furiganaValue = cleaned.substring(furiganaQuoteStart, furiganaQuoteEnd);
    }

    if (!furiganaValue && cleaned.indexOf('"furiganaText"') !== -1) {
      const legacyStart = cleaned.indexOf('"furiganaText"');
      const legacyColon = cleaned.indexOf(':', legacyStart);
      const legacyQuoteStart = cleaned.indexOf('"', legacyColon) + 1;
      let legacyQuoteEnd = legacyQuoteStart;
      let inEscapeLegacy = false;
      while (legacyQuoteEnd < cleaned.length) {
        const c = cleaned[legacyQuoteEnd];
        if (inEscapeLegacy) { inEscapeLegacy = false; legacyQuoteEnd++; continue; }
        if (c === '\\') { inEscapeLegacy = true; legacyQuoteEnd++; continue; }
        if (c === '"') {
          let next = legacyQuoteEnd + 1;
          while (next < cleaned.length && /\s/.test(cleaned[next])) next++;
          const nextChar = cleaned[next];
          if (nextChar === ',' && isInlineComma(next)) { legacyQuoteEnd++; continue; }
          if (nextChar === ',' || nextChar === '}' || next >= cleaned.length) break;
        }
        legacyQuoteEnd++;
      }
      furiganaValue = cleaned.substring(legacyQuoteStart, legacyQuoteEnd);
    }
    if (!furiganaValue && cleaned.indexOf('"pinyinText"') !== -1) {
      const pinyinStart = cleaned.indexOf('"pinyinText"');
      const pinyinColonIndex = cleaned.indexOf(':', pinyinStart);
      const pinyinQuoteStart = cleaned.indexOf('"', pinyinColonIndex) + 1;
      let pinyinQuoteEnd = pinyinQuoteStart;
      let inEscapePinyin = false;
      while (pinyinQuoteEnd < cleaned.length) {
        const c = cleaned[pinyinQuoteEnd];
        if (inEscapePinyin) { inEscapePinyin = false; pinyinQuoteEnd++; continue; }
        if (c === '\\') { inEscapePinyin = true; pinyinQuoteEnd++; continue; }
        if (c === '"') {
          let next = pinyinQuoteEnd + 1;
          while (next < cleaned.length && /\s/.test(cleaned[next])) next++;
          const nextChar = cleaned[next];
          if (nextChar === ',' && isInlineComma(next)) { pinyinQuoteEnd++; continue; }
          if (nextChar === ',' || nextChar === '}' || next >= cleaned.length) break;
        }
        pinyinQuoteEnd++;
      }
      furiganaValue = cleaned.substring(pinyinQuoteStart, pinyinQuoteEnd);
    }

    const translationColonIndex = cleaned.indexOf(':', translationStart);
    const translationQuoteStart = cleaned.indexOf('"', translationColonIndex) + 1;

    let translationQuoteEnd = translationQuoteStart;
    let inEscape = false;

    while (translationQuoteEnd < cleaned.length) {
      const char = cleaned[translationQuoteEnd];

      if (inEscape) {
        inEscape = false;
        translationQuoteEnd++;
        continue;
      }

      if (char === '\\') {
        inEscape = true;
        translationQuoteEnd++;
        continue;
      }

      if (char === '"') {
        let nextNonWhitespace = translationQuoteEnd + 1;
        while (nextNonWhitespace < cleaned.length &&
               /\s/.test(cleaned[nextNonWhitespace])) {
          nextNonWhitespace++;
        }
        const nextChar = cleaned[nextNonWhitespace];

        if (nextChar === ',' && isInlineComma(nextNonWhitespace)) {
          logInlineQuoteDetection('translation', translationQuoteEnd);
          translationQuoteEnd++;
          continue;
        }

        if (nextChar === ',' || nextChar === '}' || nextNonWhitespace >= cleaned.length) {
          break;
        }
      }

      translationQuoteEnd++;
    }

    let translationValue = cleaned.substring(translationQuoteStart, translationQuoteEnd);

    logger.log(`Extracted furigana length: ${furiganaValue.length}`);
    logger.log(`Extracted translation length: ${translationValue.length}`);

    furiganaValue = furiganaValue
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/[\s}]+$/, '')
      .replace(/[""‚„]/g, '"')
      .replace(/[''‛‹›]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ')
      .replace(/[\u2060\uFEFF\u200C\u200D]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    translationValue = translationValue
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/[\s}]+$/, '')
      .replace(/[""‚„]/g, '"')
      .replace(/[''‛‹›]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ')
      .replace(/[\u2060\uFEFF\u200C\u200D]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    let isCompleteValue: boolean | undefined;
    let analysisValue: string | undefined;

    const isCompleteStart = cleaned.indexOf('"isComplete"');
    if (isCompleteStart !== -1) {
      const isCompleteColonIndex = cleaned.indexOf(':', isCompleteStart);
      const afterColon = cleaned.substring(isCompleteColonIndex + 1).trim();
      if (afterColon.startsWith('true')) {
        isCompleteValue = true;
      } else if (afterColon.startsWith('false')) {
        isCompleteValue = false;
      }
    }

    const analysisStart = cleaned.indexOf('"analysis"');
    if (analysisStart !== -1) {
      const analysisColonIndex = cleaned.indexOf(':', analysisStart);
      const analysisQuoteStart = cleaned.indexOf('"', analysisColonIndex) + 1;

      let analysisQuoteEnd = analysisQuoteStart;
      let inEscapeAnalysis = false;

      while (analysisQuoteEnd < cleaned.length) {
        const char = cleaned[analysisQuoteEnd];

        if (inEscapeAnalysis) {
          inEscapeAnalysis = false;
          analysisQuoteEnd++;
          continue;
        }

        if (char === '\\') {
          inEscapeAnalysis = true;
          analysisQuoteEnd++;
          continue;
        }

        if (char === '"') {
          let nextNonWhitespace = analysisQuoteEnd + 1;
          while (nextNonWhitespace < cleaned.length && /\s/.test(cleaned[nextNonWhitespace])) {
            nextNonWhitespace++;
          }
          const nextChar = cleaned[nextNonWhitespace];
          if (nextChar === ',' || nextChar === '}' || nextNonWhitespace >= cleaned.length) {
            break;
          }
        }

        analysisQuoteEnd++;
      }

      analysisValue = cleaned.substring(analysisQuoteStart, analysisQuoteEnd)
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .trim();
    }

    const resultObj: Record<string, unknown> = {
      readingsText: furiganaValue,
      translatedText: translationValue
    };

    if (isCompleteValue !== undefined) {
      resultObj.isComplete = isCompleteValue;
    }
    if (analysisValue !== undefined) {
      resultObj.analysis = analysisValue;
    }

    const cleanJson = JSON.stringify(resultObj);

    logger.log('✅ Successfully rebuilt JSON:', cleanJson.substring(0, 150) + '...');
    return cleanJson;

  } catch (extractionError) {
    logger.warn('❌ Direct extraction failed, trying fallback...', extractionError);

    cleaned = cleaned
      .replace(/[""‚„«»]/g, '\\"')
      .replace(/[''‛‹›]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ')
      .replace(/[\u2060\uFEFF\u200C\u200D]/g, '')
      .replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/,+/g, ',')
      .trim();

    logger.log('🔧 Fallback cleanup result:', cleaned);
    return cleaned;
  }
}

export type WordScopeParsedResponse = {
  readingsText?: string;
  translatedText: string;
  scopeAnalysis: string | {
    word: string;
    reading: string;
    partOfSpeech: string;
    baseForm?: string;
    grammar?: {
      explanation?: string;
      particles?: Array<{ particle: string; use: string; example: string }>;
    };
    examples: Array<{ sentence: string; translation: string; note: string }>;
    commonMistake: {
      wrong: string;
      correct: string;
      reason: string;
    };
    commonContext?: string;
  };
} | null;

/**
 * Robust JSON parser for WordScope responses with nested structures
 */
export function parseWordScopeResponse(rawResponse: string): WordScopeParsedResponse {
  const cleanedResponse = rawResponse.trim();

  try {
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e: unknown) {
    logger.log(`[WordScope Parser] Strategy 1 (direct parse) failed: ${e instanceof Error ? e.message : e}, trying next...`);
  }

  try {
    const jsonBlockMatch = cleanedResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonBlockMatch) {
      return JSON.parse(jsonBlockMatch[1]);
    }
  } catch (e: unknown) {
    logger.log(`[WordScope Parser] Strategy 2 (markdown blocks) failed: ${e instanceof Error ? e.message : e}, trying next...`);
  }

  try {
    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      let jsonString = cleanedResponse.substring(firstBrace, lastBrace + 1);
      jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');

      try {
        return JSON.parse(jsonString);
      } catch (e: unknown) {
        logger.log(`[WordScope Parser] Strategy 3a failed: ${e instanceof Error ? e.message : e}, trying aggressive cleaning...`);

        try {
          let cleanedJsonString = jsonString
            .replace(/[\u201C\u201D]/g, '\\"')
            .replace(/[\u2018\u2019]/g, "\\'");
          return JSON.parse(cleanedJsonString);
        } catch (e2: unknown) {
          logger.log(`[WordScope Parser] Strategy 3b (smart quote escaping) failed: ${e2 instanceof Error ? e2.message : e2}`);
        }

        try {
          const firstCloseBrace = jsonString.indexOf('}');
          const secondOpenBrace = jsonString.indexOf('{', firstCloseBrace);

          if (firstCloseBrace !== -1 && secondOpenBrace !== -1 && secondOpenBrace > firstCloseBrace) {
            const firstObject = jsonString.substring(0, firstCloseBrace + 1);
            const secondObject = jsonString.substring(secondOpenBrace);

            try {
              const parsed1 = JSON.parse(firstObject);
              const parsed2 = JSON.parse(secondObject);

              if (parsed1.translatedText && !parsed1.scopeAnalysis && parsed2.word) {
                logger.log('[WordScope Parser] Strategy 3c (merge separate objects) succeeded');
                return {
                  readingsText: parsed1.readingsText || '',
                  translatedText: parsed1.translatedText,
                  scopeAnalysis: parsed2
                };
              }
            } catch {
              // Merging failed
            }
          }
        } catch (e3: unknown) {
          logger.log(`[WordScope Parser] Strategy 3c (merge objects) failed: ${e3 instanceof Error ? e3.message : e3}`);
        }
      }
    }
  } catch (e: unknown) {
    logger.log(`[WordScope Parser] Strategy 3 failed: ${e instanceof Error ? e.message : e}, trying next...`);
  }

  try {
    const extractFieldValue = (fieldName: string, jsonString: string, isObject: boolean = false): unknown => {
      const fieldPattern = new RegExp(`"${fieldName}"\\s*:`, 'g');
      const match = fieldPattern.exec(jsonString);
      if (!match) return null;

      const valueStart = match.index + match[0].length;
      let valueEnd = valueStart;

      while (valueEnd < jsonString.length && /\s/.test(jsonString[valueEnd])) {
        valueEnd++;
      }

      if (isObject) {
        if (jsonString[valueEnd] !== '{') return null;

        let depth = 0;
        let inString = false;
        let escapeNext = false;
        let i = valueEnd;

        while (i < jsonString.length) {
          const char = jsonString[i];

          if (escapeNext) {
            escapeNext = false;
            i++;
            continue;
          }

          if (char === '\\') {
            escapeNext = true;
            i++;
            continue;
          }

          if (char === '"') {
            inString = !inString;
          } else if (!inString) {
            if (char === '{') depth++;
            if (char === '}') {
              depth--;
              if (depth === 0) {
                const objectString = jsonString.substring(valueEnd, i + 1);
                try {
                  return JSON.parse(objectString);
                } catch {
                  const cleaned = objectString.replace(/,(\s*[}\]])/g, '$1');
                  try {
                    return JSON.parse(cleaned);
                  } catch {
                    return null;
                  }
                }
              }
            }
          }
          i++;
        }
        return null;
      } else {
        if (jsonString[valueEnd] !== '"') return null;

        let i = valueEnd + 1;
        let inEscape = false;
        const valueChars: string[] = [];

        while (i < jsonString.length) {
          const char = jsonString[i];

          if (inEscape) {
            inEscape = false;
            valueChars.push(char);
            i++;
            continue;
          }

          if (char === '\\') {
            inEscape = true;
            valueChars.push(char);
            i++;
            continue;
          }

          if (char === '"') {
            let nextNonWhitespace = i + 1;
            while (nextNonWhitespace < jsonString.length && /\s/.test(jsonString[nextNonWhitespace])) {
              nextNonWhitespace++;
            }
            const nextChar = jsonString[nextNonWhitespace];
            if (nextChar === ',' || nextChar === '}' || nextNonWhitespace >= jsonString.length) {
              const rawValue = valueChars.join('');
              return rawValue
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t');
            }
          }

          valueChars.push(char);
          i++;
        }
        return null;
      }
    };

    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1) {
      const jsonString = cleanedResponse.substring(firstBrace, lastBrace + 1);

      const furiganaText = extractFieldValue('readingsText', jsonString, false) ?? extractFieldValue('furiganaText', jsonString, false);
      const translatedText = extractFieldValue('translatedText', jsonString, false);
      const scopeAnalysis = extractFieldValue('scopeAnalysis', jsonString, true);

      if (translatedText && scopeAnalysis) {
        const result: NonNullable<WordScopeParsedResponse> = {
          translatedText: translatedText as string,
          scopeAnalysis: scopeAnalysis as NonNullable<WordScopeParsedResponse>['scopeAnalysis']
        };
        if (furiganaText) {
          result.readingsText = furiganaText as string;
        }
        logger.log('[WordScope Parser] Strategy 4 (manual extraction) succeeded');
        return result;
      }
    }
  } catch (e: unknown) {
    logger.log(`[WordScope Parser] Strategy 4 (manual extraction) failed: ${e instanceof Error ? e.message : e}`);
  }

  logger.error('[WordScope Parser] All parsing strategies failed');
  logger.error(`[WordScope Parser] Response length: ${cleanedResponse.length} chars`);
  logger.error(`[WordScope Parser] First 500 chars: ${cleanedResponse.substring(0, 500)}`);
  logger.error(`[WordScope Parser] Last 500 chars: ${cleanedResponse.substring(Math.max(0, cleanedResponse.length - 500))}`);
  return null;
}

/**
 * Ensures a sentence ends with a period, question mark, or exclamation point
 */
export function ensureSentenceEnding(text: string | undefined): string {
  if (text == null || String(text).trim().length === 0) {
    return '';
  }

  const trimmed = text.trim();
  const lastChar = trimmed[trimmed.length - 1];

  if (lastChar === '.' || lastChar === '!' || lastChar === '?' || lastChar === '。' || lastChar === '！' || lastChar === '？') {
    return text;
  }

  return text.trim() + '.';
}

export interface ScopeAnalysisInput {
  word?: string;
  reading?: string;
  partOfSpeech?: string;
  baseForm?: string;
  grammar?: {
    explanation?: string;
    particles?: Array<{ particle: string; use: string; example: string }>;
  };
  examples?: Array<{ sentence: string; translation: string; note: string }>;
  commonMistake?: {
    wrong: string;
    correct: string;
    reason: string;
  };
  commonContext?: string;
  synonyms?: Array<{ phrase: string; translation: string; nuance: string }>;
}

/**
 * Formats the JSON scope analysis response into plain text format
 */
export function formatScopeAnalysis(analysisJson: ScopeAnalysisInput): string {
  const a = analysisJson as Record<string, unknown>;
  const partOfSpeech = (a.partOfSpeech ?? a.part_of_speech ?? a.pos ?? '') as string;
  const baseForm = (a.baseForm ?? a.base_form ?? '') as string;
  const word = (a.word ?? a.key ?? a.phrase ?? '') as string;

  let formatted = '';
  if (word) {
    formatted += `${word}\n`;
  }
  if (partOfSpeech) {
    if (baseForm) {
      formatted += `${partOfSpeech}\n→ Base: ${baseForm}\n`;
    } else {
      formatted += `${partOfSpeech}\n`;
    }
  }
  if (!partOfSpeech && !word) {
    formatted += '(No word or part-of-speech breakdown)\n';
  }

  formatted += '\nGrammar\n';
  if (analysisJson.grammar?.explanation) {
    formatted += `${ensureSentenceEnding(analysisJson.grammar.explanation)}\n`;
  } else {
    formatted += 'Grammar information unavailable.\n';
  }

  const particlesList = Array.isArray(analysisJson.grammar?.particles)
    ? analysisJson.grammar.particles
    : [];
  if (particlesList.length > 0) {
    formatted += '\nCommon particles:\n';
    particlesList.forEach((p: { particle?: string; use?: string; example?: string }) => {
      const particle = p.particle ?? '';
      const use = ensureSentenceEnding(p.use ?? '');
      const example = ensureSentenceEnding(p.example ?? '');
      if (particle || use || example) {
        formatted += `- ${particle} (${use}): ${example}\n`;
      }
    });
  }

  formatted += '\nExamples\n';
  const examples = Array.isArray(analysisJson.examples) ? analysisJson.examples : [];
  examples.forEach((ex: { sentence?: string; translation?: string; note?: string; text?: string; meaning?: string; definition?: string }, index: number) => {
    const sentence = ensureSentenceEnding(ex.sentence ?? ex.text ?? '');
    const translation = ensureSentenceEnding(ex.translation ?? ex.meaning ?? '');
    const note = ensureSentenceEnding(ex.note ?? ex.definition ?? '');
    if (sentence || translation || note) {
      formatted += `${index + 1}. ${sentence}\n`;
      formatted += `   ${translation}\n`;
      formatted += `   → ${note}\n`;
      if (index < examples.length - 1) {
        formatted += '\n';
      }
    }
  });

  const cm = analysisJson.commonMistake;
  formatted += '\n⚠️ Common Mistake or Nuance\n';
  if (cm) {
    formatted += `✗ ${ensureSentenceEnding(cm.wrong)}\n`;
    formatted += `✓ ${ensureSentenceEnding(cm.correct)}\n`;
    formatted += `${ensureSentenceEnding(cm.reason)}`;
  } else {
    formatted += 'Common mistake information unavailable.\n';
  }

  if (analysisJson.commonContext) {
    formatted += '\n\n📍 Common Context\n';
    formatted += `${ensureSentenceEnding(analysisJson.commonContext)}`;
  }

  const synonyms = Array.isArray(analysisJson.synonyms) ? analysisJson.synonyms : [];
  if (synonyms.length > 0) {
    formatted += '\n\n🔄 Alternative Expressions\n';
    synonyms.forEach((syn: { phrase?: string; translation?: string; nuance?: string; expression?: string; meaning?: string; note?: string }, index: number) => {
      const phrase = syn.phrase ?? syn.expression ?? '';
      const translation = ensureSentenceEnding(syn.translation ?? syn.meaning ?? '');
      const nuance = ensureSentenceEnding(syn.nuance ?? syn.note ?? '');
      if (phrase || translation || nuance) {
        formatted += `${index + 1}. ${phrase}\n`;
        formatted += `   ${translation}\n`;
        formatted += `   → ${nuance}\n`;
        if (index < synonyms.length - 1) {
          formatted += '\n';
        }
      }
    });
  }

  return formatted;
}
