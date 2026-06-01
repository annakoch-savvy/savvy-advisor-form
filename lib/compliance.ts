export const PROHIBITED_WORDS = [
  'best',
  'guaranteed',
  'guarantee',
  'no risk',
  'unmatched',
  'world class',
  'world-class',
  'industry-leading',
  'industry leading',
  'industry leader',
  'unrivaled',
  'superior',
  'perfect',
  'flawless',
  'risk-free',
  'risk free',
];

export function checkCompliance(text: string): string[] {
  return PROHIBITED_WORDS.filter((term) => {
    const escaped = term.replace(/[-\s]/g, '[\\s-]');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(text);
  });
}
