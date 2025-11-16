import * as assert from 'assert';
import {
  sanitizeKoreanRomanization,
  analyzeKoreanRomanization,
  KoreanAnnotationIssue
} from '../app/services/koreanRomanizationGuards';

declare const require: any;
declare const module: any;

function testSanitizerRemovesNonHangulAnnotations() {
  const sample =
    '장관은(jang-gwan-eun) 상황을(sang-hwang-eul) 2030(ni-sen-san-ju)년에 보고했다.';
  const { sanitizedText, strippedAnnotations } = sanitizeKoreanRomanization(sample);

  assert.ok(
    !sanitizedText.includes('(ni-sen-san-ju)'),
    'Sanitized text should remove Japanese romaji from digits'
  );
  assert.deepStrictEqual(
    strippedAnnotations,
    ['2030(ni-sen-san-ju)'],
    'Sanitizer must report stripped annotations for logging'
  );
}

function testAnalyzerFlagsJapanesePatterns() {
  const sample = '국회에(ni-sen-san-ju) 참석했다.';
  const issues = analyzeKoreanRomanization(sample);

  const japaneseIssue = issues.find(issue => issue.reason === 'japaneseSyllable');
  assert.ok(japaneseIssue, 'Analyzer should flag Japanese syllable usage');
  assert.strictEqual(japaneseIssue?.base, '국회에');

  const format: KoreanAnnotationIssue | undefined = issues.find(
    issue => issue.base === '국회에'
  );
  assert.ok(format, 'Analyzer should include base text for debugging');
}

export function runKoreanRomanizationGuardTests() {
  testSanitizerRemovesNonHangulAnnotations();
  testAnalyzerFlagsJapanesePatterns();
  console.log('✅ koreanRomanizationGuards tests passed');
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  runKoreanRomanizationGuardTests();
}


