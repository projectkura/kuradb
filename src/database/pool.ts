import postgres, { type Sql } from 'postgres';
import {
  assertConnectionString,
  getConnectionPoolOptions,
  KURADB_MINIMUM_POSTGRES_VERSION,
  maskConnectionString,
} from '../config';
import type { QueryRow } from '../types';
import { isMinimumVersion } from '../utils/versions';

export let pool: Sql<Record<string, unknown>> | null = null;
export let dbVersion = '';

export async function createConnectionPool() {
  const config = getConnectionPoolOptions();

  try {
    assertConnectionString();
  } catch (err) {
    console.error(`^1[kuradb] ${String(err)}^0`);
    return;
  }

  const sql = postgres(config.connectionString, {
    connect_timeout: config.connectTimeout,
    idle_timeout: config.idleTimeout,
    max_lifetime: config.maxLifetime,
    max: config.maxConnections,
    prepare: config.prepare,
    fetch_types: config.fetchTypes,
    publications: config.publications,
  });

  try {
    const versionRows = (await sql.unsafe('SHOW server_version')) as Array<QueryRow>;
    const version = String(versionRows[0]?.server_version ?? '0.0.0');

    if (!isMinimumVersion(version, KURADB_MINIMUM_POSTGRES_VERSION)) {
      throw new Error(
        `PostgreSQL ${version} is not supported. kuradb requires PostgreSQL ${KURADB_MINIMUM_POSTGRES_VERSION}+.`
      );
    }

    dbVersion = version;
    pool = sql;

    console.log(`^5[PostgreSQL ${version}] ^2Database server connection established for kuradb.^0`);
  } catch (err) {
    console.error(`^1[kuradb] Unable to establish a database connection.^0`);
    console.error(maskConnectionString(config.connectionString));
    console.error(err instanceof Error ? err.message : String(err));

    await (sql as any).end({ timeout: 0 }).catch(() => {});
  }
}

export async function closeConnectionPool() {
  if (!pool) return;
  const currentPool = pool;
  pool = null;
  await (currentPool as any).end({ timeout: 5 }).catch(() => {});
}
