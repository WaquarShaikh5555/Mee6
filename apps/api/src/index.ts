/**
 * Process entry point: load config, connect, migrate, listen, and shut down
 * cleanly when the platform asks.
 */

import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { migrate } from './db/migrate.js';
import { createEmailSender } from './lib/email.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const handle = await createDatabase({
    url: config.DATABASE_URL,
    pglitePath: config.PGLITE_PATH,
    maxConnections: config.DB_POOL_MAX,
  });

  // Migrations run at boot so a fresh container is always schema-correct. For
  // larger deployments this becomes a separate job; see docs/BACKEND.md.
  const result = await migrate(handle);
  if (result.applied.length > 0) {
    console.info(`[db] applied migrations: ${result.applied.join(', ')}`);
  }

  const email = createEmailSender(config, {
    info: (obj, msg) => console.info(msg ?? '', obj),
    error: (obj, msg) => console.error(msg ?? '', obj),
  });

  const app = await buildApp({ config, handle, email });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ port: config.PORT, host: config.HOST });
  console.info(
    `[api] listening on http://${config.HOST}:${config.PORT} (db: ${handle.kind}, email: ${email.kind})`,
  );
}

main().catch((error) => {
  console.error('[api] failed to start:', error);
  process.exit(1);
});
