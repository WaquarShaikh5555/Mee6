/**
 * The signed-in user's own resource.
 *
 * Kept separate from /v1/auth because these are ordinary authenticated endpoints
 * that future features will extend (preferences, devices, exports).
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AppError } from '../../lib/errors.js';
import type { AuthService } from '../auth/service.js';
import { bearerToken } from '../auth/routes.js';

const patchBody = z.object({ displayName: z.string().min(1).max(120) });
const deleteBody = z.object({ password: z.string().min(1).max(1024) });

export function registerMeRoutes(
  app: FastifyInstance,
  deps: { auth: AuthService },
): void {
  app.get('/v1/me', async (request: FastifyRequest) => {
    const { user } = await deps.auth.authenticate(bearerToken(request));
    return { user };
  });

  app.patch('/v1/me', async (request) => {
    const { user } = await deps.auth.authenticate(bearerToken(request));
    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('invalid_request', 'Check the details and try again.', {
        displayName: 'Between 2 and 60 characters.',
      });
    }
    return { user: await deps.auth.updateProfile(user.id, parsed.data) };
  });

  app.delete('/v1/me', async (request, reply) => {
    const { user } = await deps.auth.authenticate(bearerToken(request));
    const parsed = deleteBody.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('invalid_request', 'Enter your password to confirm.');
    }
    await deps.auth.deleteAccount(user.id, parsed.data.password);
    return reply.status(204).send();
  });
}
