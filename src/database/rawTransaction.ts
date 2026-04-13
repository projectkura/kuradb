import { performance } from 'node:perf_hooks';
import { logError, logQuery } from '../logger';
import type {
  CFXCallback,
  NormalizedQuery,
  ParameterSet,
  TransactionOptions,
  TransactionQuery,
} from '../types';
import { normalizeTransactionQueries } from '../utils/sql';
import { type DatabaseClient, executeQuery, withTransaction } from './connection';
import { pool } from './pool';

const MAX_PG_PARAMS = 65535;
const MAX_CHUNK_ROWS = 1000;

// Matches: INSERT INTO "table" ("col1", "col2") VALUES ($1, $2)
// Captures: prefix up to VALUES, and the ($1, $2) placeholder tuple
const INSERT_VALUES_RE =
  /^(INSERT\s+INTO\s+.+\s+VALUES\s*)\((\$\d+(?:\s*,\s*\$\d+)*)\)\s*(RETURNING\s+.+)?$/is;

function canBatchInserts(queries: NormalizedQuery[]) {
  if (queries.length <= 1) return false;

  const firstText = queries[0].text;
  const firstParamCount = queries[0].values.length;

  // All queries must have the same text and same param count
  for (let i = 1; i < queries.length; i++) {
    if (queries[i].text !== firstText || queries[i].values.length !== firstParamCount) return false;
  }

  return firstParamCount > 0 && INSERT_VALUES_RE.test(firstText);
}

function collapseInserts(queries: NormalizedQuery[]): NormalizedQuery[] {
  const match = queries[0].text.match(INSERT_VALUES_RE);
  if (!match) return queries;

  const prefix = match[1]; // "INSERT INTO ... VALUES "
  const returning = match[3] ?? '';
  const paramsPerRow = queries[0].values.length;
  const chunkSize = Math.min(MAX_CHUNK_ROWS, Math.floor(MAX_PG_PARAMS / paramsPerRow));
  const result: NormalizedQuery[] = [];

  for (let offset = 0; offset < queries.length; offset += chunkSize) {
    const chunk = queries.slice(offset, offset + chunkSize);
    const allValues: unknown[] = [];
    const tuples: string[] = [];

    for (let i = 0; i < chunk.length; i++) {
      const placeholders: string[] = [];
      for (let j = 0; j < paramsPerRow; j++) {
        allValues.push(chunk[i].values[j]);
        placeholders.push(`$${i * paramsPerRow + j + 1}`);
      }
      tuples.push(`(${placeholders.join(', ')})`);
    }

    const text = `${prefix}${tuples.join(', ')}${returning ? ` ${returning}` : ''}`;

    result.push({
      text,
      trimmedText: text,
      placeholderCount: allValues.length,
      statementKind: 'insert',
      hasReturning: !!returning,
      values: allValues,
    });
  }

  return result;
}

function safeInvokeCallback(cb: CFXCallback, value: unknown, invokingResource: string) {
  try {
    cb(value);
  } catch (err) {
    if (typeof err === 'string') {
      if (err.includes('SCRIPT ERROR:')) return console.log(err);
      console.log(`^1SCRIPT ERROR in invoking resource ${invokingResource}: ${err}^0`);
    }
  }
}

function hasOptionKeys(value: unknown): value is TransactionOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ['isolationLevel', 'readOnly', 'deferrable', 'prepare', 'pipeline'].some((key) => key in value)
  );
}

function normalizeTransactionArgs(
  parameters?: ParameterSet,
  options?: TransactionOptions | CFXCallback,
  cb?: CFXCallback
) {
  return {
    parameters,
    options: hasOptionKeys(options) ? options : {},
    callback: typeof options === 'function' ? options : cb,
  };
}

export async function rawTransaction(
  invokingResource: string,
  queries: TransactionQuery,
  parameters?: ParameterSet,
  options?: TransactionOptions | CFXCallback,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  const normalized = normalizeTransactionArgs(parameters, options, cb);
  cb = normalized.callback;

  if (!pool) {
    return logError(
      invokingResource,
      cb,
      isPromise,
      new Error('kuradb is not connected to PostgreSQL yet.')
    );
  }

  let normalizedQueries: NormalizedQuery[];
  let currentQuery: NormalizedQuery | undefined;

  try {
    normalizedQueries = normalizeTransactionQueries(queries, normalized.parameters);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err);
  }

  let response = false;
  const startedAt = performance.now();

  try {
    await withTransaction(pool, normalized.options, async (client: DatabaseClient) => {
      const batchable = canBatchInserts(normalizedQueries);

      if (batchable && normalizedQueries.length > 1) {
        const batched = collapseInserts(normalizedQueries);

        for (const request of batched) {
          await executeQuery(client, invokingResource, request, {
            prepare: false,
            silent: true,
          }).catch((err) => {
            currentQuery = request;
            throw err;
          });
        }
      } else {
        for (const request of normalizedQueries) {
          await executeQuery(client, invokingResource, request, {
            prepare: normalized.options.prepare,
            silent: true,
          }).catch((err) => {
            currentQuery = request;
            throw err;
          });
        }
      }
    });

    response = true;

    const duration = performance.now() - startedAt;
    logQuery(
      invokingResource,
      `TRANSACTION (${normalizedQueries.length} queries)`,
      duration,
      [],
      normalizedQueries.length
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detailedMessage = currentQuery
      ? `${message}\nQuery: ${currentQuery.text}\nParameters: ${JSON.stringify(currentQuery.values)}`
      : message;

    TriggerEvent('kuradb:transaction-error', {
      queries: normalizedQueries.map((entry) => entry.text),
      parameters: normalized.parameters,
      options: normalized.options,
      message: detailedMessage,
      resource: invokingResource,
    });

    return logError(
      invokingResource,
      cb,
      isPromise,
      currentQuery ? new Error(detailedMessage) : err
    );
  }

  if (!cb) return response;
  safeInvokeCallback(cb, response, invokingResource);
}
