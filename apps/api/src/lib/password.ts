/**
 * Password hashing with Argon2id.
 *
 * Parameters follow the current OWASP recommendation for Argon2id:
 * 19 MiB of memory, 2 iterations, 1 degree of parallelism. Memory cost is the
 * parameter that actually matters against GPU attack, so it is set explicitly
 * rather than left to the library default.
 */

import { hash, verify } from '@node-rs/argon2';

const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  algorithm: 2, // Argon2id
} as const;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordProblem = 'too-short' | 'too-long' | 'too-simple' | null;

/**
 * Shape rules only. Length is the strongest predictor of real strength, so the
 * floor is a length floor plus a letter/number requirement — not a symbol zoo.
 */
export function checkPassword(password: string): PasswordProblem {
  if (password.length < PASSWORD_MIN_LENGTH) return 'too-short';
  if (password.length > PASSWORD_MAX_LENGTH) return 'too-long';
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) return 'too-simple';
  return null;
}

export function describePasswordProblem(problem: Exclude<PasswordProblem, null>): string {
  switch (problem) {
    case 'too-short':
      return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    case 'too-long':
      return `Keep it under ${PASSWORD_MAX_LENGTH} characters.`;
    case 'too-simple':
      return 'Include at least one letter and one number.';
  }
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/**
 * Verifies a password. Always returns a boolean, never throws for a malformed
 * stored hash — a corrupt row must not turn into a 500 that reveals its existence.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password, OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Burns roughly the same time as a real verification. Called when no account
 * exists, so "unknown email" and "wrong password" cannot be told apart by timing.
 */
export async function fakeVerify(): Promise<void> {
  await verifyPassword(
    '$argon2id$v=19$m=19456,t=2,p=1$c2hhaWtoc2RlbW9zYWx0$0000000000000000000000000000000000000000000',
    'not-the-password',
  );
}
