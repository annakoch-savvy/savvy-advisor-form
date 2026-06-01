'use client';

import React from 'react';

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

interface TopicsCheckboxProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  error?: string;
}

export default function TopicsCheckbox({
  selected,
  onChange,
  error,
}: TopicsCheckboxProps) {
  const handleToggle = (topic: string) => {
    if (selected.includes(topic)) {
      onChange(selected.filter((t) => t !== topic));
    } else {
      if (selected.length >= 4) return; // max 4
      onChange([...selected, topic]);
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Select <strong>3–4 topics</strong> that best describe your expertise.
        <span className="ml-2 text-xs text-gray-400">{selected.length}/4 selected</span>
      </p>
      <div>
        {FINANCIAL_TOPICS.map((topic) => {
          const isChecked = selected.includes(topic);
          const isDisabled = !isChecked && selected.length >= 4;
          return (
            <label
              key={topic}
              className={`flex items-center gap-3 py-2.5 border-b cursor-pointer transition-colors ${
                isChecked
                  ? 'border-black'
                  : isDisabled
                  ? 'border-gray-100 opacity-40 cursor-not-allowed'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <div className={`w-4 h-4 border-2 flex items-center justify-center transition-all shrink-0 ${
                isChecked ? 'border-black bg-black' : 'border-gray-300'
              }`}>
                {isChecked && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => handleToggle(topic)}
                className="sr-only"
              />
              <span className={`text-sm ${isChecked ? 'text-black font-medium' : 'text-gray-600'}`}>{topic}</span>
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
