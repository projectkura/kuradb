import { performance } from 'node:perf_hooks';
import type { Sql } from 'postgres';
import { getTransactionIsolationLevel } from '../config';
import { logQuery } from '../logger';
import type { NormalizedQuery, QueryResult, QueryRow } from '../types';
import { scheduleTick } from '../utils/scheduleTick';

export type DatabaseClient = Sql<Record<string, unknown>>;

export async function executeQuery(
  client: DatabaseClient,
  resource: string,
  request: NormalizedQuery,
  options: { prepare?: boolean } = {}
) {
  await scheduleTick();

  const startedAt = performance.now();
  const result = (
    options.prepare
      ? await (client as any).unsafe(request.text, request.values, { prepare: true })
      : await (client as any).unsafe(request.text, request.values)
  ) as QueryResult<QueryRow>;
  const duration = performance.now() - startedAt;
  const rowCount = Number(result.count ?? result.length ?? 0);

  logQuery(resource, request.text, duration, request.values, rowCount);

  return result;
}

export async function applyTransactionIsolation(client: DatabaseClient) {
  const isolationLevel = getTransactionIsolationLevel();
  await (client as any).unsafe(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
}
