/**
 * ACS Email request signing.
 *
 * The string-to-sign format is easy to get subtly wrong (newlines vs semicolons,
 * raw vs base64-decoded key) and a wrong signature fails only in production, so
 * it is pinned here against an independently computed HMAC.
 */

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ACS_API_PATH, acsAuthorizationHeader } from '../src/lib/email.js';

// A real access key is 44 base64 characters; this one is synthetic.
const ACCESS_KEY = Buffer.from('shaikhs-test-access-key-0123456789').toString('base64');
const DATE = 'Tue, 20 Oct 2026 15:00:00 GMT';
const HOST = 'shaikhs.communication.azure.com';
const CONTENT_HASH = createHmac('sha256', 'x').update('body').digest('base64');

function expectedSignature(): string {
  const stringToSign = `POST\n/emails:send?api-version=2023-03-31\n${DATE};${HOST};${CONTENT_HASH}`;
  return createHmac('sha256', Buffer.from(ACCESS_KEY, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
}

describe('ACS email authentication', () => {
  it('signs the documented string: method, path+query, then date;host;contentHash', () => {
    const header = acsAuthorizationHeader({
      date: DATE,
      host: HOST,
      contentHash: CONTENT_HASH,
      accessKey: ACCESS_KEY,
    });

    expect(header).toBe(
      `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${expectedSignature()}`,
    );
  });

  it('changes when any signed component changes', () => {
    const base = { date: DATE, host: HOST, contentHash: CONTENT_HASH, accessKey: ACCESS_KEY };
    const original = acsAuthorizationHeader(base);

    expect(acsAuthorizationHeader({ ...base, date: 'Tue, 20 Oct 2026 15:00:01 GMT' })).not.toBe(original);
    expect(acsAuthorizationHeader({ ...base, host: 'other.communication.azure.com' })).not.toBe(original);
    expect(acsAuthorizationHeader({ ...base, contentHash: 'not-the-same' })).not.toBe(original);
    expect(acsAuthorizationHeader({ ...base, accessKey: Buffer.from('shaikhs-other-key').toString('base64') })).not.toBe(original);
  });

  it('uses the documented request path', () => {
    expect(ACS_API_PATH).toBe('/emails:send?api-version=2023-03-31');
  });
});
