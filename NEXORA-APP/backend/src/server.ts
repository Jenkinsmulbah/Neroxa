import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/database.js';

const server = app.listen(env.PORT, () => console.log(`NEXORA API listening on port ${env.PORT}`));
async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down NEXORA API.`);
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
