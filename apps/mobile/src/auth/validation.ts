/**
 * Input validation shared by the forms and the auth service.
 *
 * These are shape checks, not a security boundary: the identity provider is
 * always the authority on whether a credential is valid. Doing it here as well
 * keeps errors instant and keeps malformed data out of the network layer.
 */

export type FieldErrors = Partial<Record<'displayName' | 'email' | 'password' | 'form', string>>;

/**
 * Deliberately loose: `local@domain` with no spaces. Tightening beyond this
 * rejects addresses that are actually valid, and deliverability is proven by
 * the verification email, not by a regex.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_MIN_LENGTH = 8;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(email)) return 'That email address does not look right.';
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (!value) return 'Enter a password.';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Include at least one letter and one number.';
  }
  return undefined;
}

export function validateDisplayName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Tell us what to call you.';
  if (name.length < 2) return 'That name is a little short.';
  if (name.length > 60) return 'Keep it under 60 characters.';
  return undefined;
}

export function validateSignIn(input: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if (!input.password) errors.password = 'Enter your password.';
  return errors;
}

export function validateSignUp(input: {
  displayName: string;
  email: string;
  password: string;
}): FieldErrors {
  const errors = validateSignIn({ email: input.email, password: input.password });
  const name = validateDisplayName(input.displayName);
  if (name) errors.displayName = name;
  const password = validatePassword(input.password);
  if (password) errors.password = password;
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** 0–4, for the strength meter on sign-up. Advisory, not a gate. */
export function passwordStrength(value: string): number {
  if (!value) return 0;
  let score = 0;
  if (value.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (/[0-9]/.test(value) && /[a-zA-Z]/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}
