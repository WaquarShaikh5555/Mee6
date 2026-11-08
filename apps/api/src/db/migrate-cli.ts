/** CLI: `npm run migrate` — applies pending migrations and exits. */

import { loadConfig } from '../config.js';
import { createDatabase } from './client.js';
import { migrate } from './migrate.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const handle = await createDatabase({
    url: config.DATABASE_URL,
    pglitePath: config.PGLITE_PATH,
    maxConnections: 1,
  });

  try {
    const result = await migrate(handle);
    console.info(`applied: ${result.applied.join(', ') || 'none'}`);
    console.info(`already present: ${result.skipped.length}`);
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
