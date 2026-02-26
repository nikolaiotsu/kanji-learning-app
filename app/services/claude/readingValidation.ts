/**
 * Language-specific reading/romanization validators (extracted from claudeApi to reduce bundle size).
 */
import { logger } from '../../utils/logger';
import { analyzeKoreanRomanization } from '../koreanRomanizationGuards';

/**
 * Validates that Chinese text with pinyin has proper coverage and accuracy
 */
export function validatePinyinAccuracy(originalText: string, pinyinText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  accuracy: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };

  const chineseCharRegex = /[\u4e00-\u9fff]/g;
  const originalChinese = originalText.match(chineseCharRegex) || [];
  const totalChineseCount = originalChinese.length;

  if (totalChineseCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      accuracy: 100,
      details: "No Chinese characters found in text"
    };
  }

  const pinyinSections = pinyinText.match(/[\u4e00-\u9fff]+\([^)]+\)/g) || [];
  pinyinSections.forEach(section => {
    const pinyinPart = section.split('(')[1]?.split(')')[0] || '';
    const syllables = pinyinPart.split(/[\s\-]+/).filter(s => s.length > 0);
    syllables.forEach(syllable => {
      if (!/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(syllable) &&
          !['de', 'le', 'ma', 'ba', 'ne', 'zi', 'zhe'].includes(syllable)) {
        issues.push(`Missing tone mark: ${syllable}`);
        suggestions.push(`Add appropriate tone mark to ${syllable}`);
      }
    });
  });

  const chineseWordsWithPinyin = pinyinText.match(/[\u4e00-\u9fff]+(?=\([^)]+\))/g) || [];
  const totalCoveredChars = chineseWordsWithPinyin.join('').length;
  if (totalCoveredChars < totalChineseCount * 0.9) {
    issues.push("Incomplete pinyin coverage - some Chinese characters missing pinyin");
    suggestions.push("Ensure all Chinese characters have pinyin readings");
  }

  const toneSandhiPatterns = [
    { pattern: /不是\(bùshì\)/g, correct: '不是(búshì)', rule: '不 + 4th tone should be bú' },
    { pattern: /不对\(bùduì\)/g, correct: '不对(búduì)', rule: '不 + 4th tone should be bú' },
    { pattern: /一个\(yīge\)/g, correct: '一个(yíge)', rule: '一 + 4th tone should be yí' },
    { pattern: /你好\(nǐhǎo\)/g, correct: '你好(níhǎo)', rule: '3rd + 3rd tone: first becomes 2nd' }
  ];
  toneSandhiPatterns.forEach(({ pattern, correct, rule }) => {
    if (pattern.test(pinyinText)) {
      issues.push(`Tone sandhi error detected - ${rule}`);
      suggestions.push(`Use ${correct} instead`);
    }
  });

  const commonCompounds: Record<string, string> = {
    '普通话': 'pǔtōnghuà',
    '北京大学': 'Běijīng Dàxué',
    '中华人民共和国': 'Zhōnghuá Rénmín Gònghéguó',
    '电视机': 'diànshìjī',
    '计算机': 'jìsuànjī',
    '图书馆': 'túshūguǎn',
    '大学生': 'dàxuéshēng',
    '火车站': 'huǒchēzhàn'
  };
  Object.entries(commonCompounds).forEach(([compound, correctPinyin]) => {
    if (originalText.includes(compound)) {
      const compoundPattern = new RegExp(`${compound}\\(([^)]+)\\)`);
      const match = pinyinText.match(compoundPattern);
      if (match && match[1] !== correctPinyin) {
        issues.push(`Incorrect compound reading: ${compound}(${match[1]})`);
        suggestions.push(`Use standard reading: ${compound}(${correctPinyin})`);
      }
    }
  });

  const maxIssues = Math.max(1, totalChineseCount / 2);
  const accuracy = Math.max(0, Math.round(100 - (issues.length / maxIssues) * 100));
  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
    accuracy,
    details: `Checked ${totalChineseCount} Chinese characters, found ${issues.length} issues`
  };
}

/**
 * Validates that Japanese text with furigana has proper coverage of all kanji
 */
export function validateJapaneseFurigana(originalText: string, furiganaText: string): {
  isValid: boolean;
  missingKanjiCount: number;
  totalKanjiCount: number;
  details: string;
} {
  const kanjiRegex = /[\u4e00-\u9fff]/g;
  const originalKanji = originalText.match(kanjiRegex) || [];
  const totalKanjiCount = originalKanji.length;

  if (totalKanjiCount === 0) {
    return {
      isValid: true,
      missingKanjiCount: 0,
      totalKanjiCount: 0,
      details: "No kanji found in text"
    };
  }

  const furiganaPattern = /[\u4e00-\u9fff][\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]*\([ぁ-ゟ\?]+\)/g;
  const furiganaMatches = furiganaText.match(furiganaPattern) || [];
  const kanjiWithFurigana: string[] = [];
  furiganaMatches.forEach(match => {
    const kanjiPart = match.split('(')[0];
    const kanjiInMatch = kanjiPart.match(kanjiRegex) || [];
    kanjiWithFurigana.push(...kanjiInMatch);
  });

  const commonCompounds: Record<string, string> = {
    '車道': 'しゃどう',
    '歩道': 'ほどう',
    '自転車': 'じてんしゃ',
    '新聞': 'しんぶん',
    '今朝': 'けさ',
    '市場': 'いちば',
    '一人': 'ひとり',
    '二人': 'ふたり',
    '今日': 'きょう',
    '明日': 'あした',
    '昨日': 'きのう',
    '大人': 'おとな',
    '子供': 'こども'
  };

  let incorrectReadings = 0;
  Object.keys(commonCompounds).forEach(compound => {
    if (originalText.includes(compound)) {
      const expectedReading = commonCompounds[compound];
      const compoundPattern = new RegExp(`${compound}\\(([^)]+)\\)`, 'g');
      const match = compoundPattern.exec(furiganaText);
      if (match && match[1] !== expectedReading) {
        logger.log(`Incorrect reading for ${compound}: got ${match[1]}, expected ${expectedReading}`);
        incorrectReadings++;
      }
    }
  });

  const missingKanjiCount = Math.max(0, totalKanjiCount - kanjiWithFurigana.length);
  const isValid = missingKanjiCount === 0 && incorrectReadings === 0;
  let details = '';
  if (missingKanjiCount > 0) {
    details += `${missingKanjiCount} out of ${totalKanjiCount} kanji are missing furigana. `;
  } else {
    details += `All ${totalKanjiCount} kanji have furigana. `;
  }
  if (incorrectReadings > 0) {
    details += `Found ${incorrectReadings} compound words with incorrect readings.`;
  } else {
    details += `No incorrect compound readings detected.`;
  }
  return {
    isValid,
    missingKanjiCount,
    totalKanjiCount,
    details
  };
}

/**
 * Validates Korean text with romanization for accuracy and completeness
 */
export function validateKoreanRomanization(originalText: string, romanizedText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  accuracy: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };

  const koreanRegex = /[\uAC00-\uD7AF]/g;
  const originalKorean = originalText.match(koreanRegex) || [];
  const totalKoreanCount = originalKorean.length;

  if (totalKoreanCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      accuracy: 100,
      details: "No Korean characters found in text"
    };
  }

  const romanizedKorean = romanizedText.match(koreanRegex) || [];
  const romanizedKoreanCount = romanizedKorean.length;
  if (romanizedKoreanCount === 0 || romanizedKoreanCount < totalKoreanCount * 0.3) {
    return {
      isValid: false,
      issues: ["CRITICAL: Claude returned romanization-only without Korean characters - original Hangul was lost"],
      suggestions: [
        "Retry with explicit instruction to preserve original Korean text",
        "Format must be: 한글(romanization) not just romanization"
      ],
      accuracy: 0,
      details: `Critical failure: Original text had ${totalKoreanCount} Korean characters, but romanized result has only ${romanizedKoreanCount}. Claude likely misinterpreted slashes/parentheses in input.`
    };
  }

  const koreanWordsWithRomanization = romanizedText.match(/[\uAC00-\uD7AF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  const totalCoveredChars = koreanWordsWithRomanization.join('').length;
  if (totalCoveredChars < totalKoreanCount * 0.9) {
    issues.push("Incomplete romanization coverage - some Korean words missing romanization");
    addSuggestion("Ensure all Korean words have romanization readings");
  }

  const annotationIssues = analyzeKoreanRomanization(romanizedText);
  annotationIssues.forEach(issue => {
    if (issue.reason === 'nonHangulBase') {
      issues.push(`Romanization applied to non-Hangul text: ${issue.base}(${issue.reading})`);
      addSuggestion("Remove romanization from numbers/Latin text and only annotate Hangul words.");
    } else if (issue.reason === 'japaneseSyllable') {
      issues.push(`Japanese-style romaji detected: ${issue.base}(${issue.reading})`);
      addSuggestion("Use Revised Romanization syllables (no ni-sen, san-ju, shi, tsu, gatsu, desu, etc.).");
    }
  });

  const vowelDistinctionChecks = [
    { korean: '서', romanized: 'seo', wrong: 'so', description: 'ㅓ should be "eo" not "o"' },
    { korean: '소', romanized: 'so', wrong: 'seo', description: 'ㅗ should be "o" not "eo"' },
    { korean: '어', romanized: 'eo', wrong: 'o', description: 'ㅓ should be "eo" not "o"' },
    { korean: '오', romanized: 'o', wrong: 'eo', description: 'ㅗ should be "o" not "eo"' }
  ];
  vowelDistinctionChecks.forEach(check => {
    const wrongPattern = new RegExp(`${check.korean}[!?.,;:'"'"‚""„‹›«»‑–—…\\s]*\\([^)]*${check.wrong}[^)]*\\)`, 'g');
    if (wrongPattern.test(romanizedText)) {
      issues.push(`Vowel distinction error: ${check.description}`);
      suggestions.push(`Use "${check.romanized}" for ${check.korean}`);
    }
  });

  const euVsUChecks = [
    { korean: '으', romanized: 'eu', wrong: 'u', description: 'ㅡ should be "eu" not "u"' },
    { korean: '우', romanized: 'u', wrong: 'eu', description: 'ㅜ should be "u" not "eu"' }
  ];
  euVsUChecks.forEach(check => {
    const wrongPattern = new RegExp(`${check.korean}[!?.,;:'"'"‚""„‹›«»‑–—…\\s]*\\([^)]*${check.wrong}[^)]*\\)`, 'g');
    if (wrongPattern.test(romanizedText)) {
      issues.push(`Vowel consistency error: ${check.description}`);
      suggestions.push(`Use "${check.romanized}" for ${check.korean}`);
    }
  });

  const commonPatterns: Record<string, string> = {
    '습니다': 'seum-ni-da',
    '했습니다': 'haess-seum-ni-da',
    '갔습니다': 'gass-seum-ni-da',
    '왔습니다': 'wass-seum-ni-da',
    '봤습니다': 'bwass-seum-ni-da',
    '구경했습니다': 'gu-gyeong-haess-seum-ni-da',
    '에서': 'e-seo',
    '에게': 'e-ge',
    '에만': 'e-man',
    '에도': 'e-do',
    '은는': 'eun-neun',
    '을를': 'eul-reul',
    '일곱시': 'il-gop-si',
    '여덟시': 'yeo-deol-si',
    '아홉시': 'a-hop-si',
    '열시': 'yeol-si',
    '점심시간': 'jeom-sim-si-gan',
    '저녁시간': 'jeo-nyeok-si-gan',
    '변화시키고': 'byeon-hwa-si-ki-go',
    '중요성': 'jung-yo-seong',
    '평생교육': 'pyeong-saeng-gyo-yug',
    '자갈치시장': 'ja-gal-chi-si-jang',
    '김수진': 'gim-su-jin',
    '좋아요': 'jo-a-yo',
    '좋습니다': 'jo-seum-ni-da',
    '안녕하세요': 'an-nyeong-ha-se-yo',
    '감사합니다': 'gam-sa-ham-ni-da',
    '죄송합니다': 'joe-song-ham-ni-da'
  };
  Object.entries(commonPatterns).forEach(([korean, correctRomanization]) => {
    if (originalText.includes(korean)) {
      const pattern = new RegExp(`${korean}[!?.,;:'"'"‚""„‹›«»‑–—…\\s]*\\(([^)]+)\\)`);
      const match = romanizedText.match(pattern);
      if (match && match[1] !== correctRomanization) {
        issues.push(`Incorrect romanization: ${korean}(${match[1]})`);
        suggestions.push(`Use standard romanization: ${korean}(${correctRomanization})`);
      }
    }
  });

  const formalEndingPatterns = [
    { pattern: /습니다[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]*\)/g, check: 'seum-ni-da', description: 'Formal polite ending' },
    { pattern: /었습니다[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]*\)/g, check: 'eoss-seum-ni-da', description: 'Past formal ending' },
    { pattern: /았습니다[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]*\)/g, check: 'ass-seum-ni-da', description: 'Past formal ending' },
    { pattern: /였습니다[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]*\)/g, check: 'yeoss-seum-ni-da', description: 'Past formal ending' }
  ];
  formalEndingPatterns.forEach(({ pattern, check, description }) => {
    const matches = romanizedText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const romanizedPart = match.match(/\(([^)]+)\)/)?.[1];
        if (romanizedPart && !romanizedPart.includes(check.split('-').pop() || '')) {
          issues.push(`Incomplete formal ending: ${description} should end with proper romanization`);
          suggestions.push(`Ensure formal endings are complete (e.g., -seum-ni-da)`);
        }
      });
    }
  });

  const compoundBoundaryChecks = [
    { word: '평생교육', expected: 'pyeong-saeng-gyo-yug', description: 'Compound should maintain clear syllable boundaries' },
    { word: '자갈치시장', expected: 'ja-gal-chi-si-jang', description: 'Place names should have clear boundaries' },
    { word: '점심시간', expected: 'jeom-sim-si-gan', description: 'Time compounds should have clear boundaries' }
  ];
  compoundBoundaryChecks.forEach(({ word, expected, description }) => {
    if (originalText.includes(word)) {
      const pattern = new RegExp(`${word}[!?.,;:'"'"‚""„‹›«»‑–—…\\s]*\\(([^)]+)\\)`);
      const match = romanizedText.match(pattern);
      if (match && match[1] && !match[1].includes('-')) {
        issues.push(`Missing syllable boundaries in compound: ${word}`);
        suggestions.push(`Use clear boundaries: ${word}(${expected}) - ${description}`);
      }
    }
  });

  const maxIssues = Math.max(1, totalKoreanCount / 3);
  const accuracy = Math.max(0, Math.round(100 - (issues.length / maxIssues) * 100));
  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
    accuracy,
    details: `Checked ${totalKoreanCount} Korean characters, found ${issues.length} issues. Accuracy: ${accuracy}%`
  };
}

/**
 * Validates Russian text with transliteration for accuracy and completeness
 */
export function validateRussianTransliteration(originalText: string, transliteratedText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  cyrillicCoverage: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };

  const cyrillicRegex = /[\u0400-\u04FF]/g;
  const originalCyrillic = originalText.match(cyrillicRegex) || [];
  const totalCyrillicCount = originalCyrillic.length;

  if (totalCyrillicCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      cyrillicCoverage: 100,
      details: "No Russian characters found in text"
    };
  }

  const cyrillicWordsWithTranslit = transliteratedText.match(/[\u0400-\u04FF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  const totalCoveredChars = cyrillicWordsWithTranslit.join('').length;
  const cyrillicCoverage = totalCyrillicCount > 0 ? Math.round((totalCoveredChars / totalCyrillicCount) * 100) : 0;

  if (cyrillicCoverage < 90) {
    issues.push(`Missing Cyrillic base text - only ${cyrillicCoverage}% of original Cyrillic preserved`);
    addSuggestion("Ensure all Russian words keep their original Cyrillic text with romanization in parentheses");
  }

  const romanOnlyPattern = /\b([a-zA-Z]+)\(\1\)/g;
  const romanOnlyMatches = transliteratedText.match(romanOnlyPattern);
  if (romanOnlyMatches && romanOnlyMatches.length > 0) {
    issues.push(`Romanization without Cyrillic base detected: ${romanOnlyMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Replace Latin text with original Cyrillic characters before the romanization");
  }

  const palatalizationChecks = [
    { cyrillic: 'ль', translit: "l'", description: 'Soft L should use apostrophe' },
    { cyrillic: 'нь', translit: "n'", description: 'Soft N should use apostrophe' },
    { cyrillic: 'ть', translit: "t'", description: 'Soft T should use apostrophe' },
    { cyrillic: 'дь', translit: "d'", description: 'Soft D should use apostrophe' },
    { cyrillic: 'сь', translit: "s'", description: 'Soft S should use apostrophe' }
  ];
  palatalizationChecks.forEach(check => {
    const cyrillicPattern = new RegExp(`[\\u0400-\\u04FF]*${check.cyrillic}[\\u0400-\\u04FF]*[!?.,;:'"'"‚""„‹›«»‑–—…\\s]*\\(([^)]+)\\)`, 'g');
    const matches = transliteratedText.match(cyrillicPattern);
    if (matches) {
      matches.forEach(match => {
        const translitPart = match.match(/\(([^)]+)\)/)?.[1] || '';
        if (!translitPart.includes("'")) {
          issues.push(`Missing palatalization marker in: ${match}`);
          addSuggestion(`Use ${check.translit} for ${check.cyrillic} (${check.description})`);
        }
      });
    }
  });

  const originalCyrillicWords = originalText.match(/[\u0400-\u04FF]+/g) || [];
  const coveredCyrillicWords = transliteratedText.match(/[\u0400-\u04FF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  if (coveredCyrillicWords.length < originalCyrillicWords.length * 0.9) {
    issues.push("Incomplete transliteration coverage - some Russian words missing romanization");
    addSuggestion("Ensure all Russian words have transliteration readings");
  }

  return {
    isValid: issues.length === 0 && cyrillicCoverage >= 90,
    issues,
    suggestions,
    cyrillicCoverage,
    details: `Checked ${totalCyrillicCount} Cyrillic characters, coverage: ${cyrillicCoverage}%, found ${issues.length} issues`
  };
}

/**
 * Attempts to rebuild Russian furigana text by matching romanization back to original Cyrillic
 */
export function rebuildRussianFuriganaFromRomanization(originalText: string, brokenFuriganaText: string): string {
  try {
    const cyrillicWords = originalText.match(/[\u0400-\u04FF]+/g) || [];
    const romanizationPattern = /([a-zA-Z]+)\(([a-zA-Z'"\s\-]+)\)/g;
    let rebuilt = brokenFuriganaText;
    let wordIndex = 0;

    rebuilt = rebuilt.replace(romanizationPattern, (match, base, reading) => {
      if (wordIndex < cyrillicWords.length) {
        const cyrillicBase = cyrillicWords[wordIndex];
        wordIndex++;
        return `${cyrillicBase}(${reading})`;
      }
      return match;
    });

    logger.log(`[Russian Rebuild] Attempted to rebuild ${wordIndex} words from romanization to Cyrillic`);
    const cyrillicCount = (rebuilt.match(/[\u0400-\u04FF]/g) || []).length;
    if (cyrillicCount > 0) {
      logger.log(`[Russian Rebuild] Successfully restored ${cyrillicCount} Cyrillic characters`);
      return rebuilt;
    }
    logger.warn('[Russian Rebuild] Rebuild did not restore Cyrillic characters');
    return '';
  } catch (error) {
    logger.error('[Russian Rebuild] Error during rebuild:', error);
    return '';
  }
}

/**
 * Validates Arabic text with romanization for accuracy and completeness
 */
export function validateArabicRomanization(originalText: string, romanizedText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  arabicCoverage: number;
  accuracy: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };

  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
  const originalArabic = originalText.match(arabicRegex) || [];
  const totalArabicCount = originalArabic.length;

  if (totalArabicCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      arabicCoverage: 100,
      accuracy: 100,
      details: "No Arabic characters found in text"
    };
  }

  const arabicWordsWithRoman = romanizedText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  const totalCoveredChars = arabicWordsWithRoman.join('').length;
  const arabicCoverage = totalArabicCount > 0 ? Math.round((totalCoveredChars / totalArabicCount) * 100) : 0;

  if (arabicCoverage < 90) {
    issues.push(`Missing Arabic base text - only ${arabicCoverage}% of original Arabic preserved`);
    addSuggestion("Ensure all Arabic words keep their original Arabic script with Chat Alphabet in parentheses");
  }

  const wrongOrderPattern = /\([a-zA-Z\-']+\)[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g;
  const wrongOrderMatches = romanizedText.match(wrongOrderPattern);
  if (wrongOrderMatches && wrongOrderMatches.length > 0) {
    issues.push(`Romanization before Arabic text detected (wrong order): ${wrongOrderMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Format must be: Arabic(romanization), NOT (romanization)Arabic");
  }

  const loneRomanPattern = /(?<![[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF])\([a-zA-Z\-']+\)(?![[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF])/g;
  const loneRomanMatches = romanizedText.match(loneRomanPattern);
  if (loneRomanMatches && loneRomanMatches.length > 0) {
    issues.push(`Romanization without Arabic base detected: ${loneRomanMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Add the original Arabic text before each romanization in parentheses");
  }

  const sunLetterErrors = [
    { pattern: /al-t[ahiou]/g, correction: 'at-', example: 'at-ta, at-ti' },
    { pattern: /al-d[ahiou]/g, correction: 'ad-', example: 'ad-da, ad-du' },
    { pattern: /al-r[ahiou]/g, correction: 'ar-', example: 'ar-ra, ar-ri' },
    { pattern: /al-s[ahiou]/g, correction: 'as-', example: 'as-sa, as-si' },
    { pattern: /al-sh[ahiou]/g, correction: 'ash-', example: 'ash-sha' },
    { pattern: /al-n[ahiou]/g, correction: 'an-', example: 'an-na, an-ni' }
  ];
  sunLetterErrors.forEach(check => {
    const matches = romanizedText.match(check.pattern);
    if (matches && matches.length > 0) {
      issues.push(`Sun letter assimilation error: found "${matches[0]}" - should use "${check.correction}"`);
      addSuggestion(`Use ${check.correction} for sun letters (e.g., ${check.example})`);
    }
  });

  const originalArabicWords = originalText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g) || [];
  const coveredArabicWords = romanizedText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  if (coveredArabicWords.length < originalArabicWords.length * 0.9) {
    issues.push("Incomplete romanization coverage - some Arabic words missing Chat Alphabet");
    addSuggestion("Ensure all Arabic words have romanization readings");
  }

  const diacriticalPattern = /[\u0300-\u036F\u0323-\u0333]/g;
  const diacriticalMatches = romanizedText.match(diacriticalPattern);
  if (diacriticalMatches && diacriticalMatches.length > 0) {
    issues.push(`Diacritical marks detected in romanization (${diacriticalMatches.length} found) - should use simple ASCII`);
    addSuggestion("Use simple ASCII letters: kh (not k̲h̲), sh (not s̲h̲), d (not ḍ or d̲)");
  }

  const issueWeight = Math.min(issues.length * 5, 30);
  const accuracy = Math.max(0, arabicCoverage - issueWeight);
  return {
    isValid: issues.length === 0 && arabicCoverage >= 90,
    issues,
    suggestions,
    arabicCoverage,
    accuracy,
    details: `Checked ${totalArabicCount} Arabic characters, coverage: ${arabicCoverage}%, accuracy: ${accuracy}%, found ${issues.length} issues`
  };
}

/**
 * Strips diacritical marks from Arabic romanization text
 */
export function stripArabicDiacritics(text: string): string {
  if (!text) return text;
  let cleaned = text.normalize('NFD').replace(/[\u0300-\u036F\u0323-\u0333]/g, '');
  cleaned = cleaned.normalize('NFC');
  logger.log(`[Arabic Diacritics] Stripped diacritics: "${text.substring(0, 50)}..." -> "${cleaned.substring(0, 50)}..."`);
  return cleaned;
}

/**
 * Validates Hindi text with romanization for accuracy and completeness
 */
export function validateHindiRomanization(originalText: string, romanizedText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  hindiCoverage: number;
  accuracy: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };

  const hindiRegex = /[\u0900-\u097F]/g;
  const originalHindi = originalText.match(hindiRegex) || [];
  const totalHindiCount = originalHindi.length;

  if (totalHindiCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      hindiCoverage: 100,
      accuracy: 100,
      details: "No Hindi characters found in text"
    };
  }

  const hindiWordsWithRoman = romanizedText.match(/[\u0900-\u097F]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  const totalCoveredChars = hindiWordsWithRoman.join('').length;
  const hindiCoverage = totalHindiCount > 0 ? Math.round((totalCoveredChars / totalHindiCount) * 100) : 0;

  if (hindiCoverage < 90) {
    issues.push(`Missing Hindi base text - only ${hindiCoverage}% of original Hindi preserved`);
    addSuggestion("Ensure all Hindi words keep their original Devanagari script with IAST romanization in parentheses");
  }

  const wrongOrderPattern = /\([a-zA-ZāēīōūǎěǐǒǔàèìòùáéíóúǘǙǚǜǖǕǗǙǛüÜɑśṅñṭḍṇḷṛṣḥṁṃḷ̥ṝṟĝśḱńṗṟť\-']+\)[\u0900-\u097F]+/g;
  const wrongOrderMatches = romanizedText.match(wrongOrderPattern);
  if (wrongOrderMatches && wrongOrderMatches.length > 0) {
    issues.push(`Romanization before Hindi text detected (wrong order): ${wrongOrderMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Format must be: Hindi(romanization), NOT (romanization)Hindi");
  }

  const loneRomanPattern = /(?<![\u0900-\u097F])\([a-zA-ZāēīōūǎěǐǒǔàèìòùáéíóúǘǙǚǜǖǕǗǙǛüÜɑśṅñṭḍṇḷṛṣḥṁṃḷ̥ṝṟĝśḱńṗṟť\-']+\)(?![\u0900-\u097F])/g;
  const loneRomanMatches = romanizedText.match(loneRomanPattern);
  if (loneRomanMatches && loneRomanMatches.length > 0) {
    issues.push(`Romanization without Hindi base detected: ${loneRomanMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Add the original Hindi text before each romanization in parentheses");
  }

  const quoteInsidePattern = /[\u0900-\u097F]+\([^)]*['""][^)]*\)/g;
  const quoteInsideMatches = romanizedText.match(quoteInsidePattern);
  if (quoteInsideMatches && quoteInsideMatches.length > 0) {
    issues.push(`Quote or punctuation inside parentheses detected: ${quoteInsideMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Quotes and punctuation should be OUTSIDE parentheses: हूं(hūṃ)\" NOT हूं(hūṃ\")");
  }

  const hasMacrons = /[āīū]/.test(romanizedText);
  const hasRetroflexDots = /[ṭḍṇṣṃṅñśḥḷṛ]/.test(romanizedText);
  if (!hasMacrons && totalHindiCount > 10) {
    issues.push("Missing vowel length marks (ā, ī, ū) - romanization may be incomplete");
    addSuggestion("Use proper IAST: आ = ā, ई = ī, ऊ = ū (with macrons)");
  }
  if (!hasRetroflexDots && totalHindiCount > 10) {
    issues.push("Missing retroflex/nasal marks (ṭ, ḍ, ṇ, ṣ, ṃ) - romanization may be incomplete");
    addSuggestion("Use proper IAST: ट = ṭ, ड = ḍ, ण = ṇ, ष = ṣ, ं = ṃ (with dots)");
  }

  const originalHindiWords = originalText.match(/[\u0900-\u097F]+/g) || [];
  const coveredHindiWords = romanizedText.match(/[\u0900-\u097F]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  if (coveredHindiWords.length < originalHindiWords.length * 0.9) {
    issues.push("Incomplete romanization coverage - some Hindi words missing IAST");
    addSuggestion("Ensure all Hindi words have romanization readings");
  }

  const issueWeight = Math.min(issues.length * 5, 30);
  const accuracy = Math.max(0, hindiCoverage - issueWeight);
  return {
    isValid: issues.length === 0 && hindiCoverage >= 90,
    issues,
    suggestions,
    hindiCoverage,
    accuracy,
    details: `Checked ${totalHindiCount} Hindi characters, coverage: ${hindiCoverage}%, accuracy: ${accuracy}%, found ${issues.length} issues`
  };
}

/**
 * Validates Thai text with RTGS romanization for accuracy and completeness
 */
export function validateThaiRomanization(originalText: string, romanizedText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  thaiCoverage: number;
  accuracy: number;
  details: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const addSuggestion = (message: string) => {
    if (!suggestions.includes(message)) {
      suggestions.push(message);
    }
  };

  const thaiRegex = /[\u0E00-\u0E7F]/g;
  const originalThai = originalText.match(thaiRegex) || [];
  const totalThaiCount = originalThai.length;

  if (totalThaiCount === 0) {
    return {
      isValid: true,
      issues: [],
      suggestions: [],
      thaiCoverage: 100,
      accuracy: 100,
      details: "No Thai characters found in text"
    };
  }

  const thaiWordsWithRoman = romanizedText.match(/[\u0E00-\u0E7F]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  const totalCoveredChars = thaiWordsWithRoman.join('').length;
  const thaiCoverage = totalThaiCount > 0 ? Math.round((totalCoveredChars / totalThaiCount) * 100) : 0;

  if (thaiCoverage < 90) {
    issues.push(`Missing Thai base text - only ${thaiCoverage}% of original Thai preserved`);
    addSuggestion("Ensure all Thai words keep their original Thai script with RTGS romanization in parentheses");
  }

  const wrongOrderPattern = /\([a-zA-Z\-']+\)[\u0E00-\u0E7F]+/g;
  const wrongOrderMatches = romanizedText.match(wrongOrderPattern);
  if (wrongOrderMatches && wrongOrderMatches.length > 0) {
    issues.push(`Romanization before Thai text detected (wrong order): ${wrongOrderMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Format must be: Thai(romanization), NOT (romanization)Thai");
  }

  const loneRomanPattern = /(?<![\u0E00-\u0E7F])\([a-zA-Z\-']+\)(?![\u0E00-\u0E7F])/g;
  const loneRomanMatches = romanizedText.match(loneRomanPattern);
  if (loneRomanMatches && loneRomanMatches.length > 0) {
    issues.push(`Romanization without Thai base detected: ${loneRomanMatches.slice(0, 3).join(', ')}`);
    addSuggestion("Add the original Thai text before each romanization in parentheses");
  }

  const originalThaiWords = originalText.match(/[\u0E00-\u0E7F]+/g) || [];
  const coveredThaiWords = romanizedText.match(/[\u0E00-\u0E7F]+(?=[!?.,;:'"'"‚""„‹›«»‑–—…\s]*\([^)]+\))/g) || [];
  if (coveredThaiWords.length < originalThaiWords.length * 0.9) {
    issues.push("Incomplete romanization coverage - some Thai words missing RTGS");
    addSuggestion("Ensure all Thai words have RTGS romanization readings");
  }

  const issueWeight = Math.min(issues.length * 5, 30);
  const accuracy = Math.max(0, thaiCoverage - issueWeight);
  return {
    isValid: issues.length === 0 && thaiCoverage >= 90,
    issues,
    suggestions,
    thaiCoverage,
    accuracy,
    details: `Checked ${totalThaiCount} Thai characters, coverage: ${thaiCoverage}%, accuracy: ${accuracy}%, found ${issues.length} issues`
  };
}
