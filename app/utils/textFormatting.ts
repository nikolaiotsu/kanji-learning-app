/**
 * Normalizes quotation marks and special punctuation to prevent JSON parsing issues.
 * Converts ASCII pseudo-quotes to proper typographic quotes that won't break JSON strings.
 * @param text The text to normalize
 * @returns Text with normalized quotation marks
 */
export function normalizeQuotationMarks(text: string): string {
  if (!text) return text;
  
  return text
    // Convert << >> to French guillemets (safer for JSON)
    .replace(/<<\s*/g, '\u00AB')  // « (U+00AB LEFT-POINTING DOUBLE ANGLE QUOTATION MARK)
    .replace(/\s*>>/g, '\u00BB')  // » (U+00BB RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK)
    // CRITICAL: Convert ALL straight ASCII double quotes to typographic quotes
    // This prevents JSON parsing errors when Claude includes quotes in translations
    // We use a simple alternating pattern: odd quotes = open, even quotes = close
    .replace(/"/g, (match, offset, string) => {
      // Count preceding quotes to determine if this is opening or closing
      const precedingQuotes = string.substring(0, offset).split('"').length - 1;
      return precedingQuotes % 2 === 0 ? '\u201C' : '\u201D';  // " or "
    })
    // Convert straight single quotes to typographic apostrophes in contractions
    .replace(/(\w)'(\w)/g, '$1\u2019$2');  // ' (U+2019 RIGHT SINGLE QUOTATION MARK)
}

/**
 * Cleans text by removing unwanted characters and formatting
 */
export function cleanText(text: string): string {
  // Remove newlines and replace with spaces
  let cleanedText = text.replace(/\n/g, ' ');
  
  // Remove extra spaces
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
  
  // Normalize quotation marks to prevent JSON parsing issues
  cleanedText = normalizeQuotationMarks(cleanedText);
  
  // Check if text contains Chinese or Japanese characters
  const containsChineseOrJapanese = containsChineseJapanese(cleanedText);
  const containsKorean = containsKoreanText(cleanedText);
  
  // Only remove spaces between characters for Chinese and Japanese texts
  // Korean should preserve the original spacing
  if (containsChineseOrJapanese && !containsKorean) {
    // Regex for Japanese and Chinese characters
    const cjCharRegex = /([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff])\s+([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff])/g;
    
    // Continue replacing until no more changes
    let previousText;
    do {
      previousText = cleanedText;
      cleanedText = cleanedText.replace(cjCharRegex, '$1$2');
    } while (previousText !== cleanedText);
  }
  
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

/**
 * Checks if text contains Chinese or Japanese characters
 */
export function containsChineseJapanese(text: string): boolean {
  // Regex for hiragana, katakana, and CJK unified ideographs (kanji/hanzi)
  const cjRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
  return cjRegex.test(text);
}

/**
 * Checks if text contains Chinese characters only (no Japanese-specific characters)
 */
export function containsChinese(text: string): boolean {
  // First check if it contains any CJK characters
  if (!containsChineseJapanese(text)) return false;
  
  // Then make sure it doesn't contain Japanese-specific characters (hiragana, katakana)
  const japaneseSpecificRegex = /[\u3040-\u30ff]/;
  return !japaneseSpecificRegex.test(text);
}

/**
 * Checks if text contains Korean characters
 */
export function containsKoreanText(text: string): boolean {
  // Comprehensive regex for Hangul (Korean alphabet)
  // Includes Hangul syllables, Hangul Jamo, and Hangul compatibility Jamo
  const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC]/;
  return koreanRegex.test(text);
}

/**
 * Checks if text contains Russian characters
 */
export function containsRussianText(text: string): boolean {
  // Regex for Cyrillic alphabet (covers Russian characters)
  const russianRegex = /[\u0400-\u04FF]/;
  return russianRegex.test(text);
}

/**
 * Checks if text contains Arabic characters
 */
export function containsArabicText(text: string): boolean {
  // Regex for Arabic alphabet
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F]/;
  return arabicRegex.test(text);
}

/**
 * Checks if text contains Italian characters and patterns
 */
export function containsItalianText(text: string): boolean {
  // Characters distinct to Italian (like accented vowels)
  const italianSpecificChars = /[àèéìíîòóùú]/i;
  
  // Common Italian word patterns (articles, prepositions, endings)
  const italianPatterns = /\b(il|lo|la|i|gli|le|un|uno|una|di|da|in|con|su|per|tra|fra)\b|\w+(zione|tà|ità|ismo|ista|mente|are|ere|ire)\b/i;
  
  // Check for Italian specific characters or word patterns
  return italianSpecificChars.test(text) || italianPatterns.test(text);
}

/**
 * Checks if text contains Tagalog characters and patterns
 */
export function containsTagalogText(text: string): boolean {
  // Tagalog-specific characters include ñ and accented vowels
  const tagalogSpecificChars = /[ñÑ]/i;
  
  // Common Tagalog words and patterns (articles, prepositions, common word parts)
  const tagalogPatterns = /\b(ang|ng|mga|sa|kay|ni|si|at|kung|na|ay|para|ito|iyon|nito|niyon|naman|din|rin)\b|\w+(han|in|an|hin)\b/i;
  
  // Check for Tagalog specific characters or word patterns
  return tagalogSpecificChars.test(text) || tagalogPatterns.test(text);
}

/**
 * Checks if text contains any content (from any language)
 */
export function containsText(text: string): boolean {
  // Regex for hiragana, katakana, kanji, Latin letters, numbers, symbols, and other characters used in various languages
  const textRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0030-\u0039\u0041-\u005A\u0061-\u007A\uFF65-\uFF9F\u0020-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u2010-\u2015\u2018-\u201D\u3000-\u303F]/;
  return textRegex.test(text);
}

/**
 * Checks if Japanese text contains kanji characters that would need furigana
 */
export function containsKanji(text: string): boolean {
  // Regex for kanji characters (CJK unified ideographs)
  const kanjiRegex = /[\u4e00-\u9fff]/;
  return kanjiRegex.test(text);
}

/**
 * Counts the number of kanji characters in text
 */
export function countKanji(text: string): number {
  const kanjiRegex = /[\u4e00-\u9fff]/g;
  const matches = text.match(kanjiRegex);
  return matches ? matches.length : 0;
}

/**
 * Checks if text contains French characters and patterns
 */
export function containsFrenchText(text: string): boolean {
  // French-specific characters (accented vowels and consonants)
  const frenchSpecificChars = /[àâäéèêëïîôöùûüÿç]/i;
  
  // Common French words and patterns (articles, prepositions, common words)
  const frenchPatterns = /\b(le|la|les|un|une|des|du|de|et|est|dans|avec|pour|sur|par|ce|cette|ces|qui|que|dont|où|mais|ou|donc|car|ni|si|très|plus|moins|bien|mal|tout|tous|toute|toutes|avoir|être|faire|aller|venir|voir|savoir|pouvoir|vouloir|devoir|prendre|donner|mettre|dire|partir|sortir|entrer|monter|descendre|rester|tomber|naître|mourir|devenir|revenir|parvenir|maintenir|retenir|obtenir|contenir|soutenir|appartenir|parvenir|intervenir|prévenir|subvenir|survenir|advenir|convenir|disconvenir|reconvenir|souvenir|tenir|venir|tion|sion|ment|ique|able|ible|eur|euse|eux|euses|ais|ait|aient|ons|ez|ent)\b/i;
  
  // Check for French specific characters or word patterns
  return frenchSpecificChars.test(text) || frenchPatterns.test(text);
}

/**
 * Checks if text contains Spanish characters and patterns
 */
export function containsSpanishText(text: string): boolean {
  // Spanish-specific characters (including ñ and accented vowels)
  const spanishSpecificChars = /[ñáéíóúü¿¡]/i;
  
  // Common Spanish words and patterns (articles, prepositions, common words)
  const spanishPatterns = /\b(el|la|los|las|un|una|unos|unas|de|del|al|en|con|por|para|sin|sobre|bajo|entre|desde|hasta|hacia|según|durante|mediante|contra|ante|tras|y|o|pero|sino|que|quien|cual|cuyo|donde|cuando|como|porque|aunque|si|mientras|pues|así|entonces|también|tampoco|muy|más|menos|bien|mal|todo|toda|todos|todas|ser|estar|haber|tener|hacer|decir|poder|deber|querer|saber|ver|dar|venir|ir|salir|llegar|pasar|quedar|poner|seguir|parecer|conocer|llevar|traer|encontrar|sentir|vivir|morir|nacer|crecer|ção|são|mente|oso|osa|ivo|iva|ado|ada|ido|ida|ando|iendo|ar|er|ir)\b/i;
  
  // Check for Spanish specific characters or word patterns
  return spanishSpecificChars.test(text) || spanishPatterns.test(text);
}

/**
 * Checks if text contains Portuguese characters and patterns
 */
export function containsPortugueseText(text: string): boolean {
  // Portuguese-specific characters (including ã, õ, ç and accented vowels)
  const portugueseSpecificChars = /[ãõçáéíóúâêîôûàèìòù]/i;
  
  // Common Portuguese words and patterns (articles, prepositions, common words)
  const portuguesePatterns = /\b(o|a|os|as|um|uma|uns|umas|de|do|da|dos|das|em|no|na|nos|nas|com|por|para|sem|sobre|sob|entre|desde|até|através|segundo|durante|mediante|contra|perante|após|antes|e|ou|mas|porém|contudo|todavia|entretanto|que|quem|qual|cujo|onde|quando|como|porque|embora|se|enquanto|pois|assim|então|também|tampouco|muito|mais|menos|bem|mal|todo|toda|todos|todas|ser|estar|ter|haver|fazer|dizer|poder|dever|querer|saber|ver|dar|vir|ir|sair|chegar|passar|ficar|pôr|seguir|parecer|conhecer|levar|trazer|encontrar|sentir|viver|morrer|nascer|crescer|ção|são|mente|oso|osa|ivo|iva|ado|ada|ido|ida|ando|endo|indo|ar|er|ir)\b/i;
  
  // Check for Portuguese specific characters or word patterns
  return portugueseSpecificChars.test(text) || portuguesePatterns.test(text);
}

/**
 * Checks if text contains Vietnamese characters or common words
 */
export function containsVietnameseText(text: string): boolean {
  const vietnameseDiacritics = /[àáảãạăắằẳẵặâấầẩẫậđếềểễệêốồổỗộôớờởỡợưứừửữựỀỀỂỄỆỐỒỔỖỘƠỚỜỞỠỢƯ]+/i;
  const vietnamesePatterns = /\b(việt|nam|người|không|có|tôi|anh|chị|ông|bà|đang|đã|sẽ|là|với|một|hai|ba)\b/i;

  return vietnameseDiacritics.test(text) || vietnamesePatterns.test(text);
}

/**
 * Checks if text contains German characters and patterns
 */
export function containsGermanText(text: string): boolean {
  // German-specific characters (umlauts and ß)
  const germanSpecificChars = /[äöüÄÖÜß]/i;
  
  // Common German words and patterns (articles, prepositions, common words)
  const germanPatterns = /\b(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|und|oder|aber|doch|jedoch|sondern|dass|wenn|weil|da|obwohl|während|bevor|nachdem|seit|bis|als|wie|wo|wohin|woher|warum|weshalb|weswegen|womit|wodurch|wofür|wogegen|worüber|worauf|worin|woraus|wovon|wozu|ich|du|er|sie|es|wir|ihr|sie|mich|dich|ihn|uns|euch|sich|mir|dir|ihm|ihr|ihnen|mein|dein|sein|ihr|unser|euer|dieser|diese|dieses|jener|jene|jenes|welcher|welche|welches|alle|alles|viele|wenige|einige|mehrere|andere|beide|sein|haben|werden|können|müssen|sollen|wollen|dürfen|mögen|lassen|gehen|kommen|machen|sagen|sehen|wissen|denken|glauben|finden|nehmen|geben|bringen|halten|stehen|liegen|sitzen|leben|arbeiten|spielen|lernen|verstehen|sprechen|hören|lesen|schreiben|kaufen|verkaufen|fahren|laufen|fliegen|schwimmen|essen|trinken|schlafen|aufstehen|anziehen|ausziehen|waschen|putzen|kochen|backen|öffnen|schließen|beginnen|aufhören|ung|keit|heit|schaft|tum|nis|sal|lich|ig|isch|bar|sam|haft|los|voll|reich|arm|ern|eln|chen|lein)\b/i;
  
  // Check for German specific characters or word patterns
  return germanSpecificChars.test(text) || germanPatterns.test(text);
}

/**
 * Checks if text contains English characters and patterns
 */
export function containsEnglishText(text: string): boolean {
  // Common English words and patterns - keeping it simple since Claude API does the heavy lifting
  const englishPatterns = /\b(the|and|or|but|in|on|at|to|for|of|with|by|from|about|into|through|during|before|after|above|below|up|down|out|off|over|under|again|further|then|once|this|that|these|those|i|you|he|she|it|we|they|me|him|her|us|them|my|your|his|her|its|our|their|mine|yours|hers|ours|theirs|am|is|are|was|were|being|been|be|have|has|had|having|do|does|did|doing|will|would|could|should|may|might|must|can|shall|ought|need|dare|used|got|get|getting|say|said|saying|go|going|went|gone|come|coming|came|take|taking|took|taken|make|making|made|see|seeing|saw|seen|know|knowing|knew|known|think|thinking|thought|give|giving|gave|given|find|finding|found|work|working|worked|call|calling|called|try|trying|tried|ask|asking|asked|need|needing|needed|feel|feeling|felt|become|becoming|became|leave|leaving|left|put|putting|move|moving|moved|right|new|good|high|different|small|large|next|early|young|important|few|public|bad|same|able)\b/i;
  
  // Check for English word patterns
  return englishPatterns.test(text);
}

/**
 * Checks if text contains Hindi characters
 */
export function containsHindiText(text: string): boolean {
  // Regex for Devanagari script (used for Hindi)
  // Unicode range U+0900-U+097F covers Devanagari characters
  const hindiRegex = /[\u0900-\u097F]/;
  return hindiRegex.test(text);
}

/**
 * Checks if text contains Thai characters
 */
export function containsThaiText(text: string): boolean {
  // Unicode range for Thai script
  const thaiRegex = /[\u0E00-\u0E7F]/;
  return thaiRegex.test(text);
}

/**
 * Checks if text contains Esperanto characters and patterns
 */
export function containsEsperantoText(text: string): boolean {
  // Esperanto-specific characters (circumflexed letters)
  const esperantoSpecificChars = /[ĉĝĥĵŝŭĈĜĤĴŜŬ]/i;
  
  // Common Esperanto words and patterns
  const esperantoPatterns = /\b(la|kaj|de|en|al|estas|estis|estos|estus|estu|sed|aŭ|ne|jes|mi|vi|li|ŝi|ĝi|ni|ili|min|vin|lin|ŝin|ĝin|nin|ilin|mia|via|lia|ŝia|ĝia|nia|ilia|tio|tiu|kie|kio|kiu|kiam|kiel|kiom|kial|per|pri|pro|sur|sub|antaŭ|post|dum|inter|kontraŭ|kun|sen|ĉe|ĉar|se|ke|ol|kvankam|malgraŭ|ankaŭ|nur|jam|ankoraŭ|hodiaŭ|hieraŭ|morgaŭ|nun|tuj|ĉiam|neniam|ofte|foje|multe|malmulte|pli|malpli|plej|malplej|tre|sufiĉe|preskaŭ|tute|bone|malbone|facile|malfacile|rapide|malrapide|hejme|urben|domen|lernejen|laborejo|vendejo|restoracio|hotelo|stacidomo|flughaveno|hospitalo|universitato|lernejo|biblioteko|muzeo|teatro|kinejo|parko|ĝardeno|arbaro|lago|rivero|maro|monto|kamparo|urbo|vilaĝo|domo|ĉambro|kuirejo|banĉambro|dormĉambro|salono|korto|balkono|fenestro|pordo|tablo|seĝo|lito|armaro|fridujo|fornelo|komputilo|telefono|televido|radio|libro|gazeto|revuo|letero|mesaĝo|monujo|horloĝo|kalendaro|plumo|krajono|papero|pomo|bano|pano|akvo|lakto|kafo|teo|vino|biero|viando|fiŝo|legomo|frukto|riĉo|sukero|salo|pipro|butero|fromaĝo|ovo|rizo|terpomo|tomato|karoto|brasiko|salato|cepolo|ajlo|limono|oranĝo|bano|frago|ĉerizo|pomo|piro|persiko|uvo|anas|dolĉa|sala|acida|amara|varma|malvarma|freŝa|malnova|nova|juna|maljuna|alta|malalta|granda|malgranda|dika|maldika|larĝa|mallarĝa|longa|mallonga|forta|malforta|sana|malsana|riĉa|malriĉa|feliĉa|malfeliĉa|ĝoja|malĝoja|kontenta|malkontenta|trankvila|maltrankvila|okupita|malokupita|libera|mallibera|facila|malfacila|simpla|malsimpla|komplika|malkomplika|klara|malklara|pura|malpura|preta|malpreta|plena|malplena|vanta|malvanta|utila|malutila|necesa|malnecesa|ebla|malebla|certa|malcerta|vera|malvera|ĝusta|malĝusta|bela|malbela|laŭta|mallaŭta|silenta|malsilenta|lumig|malluma|kuraĝa|malkuraĝa|saĝa|malsaĝa|bona|malbona|ĝentila|malĝentila|amika|malamika|ĉarma|malĉarma|inter|esa)\b/i;
  
  // Check for Esperanto specific characters or word patterns
  return esperantoSpecificChars.test(text) || esperantoPatterns.test(text);
}

// For backward compatibility
export const cleanJapaneseText = cleanText;

/**
 * Localizes wordscope section headings in scopeAnalysis text
 * Replaces English headings with localized versions based on target language
 * 
 * @param scopeAnalysis The scopeAnalysis text with English headings
 * @param headingsMap Object mapping English headings to localized headings
 * @returns ScopeAnalysis text with localized headings
 */
export function localizeScopeAnalysisHeadings(
  scopeAnalysis: string,
  headingsMap: {
    grammar: string;
    examples: string;
    commonMistake: string;
    commonContext: string;
    alternativeExpressions: string;
  }
): string {
  if (!scopeAnalysis) return scopeAnalysis;

  let localized = scopeAnalysis;

  // Replace Grammar heading (with optional newline before it)
  localized = localized.replace(/\nGrammar\n/g, `\n${headingsMap.grammar}\n`);
  localized = localized.replace(/^Grammar\n/g, `${headingsMap.grammar}\n`);

  // Replace Examples heading (with optional newline before it)
  localized = localized.replace(/\nExamples\n/g, `\n${headingsMap.examples}\n`);
  localized = localized.replace(/^Examples\n/g, `${headingsMap.examples}\n`);

  // Replace Common Mistake or Nuance heading (with emoji and optional newline before it)
  localized = localized.replace(/\n⚠️ Common Mistake or Nuance\n/g, `\n⚠️ ${headingsMap.commonMistake}\n`);
  localized = localized.replace(/^⚠️ Common Mistake or Nuance\n/g, `⚠️ ${headingsMap.commonMistake}\n`);

  // Replace Common Context heading (with emoji and optional newline before it)
  localized = localized.replace(/\n\n📍 Common Context\n/g, `\n\n📍 ${headingsMap.commonContext}\n`);
  localized = localized.replace(/\n📍 Common Context\n/g, `\n📍 ${headingsMap.commonContext}\n`);

  // Replace Alternative Expressions heading (with emoji and optional newline before it)
  localized = localized.replace(/\n\n🔄 Alternative Expressions\n/g, `\n\n🔄 ${headingsMap.alternativeExpressions}\n`);
  localized = localized.replace(/\n🔄 Alternative Expressions\n/g, `\n🔄 ${headingsMap.alternativeExpressions}\n`);

  return localized;
}

/**
 * Segment for styled scope analysis rendering
 */
export interface ScopeAnalysisSegment {
  text: string;
  isSourceLanguage: boolean;
  /** Target language (e.g. translations and notes in Examples / Alternative Expressions) */
  isTargetLanguage: boolean;
}

/**
 * Parses scopeAnalysis text into segments for styling.
 * Source language: example sentences, wrong/correct, alternative phrases → green.
 * Target language: translation and "→ note" lines in Examples / Alternative Expressions → purple.
 *
 * @param scopeAnalysis The localized scopeAnalysis text
 * @returns Array of segments with isSourceLanguage / isTargetLanguage for styling
 */
export function parseScopeAnalysisForStyling(scopeAnalysis: string): ScopeAnalysisSegment[] {
  if (!scopeAnalysis) return [];

  const lines = scopeAnalysis.split('\n');
  const segments: ScopeAnalysisSegment[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSource =
      /^\d+\.\s+.+/.test(line) ||  // "1. sentence" or "2. phrase" (Examples / Alternative Expressions)
      /^✗\s+.+/.test(line) ||      // "✗ wrong" (Common Mistake)
      /^✓\s+.+/.test(line);        // "✓ correct" (Common Mistake)
    // Indented translation lines only (target language). Exclude "   → note" lines so those stay default color.
    const isTarget = line.startsWith('   ') && !line.startsWith('   →');

    segments.push({
      text: line + (i < lines.length - 1 ? '\n' : ''),
      isSourceLanguage: isSource,
      isTargetLanguage: isTarget && !isSource,
    });
  }

  return segments;
}

// Add this default export to satisfy Expo Router
const TextFormatting = { 
  cleanText, 
  cleanJapaneseText,
  normalizeQuotationMarks,
  containsJapanese, 
  containsChineseJapanese,
  containsChinese,
  containsKoreanText,
  containsText,
  containsRussianText,
  containsArabicText,
  containsItalianText,
  containsTagalogText,
  containsFrenchText,
  containsSpanishText,
  containsPortugueseText,
  containsGermanText,
  containsEnglishText,
  containsHindiText,
  containsThaiText,
  containsVietnameseText,
  containsEsperantoText,
  containsKanji,
  countKanji,
  localizeScopeAnalysisHeadings,
  parseScopeAnalysisForStyling
};
export default TextFormatting; 