import type { KuraDbDebugState, TransactionIsolationLevel } from './types';

export const KURADB_RESOURCE_NAME = 'kuradb';
export const KURADB_MINIMUM_POSTGRES_VERSION = '17.0.0';

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
}

export function getConnectionPoolOptions(): ConnectionPoolOptions {
  return {
    connectionString: getConnectionString(),
    connectTimeout: GetConvarInt('kuradb_connect_timeout', 10),
    idleTimeout: GetConvarInt('kuradb_idle_timeout', 30),
    maxConnections: GetConvarInt('kuradb_max_connections', 10),
    maxLifetime: GetConvarInt('kuradb_max_lifetime', 1800),
  };
}

export function getConfiguredTransactionIsolationLevel(): TransactionIsolationLevel {
  return getTransactionIsolationLevel();
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

RegisterCommand(
  'kuradb_debug',
  (source: number, args: string[]) => {
    if (source !== 0) return console.log('^3This command can only be run server side^0');
    switch (args[0]) {
      case 'add':
        if (!Array.isArray(kuradbDebug)) kuradbDebug = [];
        kuradbDebug.push(args[1]);
        SetConvar('kuradb_debug', JSON.stringify(kuradbDebug));
        return console.log(`^3Added ${args[1]} to kuradb_debug^0`);

      case 'remove':
        if (Array.isArray(kuradbDebug)) {
          const index = kuradbDebug.indexOf(args[1]);
          if (index === -1) return;
          kuradbDebug.splice(index, 1);
          if (kuradbDebug.length === 0) kuradbDebug = false;
          SetConvar('kuradb_debug', JSON.stringify(kuradbDebug) || 'false');
          return console.log(`^3Removed ${args[1]} from kuradb_debug^0`);
        }
        break;

      default:
        return console.log(`^3Usage: kuradb_debug add|remove <resource>^0`);
    }
  },
  true
);

export function maskConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = '******';
    return url.toString();
  } catch {
    return connectionString;
  }
}
