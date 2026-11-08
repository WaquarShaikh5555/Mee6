/**
 * Email delivery behind a narrow interface.
 *
 * `console` prints to the log and is the default in development: reset links must
 * be reachable without an email provider. `acs` uses Azure Communication Services
 * Email, which is the production path when deploying to Azure.
 *
 * Nothing in the auth flow awaits delivery: a provider outage must not change the
 * response to "forgot password" (which would leak whether an address exists) and
 * must not fail a request the user cannot retry.
 */

import { createHash, createHmac } from 'node:crypto';

import type { Config } from '../config.js';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailSender {
  readonly kind: 'console' | 'acs';
  send(message: EmailMessage): Promise<void>;
}

export function createEmailSender(config: Config, log: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void }): EmailSender {
  if (config.EMAIL_TRANSPORT === 'acs') {
    return createAcsSender(config, log);
  }

  return {
    kind: 'console',
    async send(message) {
      log.info(
        { to: message.to, subject: message.subject, body: message.text },
        'email (console transport)',
      );
    },
  };
}

/**
 * Azure Communication Services Email over its REST API.
 *
 * The connection string carries the access key. Implemented with `fetch` rather
 * than the SDK to keep the dependency tree small.
 *
 * Signing follows the ACS specification (see docs/BACKEND.md for the source):
 * the string to sign is
 *
 *   POST \n /emails:send?api-version=2023-03-31 \n <date>;<host>;<contentHash>
 *
 * signed with HMAC-SHA256 using the *base64-decoded* access key, and sent as
 *
 *   Authorization: HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=...
 *
 * Note the semicolons between the timestamp, host, and content hash — and that
 * the sender address is part of the body, not the signature.
 */

export const ACS_API_PATH = '/emails:send?api-version=2023-03-31';

export type AcsSignatureInput = {
  /** RFC 1123 timestamp, used verbatim in both the header and the signature. */
  date: string;
  host: string;
  /** Base64-encoded SHA-256 of the exact bytes sent as the body. */
  contentHash: string;
  /** Base64 access key from the ACS connection string. */
  accessKey: string;
};

/** Returns the value of the `Authorization` header for an ACS Email request. */
export function acsAuthorizationHeader(input: AcsSignatureInput): string {
  const stringToSign = `POST\n${ACS_API_PATH}\n${input.date};${input.host};${input.contentHash}`;
  const signature = createHmac('sha256', Buffer.from(input.accessKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');

  return `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`;
}

function createAcsSender(
  config: Config,
  log: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void },
): EmailSender {
  const connectionString = config.ACS_CONNECTION_STRING;
  const sender = config.ACS_SENDER_ADDRESS;

  if (!connectionString || !sender) {
    throw new Error('EMAIL_TRANSPORT=acs requires ACS_CONNECTION_STRING and ACS_SENDER_ADDRESS');
  }

  const endpoint = /endpoint=([^;]+)/i.exec(connectionString)?.[1];
  const accessKey = /accesskey=([^;]+)/i.exec(connectionString)?.[1];
  if (!endpoint || !accessKey) {
    throw new Error('ACS_CONNECTION_STRING is malformed');
  }

  return {
    kind: 'acs',
    async send(message) {
      const body = JSON.stringify({
        senderAddress: sender,
        content: { subject: message.subject, plainText: message.text },
        recipients: { to: [{ address: message.to }] },
      });

      const url = new URL(ACS_API_PATH, endpoint);
      const date = new Date().toUTCString();
      const contentHash = createHash('sha256').update(body, 'utf8').digest('base64');

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ms-date': date,
            'x-ms-content-sha256': contentHash,
            Authorization: acsAuthorizationHeader({
              date,
              host: url.host,
              contentHash,
              accessKey,
            }),
          },
          body,
        });

        if (!response.ok) {
          log.error({ status: response.status, to: message.to }, 'ACS email rejected');
        }
      } catch (error) {
        log.error({ err: error, to: message.to }, 'ACS email failed');
      }
    },
  };
}
