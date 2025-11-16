const HANGUL_REGEX = /[\uAC00-\uD7AF]/;
const ANNOTATION_REGEX = /([^\s()]+)\(([^\)]*)\)/g;
const JAPANESE_ROMAJI_PATTERNS = [
  /ni-?sen/i,
  /san-?ju/i,
  /gatsu/i,
  /-desu\b/i,
  /\bshi\b/i,
  /tsu/i
];

export type KoreanAnnotationIssueReason = 'nonHangulBase' | 'japaneseSyllable';

export interface KoreanAnnotationIssue {
  base: string;
  reading: string;
  reason: KoreanAnnotationIssueReason;
}

const createAnnotationRegex = () => new RegExp(ANNOTATION_REGEX);

export function sanitizeKoreanRomanization(text: string) {
  if (!text) {
    return { sanitizedText: text, strippedAnnotations: [] as string[] };
  }

  const strippedAnnotations: string[] = [];
  const regex = createAnnotationRegex();

  const sanitizedText = text.replace(regex, (match, base, reading) => {
    if (HANGUL_REGEX.test(base)) {
      return match;
    }
    strippedAnnotations.push(`${base}(${reading})`);
    return base;
  });

  return { sanitizedText, strippedAnnotations };
}

export function analyzeKoreanRomanization(text: string): KoreanAnnotationIssue[] {
  if (!text) {
    return [];
  }

  const issues: KoreanAnnotationIssue[] = [];
  const regex = createAnnotationRegex();

  for (const match of text.matchAll(regex)) {
    const base = match[1];
    const reading = match[2];
    const hasHangul = HANGUL_REGEX.test(base);

    if (!hasHangul) {
      issues.push({ base, reading, reason: 'nonHangulBase' });
      continue;
    }

    const normalizedReading = reading.normalize('NFKD').toLowerCase();
    if (JAPANESE_ROMAJI_PATTERNS.some(pattern => pattern.test(normalizedReading))) {
      issues.push({ base, reading, reason: 'japaneseSyllable' });
    }
  }

  return issues;
}

