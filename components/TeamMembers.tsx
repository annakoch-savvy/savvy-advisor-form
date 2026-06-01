'use client';

import React from 'react';

export interface TeamMember {
  fullName: string;
  email: string;
  linkedIn: string;
  role: string;
}

interface TeamMembersProps {
  members: TeamMember[];
  onChange: (members: TeamMember[]) => void;
  errors: Record<number, Partial<Record<keyof TeamMember, string>>>;
  maxMembers?: number;
}

const emptyMember = (): TeamMember => ({
  fullName: '',
  email: '',
  linkedIn: '',
  role: '',
});

export default function TeamMembers({ members, onChange, errors, maxMembers = 5 }: TeamMembersProps) {
  const addMember = () => {
    if (members.length < maxMembers) {
      onChange([...members, emptyMember()]);
    }
  };

  const removeMember = (index: number) => {
    onChange(members.filter((_, i) => i !== index));
  };

  const updateMember = (index: number, field: keyof TeamMember, value: string) => {
    const updated = members.map((m, i) => (i === index ? { ...m, [field]: value } : m));
    onChange(updated);
  };

  return (
    <div className="space-y-6">
      {members.map((member, idx) => (
        <div key={idx} className="border-b border-gray-100 pb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Team Member {idx + 1}</h4>
            <button
              type="button"
              onClick={() => removeMember(idx)}
              className="text-sm text-gray-400 hover:text-black transition-colors"
            >
              ×
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={member.fullName}
                onChange={(e) => updateMember(idx, 'fullName', e.target.value)}
                className={`w-full px-0 py-2 text-sm bg-transparent border-0 border-b focus:outline-none focus:border-black transition-colors ${
                  errors[idx]?.fullName ? 'border-red-400' : 'border-gray-300'
                }`}
                placeholder="Jane Smith"
              />
              {errors[idx]?.fullName && (
                <p className="text-xs text-red-500 mt-1">{errors[idx].fullName}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={member.email}
                onChange={(e) => updateMember(idx, 'email', e.target.value)}
                className={`w-full px-0 py-2 text-sm bg-transparent border-0 border-b focus:outline-none focus:border-black transition-colors ${
                  errors[idx]?.email ? 'border-red-400' : 'border-gray-300'
                }`}
                placeholder="jane@example.com"
              />
              {errors[idx]?.email && (
                <p className="text-xs text-red-500 mt-1">{errors[idx].email}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                LinkedIn URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={member.linkedIn}
                onChange={(e) => updateMember(idx, 'linkedIn', e.target.value)}
                className={`w-full px-0 py-2 text-sm bg-transparent border-0 border-b focus:outline-none focus:border-black transition-colors ${
                  errors[idx]?.linkedIn ? 'border-red-400' : 'border-gray-300'
                }`}
                placeholder="https://linkedin.com/in/..."
              />
              {errors[idx]?.linkedIn && (
                <p className="text-xs text-red-500 mt-1">{errors[idx].linkedIn}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Role / Title <span className="text-gray-400 font-normal normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={member.role}
                onChange={(e) => updateMember(idx, 'role', e.target.value)}
                className="w-full px-0 py-2 text-sm bg-transparent border-0 border-b border-gray-300 focus:outline-none focus:border-black transition-colors"
                placeholder="Senior Financial Advisor"
              />
            </div>
          </div>
        </div>
      ))}

      {members.length < maxMembers && (
        <button
          type="button"
          onClick={addMember}
          className="text-sm text-gray-500 hover:text-black transition-colors font-medium"
        >
          + Add team member
        </button>
      )}
    </div>
  );
}
