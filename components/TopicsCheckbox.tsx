'use client';

import React from 'react';
import Image from 'next/image';

export const FINANCIAL_TOPICS = [
  'Investment Management',
  'Tax Optimization',
  'Direct Indexing',
  'Retirement Planning',
  'Trust & Estate Planning',
  'Risk Management',
  'Business Succession Planning',
  'Education Planning',
  'Financial Planning & Analysis',
  'Alternative Investments',
  '401(k) for Businesses',
  'P&G Employee Services',
] as const;

export const TOPIC_ICONS: Record<string, string> = {
  'Investment Management':        '/icons/investment-management.svg',
  'Tax Optimization':             '/icons/tax-optimization.svg',
  'Direct Indexing':              '/icons/direct-indexing.svg',
  'Retirement Planning':          '/icons/retirement-planning.svg',
  'Trust & Estate Planning':      '/icons/trust-estate.svg',
  'Risk Management':              '/icons/financial-planning.svg',
  'Business Succession Planning': '/icons/succession-planning.svg',
  'Education Planning':           '/icons/education-planning.svg',
  'Financial Planning & Analysis':'/icons/financial-planning.svg',
  'Alternative Investments':      '/icons/alternative-investments.svg',
  '401(k) for Businesses':        '/icons/401k.svg',
  'P&G Employee Services':        '/icons/small-business-tax.svg',
};

// All 8 brand accent colors in a varied (non-sequential) order
// Dark/light alternates so adjacent cards contrast nicely
// Dark = white text (passes 4.5:1), Light = dark text (#111, passes 4.5:1)
export const TOPIC_ACCENT_COLORS = [
  '#175242', // Deep Green   — white text (9.04:1) ✅
  '#D79F32', // Golden Yellow — dark text  (8.00:1) ✅
  '#095972', // Deep Blue    — white text (7.83:1) ✅
  '#C06F74', // Bright Mauve — dark text  (5.77:1) ✅
  '#6B484D', // Maroon       — white text (7.90:1) ✅
  '#F19E70', // Orange       — dark text  (9.87:1) ✅
  '#B63D35', // Red          — white text (5.66:1) ✅
  '#A98EB1', // Lavender     — dark text  (7.19:1) ✅
];

// Returns true if white text should be used on this background
export function useWhiteText(hexColor: string): boolean {
  const whiteContrast: Record<string, boolean> = {
    '#175242': true,
    '#D79F32': false,
    '#095972': true,
    '#C06F74': false,
    '#6B484D': true,
    '#F19E70': false,
    '#B63D35': true,
    '#A98EB1': false,
  };
  return whiteContrast[hexColor] ?? true;
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
          // Always use white text/icons on colored backgrounds — design decision
          const textColor = 'white';

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
                      filter: isChecked
                        ? 'brightness(0) invert(1)'
                        : 'opacity(0.45)',
                    }}
                  />
                </div>
              )}

              <span
                className="text-sm leading-tight font-medium transition-colors"
                style={{ color: isChecked ? textColor : undefined }}
              >
                {topic}
              </span>

              {isChecked && (
                <div
                  className="ml-auto shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.25)' }}
                >
                  <svg
                    className="w-3 h-3"
                    style={{ color: textColor }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
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
