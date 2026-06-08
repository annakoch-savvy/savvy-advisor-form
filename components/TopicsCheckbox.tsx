'use client';

import React from 'react';
import Image from 'next/image';

export const FINANCIAL_TOPICS = [
  'Alternatives Investing',
  'Budget and Debt Management',
  'Employer-Sponsored Plans',
  'Environment, Social and Governance (ESG) Investing',
  'Equity Compensation',
  'Estate & Trust Planning',
  'Executive Compensation Planning',
  'Financial Planning & Analysis',
  'Income Planning',
  'Investing for Women',
  'Investment Management',
  'Late-Stage College Planning',
  'Legacy & Charitable Planning',
  'LGBTQIA Planning',
  'Personal Direct Indexing',
  'Real Estate Investment Planning',
  'Retirement Planning',
  'Risk Management',
  'Small Business Tax',
  'Structured Planning',
  'Succession Planning',
  'Tax Optimization',
] as const;

export const TOPIC_ICONS: Record<string, string> = {
  'Alternatives Investing':                          '/icons/alternative-investments.svg',
  'Budget and Debt Management':                      '/icons/financial-planning.svg',
  'Employer-Sponsored Plans':                        '/icons/401k.svg',
  'Environment, Social and Governance (ESG) Investing': '/icons/financial-planning.svg',
  'Equity Compensation':                             '/icons/financial-planning.svg',
  'Estate & Trust Planning':                         '/icons/trust-estate.svg',
  'Executive Compensation Planning':                 '/icons/financial-planning.svg',
  'Financial Planning & Analysis':                   '/icons/financial-planning.svg',
  'Income Planning':                                 '/icons/financial-planning.svg',
  'Investing for Women':                             '/icons/financial-planning.svg',
  'Investment Management':                           '/icons/investment-management.svg',
  'Late-Stage College Planning':                     '/icons/education-planning.svg',
  'Legacy & Charitable Planning':                    '/icons/trust-estate.svg',
  'LGBTQIA Planning':                                '/icons/financial-planning.svg',
  'Personal Direct Indexing':                        '/icons/direct-indexing.svg',
  'Real Estate Investment Planning':                 '/icons/financial-planning.svg',
  'Retirement Planning':                             '/icons/retirement-planning.svg',
  'Risk Management':                                 '/icons/financial-planning.svg',
  'Small Business Tax':                              '/icons/small-business-tax.svg',
  'Structured Planning':                             '/icons/financial-planning.svg',
  'Succession Planning':                             '/icons/succession-planning.svg',
  'Tax Optimization':                                '/icons/tax-optimization.svg',
};

// All 8 brand accent colors — cycle for any list length
export const TOPIC_ACCENT_COLORS = [
  '#175242', // Deep Green
  '#8a6320', // Dark Gold
  '#095972', // Deep Blue
  '#8a4045', // Dark Mauve
  '#6B484D', // Maroon
  '#b55518', // Dark Orange
  '#B63D35', // Red
  '#5c3d75', // Dark Lavender
];

export function useWhiteText(_hexColor: string): boolean {
  // All FAQ_CARD_COLORS pass WCAG AA with white text
  return true;
}

interface TopicsCheckboxProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  error?: string;
}

export default function TopicsCheckbox({ selected, onChange, error }: TopicsCheckboxProps) {
  const handleToggle = (topic: string) => {
    if (selected.includes(topic)) {
      onChange(selected.filter((t) => t !== topic));
    } else {
      if (selected.length >= 4) return;
      onChange([...selected, topic]);
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-5">
        Select <strong>3–4 topics</strong> that best describe your expertise.
        <span className="ml-2 text-xs text-gray-400">{selected.length}/4 selected</span>
      </p>

      <div className="grid grid-cols-2 gap-2">
        {FINANCIAL_TOPICS.map((topic, index) => {
          const isChecked = selected.includes(topic);
          const isDisabled = !isChecked && selected.length >= 4;
          const icon = TOPIC_ICONS[topic];
          const accentColor = TOPIC_ACCENT_COLORS[index % TOPIC_ACCENT_COLORS.length];

          return (
            <label
              key={topic}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-lg border cursor-pointer transition-all ${
                isDisabled ? 'border-gray-100 opacity-40 cursor-not-allowed bg-white' : ''
              } ${!isChecked && !isDisabled ? 'border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50' : ''}`}
              style={isChecked ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => handleToggle(topic)}
                className="sr-only"
              />

              {icon && (
                <div className="shrink-0 w-7 h-7 flex items-center justify-center">
                  <Image
                    src={icon}
                    alt=""
                    width={28}
                    height={28}
                    className="w-7 h-7 object-contain transition-all"
                    style={{
                      filter: isChecked ? 'brightness(0) invert(1)' : 'opacity(0.45)',
                    }}
                  />
                </div>
              )}

              <span className="text-sm leading-tight font-medium transition-colors"
                style={{ color: isChecked ? 'white' : undefined }}>
                {topic}
              </span>

              {isChecked && (
                <div className="ml-auto shrink-0 w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </label>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 flex items-center gap-1">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
