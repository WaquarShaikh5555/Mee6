/**
 * Authentication business logic.
 *
 * Kept free of HTTP concerns so it can be tested directly and reused from a queue
 * or CLI later. Every method either returns a result or throws an `AppError` whose
 * code is safe to expose.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Config } from '../../config.js';
import type { DatabaseHandle } from '../../db/client.js';
import { passwordResetTokens, sessions, users } from '../../db/schema.js';
import type { EmailSender } from '../../lib/email.js';
import { AppError } from '../../lib/errors.js';
import {
  checkPassword,
  describePasswordProblem,
  fakeVerify,
  hashPassword,
  verifyPassword,
} from '../../lib/password.js';
import { addDays, addMinutes, createToken, hashIp, hashToken } from '../../lib/tokens.js';

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};

export type SessionPayload = {
  token: string;
  user: PublicUser;
  expiresAt: string;
};

type RequestContext = {
  userAgent?: string;
  ip?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(row: {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}

export class AuthService {
  constructor(
    private readonly handle: DatabaseHandle,
    private readonly config: Config,
    private readonly email: EmailSender,
  ) {}

  private get db() {
    return this.handle.db;
  }

  // ------------------------------------------------------------------ signup

  async signUp(
    input: { email: string; password: string; displayName: string },
    context: RequestContext,
  ): Promise<SessionPayload> {
    const email = normaliseEmail(input.email);
    if (!EMAIL_PATTERN.test(email)) {
      throw new AppError('invalid_email', 'That email address does not look right.');
    }

    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 60) {
      throw new AppError('invalid_request', 'Choose a name between 2 and 60 characters.', {
        displayName: 'Between 2 and 60 characters.',
      });
    }

    const problem = checkPassword(input.password);
    if (problem) {
      throw new AppError('weak_password', describePasswordProblem(problem), {
        password: describePasswordProblem(problem),
      });
    }

    const passwordHash = await hashPassword(input.password);

    // Rely on the partial unique index rather than a check-then-insert, which
    // races under concurrent sign-ups.
    try {
      const [row] = await this.db
        .insert(users)
        .values({ email, passwordHash, displayName })
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          createdAt: users.createdAt,
        });

      if (!row) throw new Error('insert returned no row');
      return this.issueSession(row, context);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError('email_in_use', 'An account already uses that email.');
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------- sign in

  async signIn(
    input: { email: string; password: string },
    context: RequestContext,
  ): Promise<SessionPayload> {
    const email = normaliseEmail(input.email);

    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!row) {
      // Equalise timing with the "wrong password" path so the response cannot be
      // used to enumerate accounts.
      await fakeVerify();
      throw new AppError('invalid_credentials', 'Email or password is incorrect.');
    }

    const valid = await verifyPassword(row.passwordHash, input.password);
    if (!valid) {
      throw new AppError('invalid_credentials', 'Email or password is incorrect.');
    }

    return this.issueSession(
      {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        createdAt: row.createdAt,
      },
      context,
    );
  }

  // --------------------------------------------------------------- sessions

  private async issueSession(
    user: { id: string; email: string; displayName: string; createdAt: Date },
    context: RequestContext,
  ): Promise<SessionPayload> {
    const token = createToken();
    const expiresAt = addDays(this.config.SESSION_TTL_DAYS);

    await this.db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: context.userAgent?.slice(0, 300) ?? null,
      ipHash: hashIp(context.ip, this.config.IP_HASH_PEPPER),
    });

    return { token, user: toPublicUser(user), expiresAt: expiresAt.toISOString() };
  }

  /**
   * Resolves a bearer token to a live session. Updates `last_seen_at` for
   * observability but never extends the absolute expiry.
   */
  async authenticate(token: string | undefined): Promise<{
    sessionId: string;
    user: PublicUser;
    expiresAt: Date;
  }> {
    if (!token) throw new AppError('unauthorized', 'Sign in to continue.');

    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, hashToken(token)))
      .limit(1);

    if (!row || row.deletedAt) throw new AppError('unauthorized', 'Sign in to continue.');
    if (row.revokedAt) throw new AppError('unauthorized', 'This session was signed out.');
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new AppError('session_expired', 'Your session expired. Sign in again.');
    }

    void this.db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, row.sessionId))
      .catch(() => {
        // Observability only; never fail a request over it.
      });

    return {
      sessionId: row.sessionId,
      expiresAt: row.expiresAt,
      user: toPublicUser({
        id: row.userId,
        email: row.email,
        displayName: row.displayName,
        createdAt: row.createdAt,
      }),
    };
  }

  async signOut(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  /** Signs out every device — used after a password reset. */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  // --------------------------------------------------------- password reset

  /**
   * Always resolves, whether or not the address exists: the caller returns the
   * same response either way, so this endpoint cannot be used to enumerate
   * accounts. Delivery happens in the background.
   */
  async requestPasswordReset(emailInput: string): Promise<void> {
    const email = normaliseEmail(emailInput);

    const [row] = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!row) {
      // Spend comparable time so the response time does not differ either.
      await fakeVerify();
      return;
    }

    const token = createToken();
    await this.db.insert(passwordResetTokens).values({
      userId: row.id,
      tokenHash: hashToken(token),
      expiresAt: addMinutes(this.config.RESET_TTL_MINUTES),
    });

    const link = `${this.config.APP_PUBLIC_URL}?token=${encodeURIComponent(token)}`;

    void this.email
      .send({
        to: row.email,
        subject: 'Reset your Shaikh’s password',
        text: [
          'Someone asked to reset the password for this address.',
          '',
          `Open this link to choose a new one (valid for ${this.config.RESET_TTL_MINUTES} minutes):`,
          link,
          '',
          'If this was not you, ignore this email — nothing has changed.',
        ].join('\n'),
      })
      .catch(() => {
        // Delivery failures are logged by the sender and never surfaced.
      });
  }

  async resetPassword(input: { token: string; password: string }): Promise<void> {
    const problem = checkPassword(input.password);
    if (problem) {
      throw new AppError('weak_password', describePasswordProblem(problem), {
        password: describePasswordProblem(problem),
      });
    }

    const [reset] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hashToken(input.token)))
      .limit(1);

    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
      throw new AppError('invalid_request', 'That reset link is invalid or has expired.');
    }

    const passwordHash = await hashPassword(input.password);

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, reset.userId));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, reset.id));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, reset.userId), isNull(sessions.revokedAt)));
    });
  }

  // ------------------------------------------------------------------ profile

  async updateProfile(userId: string, input: { displayName: string }): Promise<PublicUser> {
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 60) {
      throw new AppError('invalid_request', 'Choose a name between 2 and 60 characters.', {
        displayName: 'Between 2 and 60 characters.',
      });
    }

    const [row] = await this.db
      .update(users)
      .set({ displayName, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        createdAt: users.createdAt,
      });

    if (!row) throw new AppError('not_found', 'That account no longer exists.');
    return toPublicUser(row);
  }

  /**
   * Account deletion, required by App Store guideline 5.1.1(v) whenever an app
   * lets people create an account.
   *
   * Soft-deletes and revokes every session immediately; a scheduled job purges
   * rows after 30 days. The address becomes available again straight away because
   * the unique index only covers live rows.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const [row] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!row) throw new AppError('not_found', 'That account no longer exists.');

    // Re-authenticate: a stolen phone must not be enough to destroy the account.
    if (!(await verifyPassword(row.passwordHash, password))) {
      throw new AppError('invalid_credentials', 'That password is incorrect.');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    });
  }

  /** Housekeeping, intended for a scheduled job. */
  async purgeExpired(): Promise<{ sessions: number; resets: number }> {
    const deletedSessions = await this.db
      .delete(sessions)
      .where(sql`${sessions.expiresAt} < now() - interval '7 days'`)
      .returning({ id: sessions.id });

    const deletedResets = await this.db
      .delete(passwordResetTokens)
      .where(sql`${passwordResetTokens.expiresAt} < now() - interval '7 days'`)
      .returning({ id: passwordResetTokens.id });

    return { sessions: deletedSessions.length, resets: deletedResets.length };
  }
}

/** PostgreSQL unique violation, regardless of which driver surfaced it. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === '23505' || candidate.cause?.code === '23505';
}
