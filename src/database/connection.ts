import { performance } from 'node:perf_hooks';
import type pg from 'pg';
import { getConfiguredTransactionIsolationLevel } from '../config';
import { logQuery } from '../logger';
import type {
  NormalizedQuery,
  QueryResult,
  QueryRow,
  TransactionIsolationLevel,
  TransactionOptions,
} from '../types';
import { scheduleTick } from '../utils/scheduleTick';

export type DatabaseClient = pg.Pool | pg.PoolClient;

function toQueryResult(pgResult: pg.QueryResult): QueryResult<QueryRow> {
  const rows = pgResult.rows as QueryRow[];
  const result = rows as QueryResult<QueryRow>;
  result.count = pgResult.rowCount ?? 0;
  result.command = pgResult.command;
  return result;
}

export async function executeQuery(
  client: DatabaseClient,
  resource: string,
  request: NormalizedQuery,
  options: { prepare?: boolean; silent?: boolean } = {}
) {
  scheduleTick();

  const startedAt = options.silent ? 0 : performance.now();
  const pgResult = await client.query(request.text, request.values);
  const result = toQueryResult(pgResult);

  if (!options.silent) {
    const duration = performance.now() - startedAt;
    const rowCount = Number(result.count ?? result.length ?? 0);
    logQuery(resource, request.text, duration, request.values, rowCount);
  }

  return result;
}

export function executeQueryNoWait(
  client: DatabaseClient,
  request: NormalizedQuery,
  _prepare?: boolean
) {
  scheduleTick();

  return client.query(request.text, request.values).then(toQueryResult) as Promise<
    QueryResult<QueryRow>
  >;
}

function normalizeIsolationLevel(isolationLevel?: TransactionIsolationLevel) {
  return (isolationLevel ?? getConfiguredTransactionIsolationLevel()).toLowerCase();
}

export function getTransactionBeginSQL(options: TransactionOptions = {}) {
  const fragments = [`isolation level ${normalizeIsolationLevel(options.isolationLevel)}`];

  if (options.readOnly === true) fragments.push('read only');
  if (options.readOnly === false) fragments.push('read write');
  if (options.deferrable === true) fragments.push('deferrable');
  if (options.deferrable === false) fragments.push('not deferrable');

  return `BEGIN TRANSACTION ${fragments.join(' ')}`;
}

export async function withTransaction<T>(
  pool: import('pg').Pool,
  options: TransactionOptions,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  scheduleTick();

  const client = await pool.connect();

  try {
    await client.query(getTransactionBeginSQL(options));
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
