'use client';

import React, { useState, useRef, useEffect } from 'react';
import TopicsCheckbox from '@/components/TopicsCheckbox';
import { checkCompliance } from '@/lib/compliance';
import { PageType, PAGE_TYPE_LABELS } from '@/lib/emailTemplate';

// ─── Types ───────────────────────────────────────────────────────────────────

const LS_KEY = 'savvy_advisor_submitted';
const DRAFT_PREFIX = 'savvy_draft_';

type DraftData = Omit<FormData, 'photo'> & { savedAt: string };

function draftKey(email: string) {
  return DRAFT_PREFIX + email.trim().toLowerCase();
}

function saveDraft(email: string, form: FormData) {
  if (!email.trim()) return;
  try {
    const { photo: _photo, ...rest } = form;
    const draft: DraftData = { ...rest, savedAt: new Date().toISOString() };
    localStorage.setItem(draftKey(email), JSON.stringify(draft));
  } catch { /* ignore */ }
}

function loadDraft(email: string): DraftData | null {
  try {
    const raw = localStorage.getItem(draftKey(email));
    return raw ? (JSON.parse(raw) as DraftData) : null;
  } catch { return null; }
}

function clearDraft(email: string) {
  try { localStorage.removeItem(draftKey(email)); } catch { /* ignore */ }
}

interface FormData {
  pageType: PageType;
  email: string;
  phone: string;
  firmName: string;
  fullName: string;
  cityAndState: string;
  linkedIn: string;
  yearsOfExperience: string;
  dbaName: string;
  financialTopics: string[];
  photo: File | null;
  currentBio: string;
  howBecameAdvisor: string;
  clientTypes: string;
  areasOfExpertise: string;
  strategies: string;
  uniqueApproach: string;
  favoritePartWorking: string;
  likesAboutSavvy: string;
  designations: string;
}

type Errors = Partial<Record<string, string>>;

// ─── Page type config ─────────────────────────────────────────────────────────

const PAGE_TYPE_OPTIONS: { value: PageType; label: string; helper?: string }[] = [
  { value: 'solo_savvy', label: 'Solo Advisor — Savvy Brand' },
  { value: 'solo_dba', label: 'Solo Advisor — DBA Brand', helper: 'You operate under your own brand name' },
  { value: 'multi_savvy', label: 'Multi-Advisor Team — Savvy Brand' },
  { value: 'multi_dba', label: 'Multi-Advisor Team — DBA Brand' },
];

function isDbaPageType(pt: PageType) {
  return pt === 'solo_dba' || pt === 'multi_dba';
}

// ─── Step configs ─────────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, label: 'Basic Info' },
  { number: 2, label: 'Topics' },
  { number: 3, label: 'Photo' },
  { number: 4, label: 'Bio & FAQ' },
  { number: 5, label: 'Review' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed && !/^https?:\/\//i.test(trimmed)) return 'https://' + trimmed;
  return trimmed;
}

function isValidUrl(url: string) {
  try { new URL(normalizeUrl(url)); return true; } catch { return false; }
}

function isImageFile(file: File) {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type);
}

async function compressImage(file: File, maxSizeKB = 800): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const MAX_DIM = 1200;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      let quality = 0.85;
      const tryCompress = () => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          if (blob.size / 1024 <= maxSizeKB || quality <= 0.4) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            quality -= 0.1;
            tryCompress();
          }
        }, 'image/jpeg', quality);
      };
      tryCompress();
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

// ─── Design tokens ────────────────────────────────────────────────────────────
// Savvy green = #175242  |  gold = #8E7E57  |  vanilla = #FFF8F1

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gray-400 mb-3">
      {children}
    </p>
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  ...rest
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  [key: string]: unknown;
}) {
  return (
    <div>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full px-4 py-3 rounded-lg border text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all ${
          error ? 'border-red-400' : 'border-gray-200'
        }`}
        {...rest}
      />
      {error && <p className="text-xs text-red-500 mt-1.5 pl-1">{error}</p>}
    </div>
  );
}

function FloatInput({
  value,
  onChange,
  label,
  type = 'text',
  error,
  required,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
  type?: string;
  error?: string;
  required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || value.length > 0;
  return (
    <div>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`w-full px-4 pt-6 pb-2 rounded-lg border text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all peer ${
            error ? 'border-red-400' : 'border-gray-200'
          }`}
        />
        <label className={`absolute left-4 transition-all duration-150 pointer-events-none ${
          lifted
            ? 'top-2 text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400'
            : 'top-4 text-sm text-gray-400'
        }`}>
          {label}{required && ' *'}
        </label>
      </div>
      {error && <p className="text-xs text-red-500 mt-1.5 pl-1">{error}</p>}
    </div>
  );
}

function ComplianceWarning({ text }: { text: string }) {
  const terms = checkCompliance(text);
  if (terms.length === 0) return null;
  return (
    <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
      Please avoid: <strong>{terms.join(', ')}</strong>
    </div>
  );
}

// ─── Speech-to-text hook ──────────────────────────────────────────────────────

function useSpeechInput(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SR = (typeof window !== 'undefined')
      ? (window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition)
      : null;
    if (!SR) { setSupported(false); return; }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (e) => {
      let final = '';
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else live += t;
      }
      if (final) onTranscript(final);
      setInterim(live);
    };

    rec.onerror = () => { setRecording(false); setInterim(''); };
    rec.onend = () => { setRecording(false); setInterim(''); };

    recognitionRef.current = rec;
  }, [onTranscript]);

  const toggle = () => {
    if (!recognitionRef.current) return;
    if (recording) {
      recognitionRef.current.stop();
    } else {
      setInterim('');
      recognitionRef.current.start();
      setRecording(true);
    }
  };

  return { recording, interim, supported, toggle };
}

// ─── Mic button + textarea combo ─────────────────────────────────────────────

function FloatTextarea({
  value,
  onChange,
  label,
  rows = 4,
  error,
  required,
  showCompliance,
  showMic = false,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  label: string;
  placeholder?: string;
  rows?: number;
  error?: string;
  required?: boolean;
  showCompliance?: boolean;
  showMic?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || value.length > 0;

  // Append transcribed text to existing value
  const handleTranscript = React.useCallback((text: string) => {
    const synthetic = {
      target: { value: (value ? value + ' ' : '') + text.trim() },
    } as React.ChangeEvent<HTMLTextAreaElement>;
    onChange(synthetic);
  }, [value, onChange]);

  const { recording, interim, supported, toggle } = useSpeechInput(handleTranscript);

  return (
    <div>
      <div className="relative">
        <textarea
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={rows}
          className={`w-full px-4 pt-6 pb-2 rounded-lg border text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all resize-none ${
            showMic ? 'pr-12' : ''
          } ${error ? 'border-red-400' : recording ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-200'}`}
        />
        <label className={`absolute left-4 transition-all duration-150 pointer-events-none ${
          lifted
            ? 'top-2 text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400'
            : 'top-4 text-sm text-gray-400'
        }`}>
          {label}{required && ' *'}
        </label>

        {showMic && supported && (
          <button
            type="button"
            onClick={toggle}
            title={recording ? 'Stop recording' : 'Speak your answer'}
            className={`absolute right-3 top-3 p-2 rounded-full transition-all ${
              recording
                ? 'bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse'
                : 'bg-[#175242] text-white hover:bg-[#0f3b2e] shadow-sm'
            }`}
          >
            {recording ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Live interim transcript */}
      {recording && interim && (
        <div className="mt-1.5 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700 italic flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          {interim}
        </div>
      )}
      {recording && !interim && (
        <div className="mt-1.5 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-500 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          Listening… speak your answer
        </div>
      )}

      {showCompliance && <ComplianceWarning text={value} />}
      {error && <p className="text-xs text-red-500 mt-1.5 pl-1">{error}</p>}
    </div>
  );
}

const SIDEBAR_QUOTES = [
  { text: 'Experience Wealth Management, Redefined.', attribution: '' },
  { text: 'We help people make better financial decisions so they can live the life they aspire to live.', attribution: '' },
  { text: 'Savvy puts my best interests first, not theirs.', attribution: '— Stephen K., Odessa, FL' },
  { text: 'Savvy provides personalized guidance rather than boiler plate advice.', attribution: '— David S., Bradenton, FL' },
  { text: 'Modern, human advice.', attribution: '' },
  { text: 'Your full financial picture in one place.', attribution: '' },
  { text: 'We\'re building a world class team of wealth managers and technologists to deliver modern, human advice.', attribution: '' },
];

function SidebarQuote() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % SIDEBAR_QUOTES.length);
        setVisible(true);
      }, 500);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  const quote = SIDEBAR_QUOTES[index];
  return (
    <div className="mt-auto" style={{ opacity: visible ? 1 : 0, transition: 'opacity 500ms ease' }}>
      <p className="text-xs text-gray-500 italic leading-relaxed">
        &ldquo;{quote.text}&rdquo;
      </p>
      {quote.attribution && (
        <p className="text-xs text-gray-400 mt-1 not-italic">{quote.attribution}</p>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-3 border-b border-gray-100 last:border-0">
      <dt className="sm:w-44 shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-800 whitespace-pre-wrap break-words">{value || <span className="text-gray-300 italic">Not provided</span>}</dd>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdvisorForm() {
  const [intro, setIntro] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const [emailGate, setEmailGate] = useState(false);
  const [gateEmail, setGateEmail] = useState('');
  const [gateLoading, setGateLoading] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [draftBanner, setDraftBanner] = useState<{ draft: DraftData } | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string>('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check localStorage on mount
  useEffect(() => {
    try {
      if (localStorage.getItem(LS_KEY)) setAlreadySubmitted(true);
    } catch { /* ignore */ }
  }, []);

  const [form, setForm] = useState<FormData>({
    pageType: 'solo_savvy',
    email: '',
    phone: '',
    firmName: '',
    fullName: '',
    cityAndState: '',
    linkedIn: '',
    yearsOfExperience: '',
    dbaName: '',
    financialTopics: [],
    photo: null,
    currentBio: '',
    howBecameAdvisor: '',
    clientTypes: '',
    areasOfExpertise: '',
    strategies: '',
    uniqueApproach: '',
    favoritePartWorking: '',
    likesAboutSavvy: '',
    designations: '',
  });

  // Auto-save draft whenever form changes (debounced 1.5s), keyed by email
  useEffect(() => {
    if (!form.email.trim()) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveDraft(form.email, form);
      setDraftSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const applyDraft = (draft: DraftData) => {
    const { savedAt: _savedAt, ...fields } = draft;
    setForm((prev) => ({ ...prev, ...fields }));
    setDraftBanner(null);
  };

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const setVal = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handlePageTypeChange = (pt: PageType) => {
    setForm((prev) => ({ ...prev, pageType: pt }));
    setErrors((prev) => ({ ...prev, pageType: undefined }));
  };

  // ── Gate submit ─────────────────────────────────────────────────────────────

  const handleGateSubmit = async () => {
    if (!gateEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gateEmail)) return;
    setGateLoading(true);
    try {
      const draft = loadDraft(gateEmail);
      setForm((prev) => ({ ...prev, email: gateEmail }));
      if (draft) {
        const { savedAt: _s, ...fields } = draft;
        setForm((prev) => ({ ...prev, ...fields, email: gateEmail }));
      }
      setEmailGate(false);
    } finally {
      setGateLoading(false);
    }
  };

  // ── Validation ──────────────────────────────────────────────────────────────

  const validateStep1 = (): boolean => {
    const e: Errors = {};
    if (!form.email.trim()) {
      e.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Please enter a valid email address.';
    }
    if (!form.fullName.trim()) e.fullName = 'Full name is required.';
    if (!form.cityAndState.trim()) e.cityAndState = 'City and state is required.';
    if (!form.linkedIn.trim()) {
      e.linkedIn = 'LinkedIn URL is required.';
    } else if (!isValidUrl(normalizeUrl(form.linkedIn))) {
      e.linkedIn = 'Please enter a valid URL.';
    }
    if (!form.yearsOfExperience.trim()) e.yearsOfExperience = 'Years of experience is required.';
    if (isDbaPageType(form.pageType) && !form.firmName.trim()) e.firmName = 'Firm / Brand Name is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = (): boolean => {
    const e: Errors = {};
    const count = form.financialTopics.length;
    if (count < 3 || count > 4) e.financialTopics = `Please select exactly 3 or 4 topics (currently ${count} selected).`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = (): boolean => {
    const e: Errors = {};
    if (!form.photo) e.photo = 'A photo is required.';
    else if (!isImageFile(form.photo)) e.photo = 'File must be an image (JPG, PNG, GIF, or WebP).';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep4 = (): boolean => {
    const e: Errors = {};
    const textFields: Array<[keyof FormData, string]> = [
      ['currentBio', 'Current bio is required.'],
      ['howBecameAdvisor', 'This field is required.'],
      ['clientTypes', 'This field is required.'],
      ['areasOfExpertise', 'This field is required.'],
      ['strategies', 'This field is required.'],
      ['uniqueApproach', 'This field is required.'],
      ['favoritePartWorking', 'This field is required.'],
      ['likesAboutSavvy', 'This field is required.'],
      ['designations', 'This field is required.'],
    ];
    textFields.forEach(([field, msg]) => {
      const val = form[field];
      if (typeof val === 'string' && !val.trim()) e[field] = msg;
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const advance = () => {
    let valid = false;
    if (step === 1) valid = validateStep1();
    else if (step === 2) valid = validateStep2();
    else if (step === 3) valid = validateStep3();
    else if (step === 4) valid = validateStep4();
    else valid = true;
    if (valid) setStep((s) => s + 1);
  };

  const back = () => setStep((s) => s - 1);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const fd = new FormData();
      fd.append('pageType', form.pageType);
      fd.append('email', form.email);
      fd.append('phone', form.phone);
      fd.append('firmName', form.firmName);
      fd.append('fullName', form.fullName);
      fd.append('cityAndState', form.cityAndState);
      fd.append('linkedIn', normalizeUrl(form.linkedIn));
      fd.append('yearsOfExperience', form.yearsOfExperience);
      fd.append('dbaName', form.firmName);
      fd.append('financialTopics', JSON.stringify(form.financialTopics));
      fd.append('currentBio', form.currentBio);
      fd.append('howBecameAdvisor', form.howBecameAdvisor);
      fd.append('clientTypes', form.clientTypes);
      fd.append('areasOfExpertise', form.areasOfExpertise);
      fd.append('strategies', form.strategies);
      fd.append('uniqueApproach', form.uniqueApproach);
      fd.append('favoritePartWorking', form.favoritePartWorking);
      fd.append('likesAboutSavvy', form.likesAboutSavvy);
      fd.append('designations', form.designations);
      if (form.photo) {
        const compressed = await compressImage(form.photo);
        fd.append('photo', compressed);
      }
      const res = await fetch('/api/submit', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Submission failed.');
      try { localStorage.setItem(LS_KEY, form.email || form.fullName); } catch { /* ignore */ }
      clearDraft(form.email);
      setSubmitted(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };


  // ── Already submitted screen ────────────────────────────────────────────────

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4 py-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/form-bg.jpg" alt="" aria-hidden="true" className="fixed inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center', filter: 'blur(8px)', transform: 'scale(1.1)', transformOrigin: 'center' }} />
        <div className="fixed inset-0 bg-black/25" />
        <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-12 max-w-md w-full text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/savvy-logo-black.svg" alt="Savvy" className="h-7 mx-auto mb-8 opacity-60" />
          <h2 className="text-[2rem] font-serif font-light tracking-[-0.03em] text-gray-900 leading-tight mb-3">
            Already submitted.
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            The Savvy team is working on your page and will be in touch soon.
          </p>
          <button
            type="button"
            onClick={() => { setAlreadySubmitted(false); setEmailGate(true); }}
            className="w-full py-3.5 rounded-[3px] text-sm font-medium tracking-[0.06em] uppercase transition-all duration-200 mb-4"
            style={{ backgroundColor: '#C9A84C', color: '#0A1628' }}
          >
            Edit My Submission →
          </button>
          <p className="text-xs text-gray-400 italic">Or reach out to your Savvy contact directly with any urgent changes.</p>
        </div>
      </div>
    );
  }

  // ── Email gate screen ───────────────────────────────────────────────────────

  if (emailGate && !submitted) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4 py-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/form-bg.jpg" alt="" aria-hidden="true" className="fixed inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center', filter: 'blur(8px)', transform: 'scale(1.1)', transformOrigin: 'center' }} />
        <div className="fixed inset-0 bg-black/35" />
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-12 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/savvy-logo-black.svg" alt="Savvy" className="h-7 mx-auto mb-8 opacity-70" />
            <p className="text-[10px] font-medium tracking-[0.16em] uppercase text-gray-400 mb-3">Let&apos;s Get Started</p>
            <h2 className="text-[1.75rem] font-serif font-light tracking-[-0.03em] text-gray-900 leading-tight mb-3">
              Enter your email to begin.
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-8">
              Enter your email and we&apos;ll pull up your profile to get you started.
            </p>
            <div className="space-y-4">
              <input
                type="email"
                value={gateEmail}
                onChange={(e) => setGateEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGateSubmit(); }}
                placeholder="Enter your email address"
                className="w-full px-4 py-3.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all"
              />
              <button
                type="button"
                onClick={handleGateSubmit}
                disabled={gateLoading || !gateEmail.trim()}
                className="w-full py-3.5 rounded-[3px] text-sm font-medium tracking-[0.06em] uppercase transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#C9A84C', color: '#0A1628' }}
              >
                {gateLoading ? 'Looking up your profile…' : 'Get Started →'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-5">Takes about 10 minutes · Progress saves automatically</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4 py-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/form-bg.jpg" alt="" aria-hidden="true" className="fixed inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'center', filter: 'blur(5px)', transform: 'scale(1.1)', transformOrigin: 'center' }} />
        <div className="fixed inset-0 bg-black/40" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-xl w-full px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/savvy-logo-white.svg" alt="Savvy" className="h-8 mb-16 opacity-90" />

          <h1 className="text-[3.25rem] sm:text-[4rem] font-serif font-light tracking-[-0.04em] text-white leading-[1.05] mb-6">
            Thank you,<br />{form.fullName.split(' ')[0] || 'there'}!
          </h1>

          <p className="text-white/70 text-base sm:text-lg font-light leading-relaxed max-w-lg mb-4">
            We&apos;re so excited to bring your page to life. Your Client Marketing Associate will be in touch with the first draft as soon as it&apos;s ready.
          </p>

          <p className="text-white/40 text-xs tracking-wide mt-8">Experience Wealth Management, Redefined.</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-12">
      {/* Single shared background — never reloads, stays fixed throughout */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/form-bg.jpg" alt="" aria-hidden="true"
        className="fixed inset-0 w-full h-full"
        style={{ objectFit: 'cover', objectPosition: 'center', filter: 'blur(8px)', transform: 'scale(1.1)', transformOrigin: 'center' }}
      />
      <div className="fixed inset-0" style={{ backgroundColor: intro || introFading ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.25)', transition: 'background-color 1200ms ease' }} />

      {/* ── Intro overlay — transparent, form card hidden behind it ── */}
      {(intro || introFading) && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-6"
          style={{ opacity: introFading ? 0 : 1, transition: 'opacity 1200ms ease', pointerEvents: introFading ? 'none' : 'auto' }}
          onTransitionEnd={() => {
            if (introFading) {
              const draft = loadDraft(gateEmail);
              setForm((prev) => ({ ...prev, email: gateEmail, ...(draft ? (({ savedAt: _s, ...f }) => f)(draft) : {}) }));
              setIntro(false);
              setIntroFading(false);
            }
          }}
        >

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/savvy-logo-white.svg" alt="Savvy" className="h-8 mb-16 opacity-90" />

          <h1 className="text-[3.25rem] sm:text-[4rem] font-serif font-extralight tracking-[-0.04em] text-white leading-[1.05] mb-6">
            Help us build<br />your page.
          </h1>

          <p className="text-white/70 text-base sm:text-lg font-light leading-relaxed max-w-lg mb-10">
            Share your story, expertise, and approach — we&apos;ll take it from here and build your advisor page on savvywealth.com.
          </p>

          <ul className="flex flex-col sm:flex-row gap-4 sm:gap-8 mb-8 text-sm text-white/60">
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#C7BCA1] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              Continuously updated
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#C7BCA1] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              Optimized for SEO &amp; GEO
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#C7BCA1] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              Grows your digital presence
            </li>
          </ul>

          {/* Email + CTA combined */}
          <div className="w-full max-w-sm flex flex-col gap-3">
            <input
              type="email"
              value={gateEmail}
              onChange={(e) => setGateEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && gateEmail.trim()) { setIntroFading(true); } }}
              placeholder="Enter your email address"
              className="w-full px-4 py-3.5 rounded-[3px] text-sm text-gray-800 placeholder-gray-400 bg-white/95 border-0 focus:outline-none focus:ring-2 focus:ring-white/40"
            />
            <button
              type="button"
              onClick={() => { if (gateEmail.trim()) setIntroFading(true); }}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => setBtnHover(false)}
              disabled={!gateEmail.trim()}
              className="w-full py-3.5 rounded-[3px] text-sm font-medium tracking-[0.06em] uppercase border-0 transition-all duration-200"
              style={{
                backgroundColor: !gateEmail.trim() ? 'rgba(255,255,255,0.15)' : btnHover ? '#b8923d' : '#C9A84C',
                color: 'white',
                border: !gateEmail.trim() ? '1px solid rgba(255,255,255,0.3)' : 'none',
              }}
            >
              Let&apos;s Begin
            </button>
          </div>

          <p className="mt-4 text-white/40 text-xs tracking-wide">Takes about 10 minutes · Progress saves automatically</p>
        </div>
      )}

      <div
        className="relative z-10 w-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden flex min-h-[600px]"
        style={{ opacity: intro ? 0 : 1, transition: introFading ? 'opacity 1200ms ease' : 'none' }}
      >

        {/* ── Left Sidebar ── */}
        <aside className="hidden md:flex flex-col w-72 shrink-0 bg-[#f9f4ee] border-r border-[#e8ddd0] p-10">
          {/* Logo */}
          <div className="mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/savvy-logo-black.svg" alt="Savvy" className="h-7" />
          </div>

          <h2 className="text-xl font-serif font-light tracking-[-0.02em] text-gray-900 mb-8 leading-tight">
            Advisor<br />Intake Form
          </h2>

          {/* Step nav */}
          <nav className="flex-1">
            {STEPS.map((s, i) => {
              const done = s.number < step;
              const active = s.number === step;
              return (
                <div key={s.number} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                      done
                        ? 'bg-[#175242] border-[#175242] text-white'
                        : active
                        ? 'bg-[#175242] border-[#175242] text-white'
                        : 'bg-white border-gray-300 text-gray-400'
                    }`}>
                      {done ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : s.number}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`w-px h-8 mt-0.5 transition-colors ${done ? 'bg-[#175242]' : 'bg-gray-200'}`} />
                    )}
                  </div>
                  <div className="pt-1 pb-8">
                    <span className={`text-sm font-medium transition-colors ${
                      active ? 'text-[#175242]' : done ? 'text-gray-600' : 'text-gray-400'
                    }`}>{s.label}</span>
                  </div>
                </div>
              );
            })}
          </nav>

          <SidebarQuote />
        </aside>

        {/* ── Right Panel ── */}
        <div className="flex-1 flex flex-col">

          {/* Mobile header */}
          <div className="md:hidden flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/savvy-logo-black.svg" alt="Savvy" className="h-6" />
            <span className="text-xs text-gray-400">Step {step} of {STEPS.length} — {STEPS[step - 1].label}</span>
          </div>
          {/* Mobile progress */}
          <div className="md:hidden px-6 pt-3 pb-1">
            <div className="h-1 bg-gray-100 rounded-full">
              <div
                className="h-1 bg-[#175242] rounded-full transition-all duration-500"
                style={{ width: `${(step / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Content — pt matches sidebar logo height (h-7 = 28px) + p-10 top so headings align */}
          <div className="flex-1 px-8 md:px-10 pt-[46px] pb-8 md:pb-10 overflow-y-auto">
            {step === 1 && (
              <StepBasicInfo form={form} errors={errors} set={set} setVal={setVal} onPageTypeChange={handlePageTypeChange} draftBanner={draftBanner} onApplyDraft={applyDraft} onDiscardDraft={() => { clearDraft(form.email); setDraftBanner(null); }} onEmailChange={(val) => { if (!val) { setDraftBanner(null); return; } const draft = loadDraft(val); if (draft) setDraftBanner({ draft }); else setDraftBanner(null); }} />
            )}
            {step === 2 && (
              <StepTopics form={form} errors={errors} setVal={setVal} />
            )}
            {step === 3 && (
              <StepPhoto form={form} errors={errors} photoInputRef={photoInputRef} setVal={setVal} />
            )}
            {step === 4 && (
              <StepBioFaq form={form} errors={errors} set={set} />
            )}
            {step === 5 && (
              <StepReview form={form} />
            )}
          </div>

          {/* Auto-save indicator */}
          {draftSavedAt && form.email && (
            <div className="px-8 md:px-10 py-1.5 flex items-center gap-1.5 bg-gray-50 border-t border-gray-100">
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              <span className="text-xs text-gray-400">Draft saved</span>
            </div>
          )}

          {/* Navigation footer */}
          <div className="px-8 md:px-10 py-5 border-t border-gray-100 flex items-center justify-between gap-4 bg-white">
            {step > 1 ? (
              <button
                type="button"
                onClick={back}
                className="text-sm font-medium tracking-[0.02em] text-gray-400 hover:text-black transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
                Back
              </button>
            ) : (
              <div />
            )}

            {step < 5 ? (
              <button
                type="button"
                onClick={advance}
                className="px-7 py-2.5 rounded-[3px] text-sm font-medium tracking-[0.02em] text-white bg-black border border-black hover:bg-transparent hover:text-black transition-all duration-200 flex items-center gap-1.5"
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            ) : (
              <div className="flex flex-col items-end gap-2">
                {submitError && <p className="text-sm text-red-500">{submitError}</p>}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-7 py-2.5 rounded-[3px] text-sm font-medium tracking-[0.02em] text-white bg-black border border-black hover:bg-transparent hover:text-black transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  )}
                  {submitting ? 'Submitting…' : 'Submit Profile'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Basic Info ───────────────────────────────────────────────────────

function StepBasicInfo({
  form, errors, set, setVal: _setVal, onPageTypeChange, draftBanner, onApplyDraft, onDiscardDraft, onEmailChange,
}: {
  form: FormData;
  errors: Errors;
  set: (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setVal: <K extends keyof FormData>(field: K, value: FormData[K]) => void;
  onPageTypeChange: (pt: PageType) => void;
  draftBanner: { draft: DraftData } | null;
  onApplyDraft: (draft: DraftData) => void;
  onDiscardDraft: () => void;
  onEmailChange: (val: string) => void;
}) {
  return (
    <div className="max-w-xl">
      <h2 className="text-[2rem] font-serif font-light tracking-[-0.03em] text-gray-900 leading-tight mb-1">Your Details</h2>
      <p className="text-sm text-gray-500 mb-8">Tell us about yourself so we can build your advisor page.</p>

      <div className="space-y-7">
        {/* Business type */}
        <div>
          <SectionLabel>Your Page Type</SectionLabel>
          <div className="space-y-1">
            {PAGE_TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                onClick={() => onPageTypeChange(opt.value)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                  form.pageType === opt.value
                    ? 'border-black bg-black/[0.03]'
                    : 'border-gray-200 hover:border-gray-400 bg-white'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  form.pageType === opt.value ? 'border-black' : 'border-gray-300'
                }`}>
                  {form.pageType === opt.value && <div className="w-2 h-2 rounded-full bg-black" />}
                </div>
                <div>
                  <span className={`text-sm font-medium ${form.pageType === opt.value ? 'text-black' : 'text-gray-600'}`}>
                    {opt.label}
                  </span>
                  {opt.helper && <p className="text-xs text-gray-400 mt-0.5">{opt.helper}</p>}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Personal details */}
        <div>
          <SectionLabel>Personal Information</SectionLabel>
          <FieldGroup>
            <FloatInput
              label="Email Address"
              value={form.email}
              onChange={(e) => {
                set('email')(e);
                const val = e.target.value.trim();
                if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) onEmailChange(val);
                else onEmailChange('');
              }}
              type="email"
              error={errors.email}
              required
            />
            {draftBanner && (
              <div className="rounded-[3px] border border-[#175242]/30 bg-[#175242]/5 px-4 py-3 flex items-start gap-3">
                <svg className="shrink-0 mt-0.5 text-[#175242]" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#175242]">Saved draft found</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Last saved {new Date(draftBanner.draft.savedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(draftBanner.draft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Your photo will need to be re-uploaded.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onApplyDraft(draftBanner.draft)}
                    className="text-xs font-medium px-3 py-1.5 rounded-[3px] bg-[#175242] text-white hover:bg-[#0f3b2e] transition-colors"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={onDiscardDraft}
                    className="text-xs font-medium px-3 py-1.5 rounded-[3px] border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
            <FloatInput label="Phone Number" value={form.phone} onChange={set('phone')} type="tel" />
            <FloatInput label="Full Name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} required />
            <div className="grid grid-cols-2 gap-3">
              <FloatInput label="City, State" value={form.cityAndState} onChange={set('cityAndState')} error={errors.cityAndState} required />
              <FloatInput label="Years of Experience" value={form.yearsOfExperience} onChange={set('yearsOfExperience')} error={errors.yearsOfExperience} required />
            </div>
            <FloatInput label="LinkedIn URL" value={form.linkedIn} onChange={set('linkedIn')} type="url" error={errors.linkedIn} required />
            {isDbaPageType(form.pageType) && (
              <FloatInput label="Firm / Brand Name" value={form.firmName} onChange={set('firmName')} error={errors.firmName} required />
            )}
          </FieldGroup>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Topics ───────────────────────────────────────────────────────────

function StepTopics({
  form, errors, setVal,
}: {
  form: FormData;
  errors: Errors;
  setVal: <K extends keyof FormData>(field: K, value: FormData[K]) => void;
}) {
  return (
    <div>
      <h2 className="text-[2rem] font-serif font-light tracking-[-0.03em] text-gray-900 leading-tight mb-1">Financial Topics</h2>
      <p className="text-sm text-gray-500 mb-8">Select 3 or 4 topics that best represent your advisory practice.</p>
      <TopicsCheckbox
        selected={form.financialTopics}
        onChange={(topics) => setVal('financialTopics', topics)}
        error={errors.financialTopics}
      />
    </div>
  );
}

// ─── Step 3: Photo ────────────────────────────────────────────────────────────

function StepPhoto({
  form, errors, photoInputRef, setVal,
}: {
  form: FormData;
  errors: Errors;
  photoInputRef: React.RefObject<HTMLInputElement>;
  setVal: <K extends keyof FormData>(field: K, value: FormData[K]) => void;
}) {
  const previewUrl = form.photo ? URL.createObjectURL(form.photo) : null;
  return (
    <div className="max-w-xl">
      <h2 className="text-[2rem] font-serif font-light tracking-[-0.03em] text-gray-900 leading-tight mb-1">Profile Photo</h2>
      <p className="text-sm text-gray-500 mb-8">Upload a professional headshot for your advisor page.</p>

      <button
        type="button"
        onClick={() => photoInputRef.current?.click()}
        className={`w-full rounded-xl border-2 border-dashed py-10 flex flex-col items-center gap-3 transition-all ${
          errors.photo ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-[#175242] hover:bg-[#175242]/5'
        }`}
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Preview" className="w-32 h-32 rounded-lg object-cover shadow-md" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">{form.photo?.name}</p>
              <p className="text-xs text-gray-400 mt-1">Click to change</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">Click to upload a photo</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, GIF, or WebP</p>
            </div>
          </>
        )}
      </button>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => setVal('photo', e.target.files?.[0] ?? null)}
      />
      {errors.photo && <p className="mt-2 text-sm text-red-500">{errors.photo}</p>}
    </div>
  );
}

// ─── Step 4: Bio & FAQ ────────────────────────────────────────────────────────

const FAQ_FIELDS: Array<{ key: keyof FormData; question: string; placeholder: string }> = [
  { key: 'howBecameAdvisor', question: 'How did you become a financial advisor?', placeholder: 'Share your journey into financial advising…' },
  { key: 'clientTypes', question: 'What types of clients do you work with?', placeholder: 'Describe the clients you typically serve…' },
  { key: 'areasOfExpertise', question: 'What areas of expertise do you have?', placeholder: 'Describe your specializations…' },
  { key: 'strategies', question: 'What strategies do you usually help clients with?', placeholder: 'Describe the strategies you most commonly use…' },
  { key: 'uniqueApproach', question: 'Is there a unique approach that sets you apart?', placeholder: 'What makes your advisory style different?' },
  { key: 'favoritePartWorking', question: 'What is your favorite part about working with clients?', placeholder: 'What do you enjoy most about your work?' },
  { key: 'likesAboutSavvy', question: 'What do you like about working with Savvy?', placeholder: 'Share what you value about the Savvy platform…' },
  { key: 'designations', question: 'Do you have any designations or organizations you are a part of?', placeholder: 'e.g. CFP®, CFA, NAPFA member…' },
];

function StepBioFaq({
  form, errors, set,
}: {
  form: FormData;
  errors: Errors;
  set: (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-[2rem] font-serif font-light tracking-[-0.03em] text-gray-900 leading-tight mb-1">Bio &amp; FAQ</h2>
      <p className="text-sm text-gray-500 mb-5">These answers will be used to write your advisor page. Write naturally in your own voice.</p>

      {/* Speech-to-text feature highlight */}
      <div className="rounded-xl bg-[#175242] px-7 py-6 mb-8 flex items-center gap-6">
        <div className="shrink-0 w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
          </svg>
        </div>
        <div>
          <p className="text-white font-medium text-base mb-1">Don&apos;t want to write? Just talk.</p>
          <p className="text-white/70 text-sm leading-relaxed">
            Hit the mic on any field and speak naturally — like someone is interviewing you. We&apos;ll handle the writing.
          </p>
        </div>
      </div>

      <div className="space-y-8">
        <div>
          <SectionLabel>Your Bio</SectionLabel>
          <FloatTextarea
            label="Current Bio"
            value={form.currentBio}
            onChange={set('currentBio')}
            rows={5}
            error={errors.currentBio}
            required
            showCompliance
            showMic
          />
          <p className="text-xs text-gray-400 mt-1.5 pl-1">This will appear in the hero section of your advisor page.</p>
        </div>

        <div>
          <SectionLabel>FAQ Questions</SectionLabel>
          <div className="space-y-5">
            {FAQ_FIELDS.map(({ key, question, placeholder }) => (
              <FloatTextarea
                key={key}
                label={question}
                value={form[key] as string}
                onChange={set(key)}
                placeholder={placeholder}
                rows={3}
                error={errors[key]}
                required
                showCompliance
                showMic
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Topic icon map (mirrors TopicsCheckbox) ─────────────────────────────────

const TOPIC_ICONS_MAP: Record<string, string> = {
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

// ─── Step 5: Review ───────────────────────────────────────────────────────────

function StepReview({ form }: { form: FormData }) {
  const photoUrl = form.photo ? URL.createObjectURL(form.photo) : null;
  const firstName = form.fullName.split(' ')[0] || 'your';

  return (
    <div className="max-w-3xl">
      <h2 className="text-[2rem] font-serif font-light tracking-[-0.03em] text-gray-900 leading-tight mb-1">Almost there.</h2>
      <p className="text-sm text-gray-500 mb-6">Take a moment to review before we build your page.</p>

      {/* ── Page mockup preview ── */}
      <div className="mb-8">
        <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gray-400 mb-3">Your Page Preview</p>

        {/* Load Cormorant Garamond for the mockup */}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&display=swap');`}</style>

        {/* Laptop device frame */}
        <div className="relative">
          <div className="shadow-2xl" style={{ borderRadius: '12px 12px 0 0', background: '#1c1c1e', padding: '10px 10px 0' }}>
            {/* Camera notch */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3a3a3c' }} />
            </div>
            {/* Screen */}
            <div style={{ borderRadius: '4px 4px 0 0', overflow: 'hidden', background: 'white', height: '460px', overflowY: 'auto', fontFamily: "'Jost', sans-serif" }}>

              {/* Nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: 'white', zIndex: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/savvy-logo-black.svg" alt="Savvy" style={{ height: '14px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {['For Clients','For Advisors','Our Services','About'].map(l => (
                    <span key={l} style={{ fontSize: '7px', color: '#666' }}>{l}</span>
                  ))}
                  <span style={{ fontSize: '7px', padding: '4px 10px', background: 'black', color: 'white', borderRadius: '4px', fontWeight: 500 }}>Find an Advisor</span>
                </div>
              </div>

              {/* Hero */}
              <div style={{ display: 'flex', gap: '28px', padding: '24px 28px 20px', background: 'white' }}>
                {/* Left */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '28px', fontWeight: 300, color: '#111', margin: '0 0 10px', lineHeight: 1.1 }}>
                    {form.fullName || 'Your Name'}
                  </h1>
                  <p style={{ fontSize: '8.5px', color: '#444', lineHeight: 1.6, marginBottom: '12px', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {form.currentBio || 'Your bio will appear here...'}
                  </p>
                  {form.fullName && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '7.5px', fontWeight: 600, color: '#111', marginBottom: '4px', letterSpacing: '0.05em' }}>
                        {form.fullName.split(' ')[0].toUpperCase()}&apos;S TEAM:
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {['Savvy Investment Team'].map(t => (
                          <span key={t} style={{ fontSize: '7px', color: '#555' }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <span style={{ fontSize: '7.5px', padding: '5px 12px', background: 'black', color: 'white', borderRadius: '4px', fontWeight: 500 }}>Schedule a call today</span>
                    <span style={{ fontSize: '7.5px', padding: '5px 12px', border: '1px solid black', color: 'black', borderRadius: '4px', fontWeight: 500 }}>Send an email</span>
                  </div>
                </div>

                {/* Right: photo card */}
                <div style={{ width: '140px', flexShrink: 0 }}>
                  <div style={{ position: 'relative' }}>
                    {/* Background offset card */}
                    <div style={{ position: 'absolute', top: '8px', right: '-6px', width: '100%', height: '155px', background: '#e8e8e4', borderRadius: '0 0 0 60px', zIndex: 0 }} />
                    {/* Photo */}
                    <div style={{ position: 'relative', zIndex: 1, borderRadius: '0 0 0 60px', overflow: 'hidden', width: '130px', height: '148px', background: '#d0d0cc' }}>
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoUrl} alt={form.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg style={{ width: '32px', height: '32px', color: '#aaa' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Location + LinkedIn */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', paddingLeft: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg style={{ width: '10px', height: '10px', color: '#888', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      <span style={{ fontSize: '7px', color: '#666' }}>{form.cityAndState || 'Location'}</span>
                    </div>
                    <svg style={{ width: '12px', height: '12px', color: '#888' }} viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                  </div>
                </div>
              </div>

              {/* How Can I Help */}
              {form.financialTopics.length > 0 && (
                <div style={{ padding: '20px 28px', background: 'white', borderTop: '1px solid #f5f5f5' }}>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '20px', fontWeight: 300, color: '#111', margin: '0 0 14px' }}>How can I help?</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {form.financialTopics.slice(0, 4).map((topic) => (
                      <div key={topic} style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        {TOPIC_ICONS_MAP[topic] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={TOPIC_ICONS_MAP[topic]} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0, marginTop: '1px', filter: 'brightness(0) saturate(100%) invert(52%) sepia(15%) saturate(500%) hue-rotate(15deg) brightness(95%)' }} />
                        )}
                        <span style={{ fontSize: '8px', fontWeight: 500, color: '#222', lineHeight: 1.4 }}>{topic}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Get to Know */}
              <div style={{ padding: '20px 28px', background: '#faf8f5', borderTop: '1px solid #eee' }}>
                <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '20px', fontWeight: 300, color: '#111', margin: '0 0 8px' }}>
                  Get to know {form.fullName.split(' ')[0] || 'your advisor'}
                </h2>
                <p style={{ fontSize: '8px', color: '#555', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {form.currentBio || 'Your bio will appear here...'}
                </p>
              </div>

            </div>
          </div>

          {/* Laptop base */}
          <div style={{ height: '10px', background: '#2c2c2e', borderRadius: '0 0 6px 6px', margin: '0 20px' }} />
          <div style={{ height: '4px', background: '#1c1c1e', borderRadius: '0 0 8px 8px', margin: '0 4px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} />

          <div className="mt-4 text-center space-y-1">
            <p className="text-[11px] text-gray-600 font-medium">This is a mockup, not your final page.</p>
            <p className="text-[10px] text-gray-400">Our designers and writers will review all your information and refine the content before your page goes live on savvywealth.com.</p>
          </div>
        </div>
      </div>

      <div className="space-y-5">

        {/* Profile card */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          {/* Header with photo */}
          <div className="bg-[#175242] px-6 py-5 flex items-center gap-5">
            {form.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={URL.createObjectURL(form.photo)} alt="Profile" className="w-16 h-16 rounded-lg object-cover shadow-md shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                <svg className="w-7 h-7 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              </div>
            )}
            <div>
              <p className="text-white font-medium text-lg leading-tight">{form.fullName || '—'}</p>
              <p className="text-white/60 text-sm mt-0.5">{form.cityAndState || '—'}</p>
              <p className="text-white/50 text-xs mt-1">{form.yearsOfExperience ? `${form.yearsOfExperience} years of experience` : ''}{form.designations ? ` · ${form.designations}` : ''}</p>
            </div>
          </div>

          {/* Details grid */}
          <div className="divide-y divide-gray-50">
            <div className="grid grid-cols-2 divide-x divide-gray-50">
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400 mb-0.5">Email</p>
                <p className="text-sm text-gray-800 truncate">{form.email || '—'}</p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400 mb-0.5">Phone</p>
                <p className="text-sm text-gray-800">{form.phone || <span className="text-gray-300 italic text-xs">Not provided</span>}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-gray-50">
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400 mb-0.5">LinkedIn</p>
                <p className="text-sm text-gray-800 truncate">{form.linkedIn || '—'}</p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400 mb-0.5">Page Type</p>
                <p className="text-sm text-gray-800">{PAGE_TYPE_LABELS[form.pageType]}</p>
              </div>
            </div>
            {isDbaPageType(form.pageType) && (
              <div className="px-5 py-3.5">
                <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400 mb-0.5">Firm / Brand</p>
                <p className="text-sm text-gray-800">{form.firmName || '—'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Topics */}
        <div className="rounded-xl border border-gray-100 px-5 py-4">
          <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400 mb-3">Financial Topics</p>
          <div className="flex flex-wrap gap-2">
            {form.financialTopics.length > 0
              ? form.financialTopics.map((t) => (
                  <span key={t} className="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-[#175242] text-white text-xs font-medium rounded-[3px] tracking-[0.04em]">
                    {TOPIC_ICONS_MAP[t] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={TOPIC_ICONS_MAP[t]} alt="" className="w-4 h-4 object-contain brightness-0 invert" />
                    )}
                    {t}
                  </span>
                ))
              : <span className="text-sm text-gray-300 italic">None selected</span>
            }
          </div>
        </div>

        {/* Bio */}
        <div className="rounded-xl border border-gray-100 px-5 py-4">
          <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400 mb-2">Bio</p>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{form.currentBio || <span className="text-gray-300 italic">Not provided</span>}</p>
        </div>

        {/* FAQ */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400">FAQ</p>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { q: 'How did you become a financial advisor?', v: form.howBecameAdvisor },
              { q: 'What types of clients do you work with?', v: form.clientTypes },
              { q: 'What areas of expertise do you have?', v: form.areasOfExpertise },
              { q: 'What strategies do you help clients with?', v: form.strategies },
              { q: 'What sets you apart?', v: form.uniqueApproach },
              { q: 'Favorite part about working with clients?', v: form.favoritePartWorking },
              { q: 'What do you like about working with Savvy?', v: form.likesAboutSavvy },
            ].map(({ q, v }) => (
              <div key={q} className="px-5 py-3.5">
                <p className="text-xs font-medium text-gray-400 mb-1">{q}</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{v || <span className="text-gray-300 italic">Not provided</span>}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
