// Contact-field validation. Keep in sync with backend/server.py
// (MOBILE_RE / EMAIL_RE), which enforces the same rules server-side.

// Indian mobile: 10 digits starting 6-9, optionally prefixed with +91 / 91 / 0.
// Spaces and dashes are ignored, so "+91 98765 43210" is accepted.
const MOBILE_RE = /^(?:\+91|91|0)?[6-9]\d{9}$/;

// name@domain.tld — needs an "@", a period and a 2+ letter top-level domain
// (.com, .in, .co.in, …).
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function isValidMobile(value: string): boolean {
  return MOBILE_RE.test((value || '').replace(/[\s-]/g, ''));
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test((value || '').trim());
}
