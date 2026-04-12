import { performance } from 'node:perf_hooks';
import type { Sql } from 'postgres';
import { getConfiguredTransactionIsolationLevel } from '../config';
import { logQuery } from '../logger';
import type {
  NormalizedQuery,
  QueryResult,
  QueryRow,
  TransactionIsolationLevel,
  TransactionOptions,
} from '../types';

export type DatabaseClient = Sql<Record<string, unknown>>;

export async function executeQuery(
  client: DatabaseClient,
  resource: string,
  request: NormalizedQuery,
  options: { prepare?: boolean; silent?: boolean } = {}
) {
  const startedAt = options.silent ? 0 : performance.now();
  const result = (
    options.prepare
      ? await (client as any).unsafe(request.text, request.values, { prepare: true })
      : await (client as any).unsafe(request.text, request.values)
  ) as QueryResult<QueryRow>;

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
  prepare?: boolean
) {
  return (
    prepare
      ? (client as any).unsafe(request.text, request.values, { prepare: true })
      : (client as any).unsafe(request.text, request.values)
  ) as Promise<QueryResult<QueryRow>>;
}

function normalizeIsolationLevel(isolationLevel?: TransactionIsolationLevel) {
  return (isolationLevel ?? getConfiguredTransactionIsolationLevel()).toLowerCase();
}

export function getTransactionBeginOptions(options: TransactionOptions = {}) {
  const fragments = [`isolation level ${normalizeIsolationLevel(options.isolationLevel)}`];

  if (options.readOnly === true) fragments.push('read only');
  if (options.readOnly === false) fragments.push('read write');
  if (options.deferrable === true) fragments.push('deferrable');
  if (options.deferrable === false) fragments.push('not deferrable');

  return fragments.join(' ');
}
