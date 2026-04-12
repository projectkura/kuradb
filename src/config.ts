import type { KuraDbDebugState } from './types';

export const KURADB_RESOURCE_NAME = 'kuradb';
export const KURADB_MINIMUM_POSTGRES_VERSION = '18.3.0';

export function getConnectionString() {
  return GetConvar('kuradb_connection_string', '').trim();
}

export let kuradbDebug: boolean | string[] = false;
export let kuradbSlowQueryWarning = 200;
export let kuradbLogSize = 100;
export let kuradbResultSetWarning = 1000;

export function setDebug() {
  kuradbSlowQueryWarning = GetConvarInt('kuradb_slow_query_warning', 200);
  kuradbResultSetWarning = GetConvarInt('kuradb_resultset_warning', 1000);

  try {
    const debug = GetConvar('kuradb_debug', 'false');
    kuradbDebug = debug === 'false' ? false : JSON.parse(debug);
  } catch {
    kuradbDebug = true;
  }

  kuradbLogSize = kuradbDebug ? 10000 : GetConvarInt('kuradb_log_size', 100);
}

export function getDebugState(): KuraDbDebugState {
  return {
    enabled: kuradbDebug,
    slowQueryWarning: kuradbSlowQueryWarning,
    logSize: kuradbLogSize,
    resultSetWarning: kuradbResultSetWarning,
  };
}

export function getTransactionIsolationLevel() {
  switch (GetConvarInt('kuradb_transaction_isolation_level', 2)) {
    case 1:
      return 'REPEATABLE READ';
    case 2:
      return 'READ COMMITTED';
    case 3:
      return 'READ UNCOMMITTED';
    case 4:
      return 'SERIALIZABLE';
    default:
      return 'READ COMMITTED';
  }
}

export interface ConnectionPoolOptions {
  connectionString: string;
  connectTimeout: number;
  idleTimeout: number;
  maxConnections: number;
  maxLifetime: number;
  prepare: boolean;
}

export function getConnectionPoolOptions(): ConnectionPoolOptions {
  return {
    connectionString: getConnectionString(),
    connectTimeout: GetConvarInt('kuradb_connect_timeout', 10),
    idleTimeout: GetConvarInt('kuradb_idle_timeout', 30),
    maxConnections: GetConvarInt('kuradb_max_connections', 10),
    maxLifetime: GetConvarInt('kuradb_max_lifetime', 1800),
    prepare: GetConvar('kuradb_prepare', 'true') !== 'false',
  };
}

export function assertConnectionString() {
  const connectionString = getConnectionString();

  if (!connectionString) {
    throw new Error('kuradb_connection_string was not set.');
  }

  const url = new URL(connectionString);

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(
      `Expected a PostgreSQL connection string but received protocol "${url.protocol}".`
    );
  }

  if (!url.hostname) {
    throw new Error('kuradb_connection_string must include a hostname.');
  }

  if (!url.pathname || url.pathname === '/') {
    throw new Error('kuradb_connection_string must include a database name.');
  }
}

export function maskConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = '******';
    return url.toString();
  } catch {
    return connectionString;
  }
}
