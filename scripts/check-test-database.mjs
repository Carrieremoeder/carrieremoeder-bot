import { Client } from 'pg';
import { testDatabaseConfig, ISOLATION_SQL } from '../lib/restrictedPurchaseStore.js';

// Deployment smoke check only; no production connection and no writes.
if (process.env.VERCEL_ENV === 'preview' && process.env.BOT_TEST_STORAGE_MODE === 'restricted-postgres') {
  let client;
  try {
    client = new Client(testDatabaseConfig(process.env));
    await client.connect();
    await client.query('begin read only');
    await client.query("set local statement_timeout = '8s'");
    const result = await client.query(ISOLATION_SQL);
    if (result.rows?.length !== 1 || result.rows[0].isolated !== true) throw Object.assign(new Error(), { code: 'ISOLATION_FAILED' });
    await client.query('rollback');
    console.log('Bot test database: connection, TLS and role isolation verified. No data changed.');
  } catch (error) {
    // Never log connection strings, passwords or raw driver messages.
    const codes = new Set(['28P01', '28000', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ISOLATION_FAILED']);
    console.error(`Bot test database: check failed (${codes.has(error.code) ? error.code : 'CONNECTION_OR_CONFIG'}).`);
    process.exitCode = 1;
  } finally {
    if (client) { try { await client.end(); } catch {} }
  }
}
