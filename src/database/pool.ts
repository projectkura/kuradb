import pg from 'pg';
import {
  assertConnectionString,
  getConnectionPoolOptions,
  KURADB_MINIMUM_POSTGRES_VERSION,
  maskConnectionString,
} from '../config';
import { isMinimumVersion } from '../utils/versions';

let PgNative: typeof pg.Client | undefined;

try {
  PgNative = require('pg-native');
} catch {}

export let pool: pg.Pool | null = null;
export let dbVersion = '';

export async function createConnectionPool() {
  const config = getConnectionPoolOptions();

  try {
    assertConnectionString();
  } catch (err) {
    console.error(`^1[kuradb] ${String(err)}^0`);
    return;
  }

  const poolConfig: pg.PoolConfig = {
    connectionString: config.connectionString,
    connectionTimeoutMillis: config.connectTimeout * 1000,
    idleTimeoutMillis: config.idleTimeout * 1000,
    max: config.maxConnections,
    maxLifetimeSeconds: config.maxLifetime,
  };

  if (PgNative) {
    poolConfig.Client = PgNative as any;
  }

  const newPool = new pg.Pool(poolConfig);

  try {
    const versionResult = await newPool.query('SHOW server_version');
    const version = String(versionResult.rows[0]?.server_version ?? '0.0.0');

    if (!isMinimumVersion(version, KURADB_MINIMUM_POSTGRES_VERSION)) {
      throw new Error(
        `PostgreSQL ${version} is not supported. kuradb requires PostgreSQL ${KURADB_MINIMUM_POSTGRES_VERSION}+.`
      );
    }

    dbVersion = version;
    pool = newPool;

    const driverLabel = PgNative ? 'pg-native' : 'pg';
    console.log(
      `^5[PostgreSQL ${version}] ^2Database server connection established for kuradb (${driverLabel}).^0`
    );
  } catch (err) {
    console.error(`^1[kuradb] Unable to establish a database connection.^0`);
    console.error(maskConnectionString(config.connectionString));
    console.error(err instanceof Error ? err.message : String(err));

    await newPool.end().catch(() => {});
  }
}

export async function closeConnectionPool() {
  if (!pool) return;
  const currentPool = pool;
  pool = null;
  await currentPool.end().catch(() => {});
}
