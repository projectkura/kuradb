import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { logError } from '../logger';
import type {
  BatchOptions,
  CFXCallback,
  CopyInput,
  CopyOptions,
  InsertManyOptions,
  ListenOptions,
  ListenSubscription,
  ParameterSet,
  QueryResult,
  QueryRow,
} from '../types';
import { parseResponse } from '../utils/parseResponse';
import { setCallback } from '../utils/setCallback';
import {
  buildInsertManyQuery,
  getStatementKind,
  normalizeBatchParameters,
  normalizeQuery,
} from '../utils/sql';
import {
  type DatabaseClient,
  executeQuery,
  executeQueryNoWait,
  getTransactionBeginOptions,
} from './connection';
import { pool } from './pool';

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

function getQueryType(query: string) {
  const statementKind = getStatementKind(query);
  if (statementKind === 'insert') return 'insert' as const;
  if (statementKind === 'update' || statementKind === 'delete') return 'update' as const;
  return null;
}

async function executeBatchOnClient(
  client: DatabaseClient,
  invokingResource: string,
  query: string,
  parameterSets: unknown[][],
  options: BatchOptions = {}
) {
  const type = getQueryType(query);
  const requests = parameterSets.map((values) =>
    normalizeQuery(query, values as ParameterSet, type)
  );

  // Pipeline by default for large batches; always pipeline when explicitly requested
  if (options.pipeline || requests.length > 5) {
    const results = (await Promise.all(
      requests.map((request) => executeQueryNoWait(client, request, options.prepare))
    )) as QueryResult<QueryRow>[];

    return results.map((result) => parseResponse(type, result));
  }

  const responses: unknown[] = [];
  for (const request of requests) {
    const result = await executeQuery(client, invokingResource, request, {
      prepare: options.prepare,
    });
    responses.push(parseResponse(type, result));
  }

  return responses;
}

function aggregateInsertManyResults(
  results: QueryResult<QueryRow>[],
  options: InsertManyOptions = {}
) {
  if (options.returning === false) {
    return results.reduce((total, result) => total + Number(result.count ?? result.length ?? 0), 0);
  }

  const rows = results.flatMap((result) => [...result]);

  if (!options.returning) {
    return rows.map((row) => ('id' in row ? (row.id ?? null) : (Object.values(row)[0] ?? null)));
  }

  return rows;
}

type ListenerState = {
  metaPromise: Promise<{ unlisten(): Promise<void> }> | null;
  subscriptions: Map<
    number,
    { resource: string; onNotify: (value: string) => void; onListen?: () => void }
  >;
};

const listeners = new Map<string, ListenerState>();
let nextListenerId = 1;

export async function rawBatch(
  invokingResource: string,
  query: string,
  parameters?: Array<Record<string, unknown> | unknown[]>,
  options?: BatchOptions,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  cb = setCallback(options as any, cb);
  options = (
    typeof options === 'object' && options && !Array.isArray(options) ? options : {}
  ) as BatchOptions;

  if (!pool) {
    return logError(
      invokingResource,
      cb,
      isPromise,
      new Error('kuradb is not connected to PostgreSQL yet.')
    );
  }

  let parameterSets: unknown[][];

  try {
    parameterSets = normalizeBatchParameters(query, parameters as any);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err, query, parameters);
  }

  try {
    const response = options.transactional
      ? await (pool as any).begin(getTransactionBeginOptions(options), (sql: DatabaseClient) =>
          executeBatchOnClient(sql, invokingResource, query, parameterSets, options)
        )
      : await executeBatchOnClient(pool, invokingResource, query, parameterSets, options);

    if (!cb) return response;
    safeInvokeCallback(cb, response, invokingResource);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err, query, parameters);
  }
}

export async function rawInsertMany(
  invokingResource: string,
  target: string,
  rows: Array<Record<string, unknown>>,
  options?: InsertManyOptions,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  cb = setCallback(options as any, cb);
  options =
    typeof options === 'object' && options && !Array.isArray(options)
      ? (options as InsertManyOptions)
      : {};

  if (!pool) {
    return logError(
      invokingResource,
      cb,
      isPromise,
      new Error('kuradb is not connected to PostgreSQL yet.')
    );
  }

  try {
    const chunkSize = Math.max(1, options.chunkSize ?? rows.length);
    const results: QueryResult<QueryRow>[] = [];

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const built = buildInsertManyQuery(target, chunk, options);
      const request = normalizeQuery(built.query, built.values, 'insert');
      results.push(await executeQuery(pool, invokingResource, request, { prepare: true }));
    }

    const response = aggregateInsertManyResults(results, options);
    if (!cb) return response;
    safeInvokeCallback(cb, response, invokingResource);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err);
  }
}

export async function rawNotify(
  invokingResource: string,
  channel: string,
  payload?: string | null,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  if (!pool) {
    return logError(
      invokingResource,
      cb,
      isPromise,
      new Error('kuradb is not connected to PostgreSQL yet.')
    );
  }

  try {
    const request = normalizeQuery('SELECT pg_notify($1, $2)', [channel, payload ?? ''], null);
    await executeQuery(pool, invokingResource, request, { prepare: true });

    if (!cb) return true;
    safeInvokeCallback(cb, true, invokingResource);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err);
  }
}

export async function rawListen(
  invokingResource: string,
  channel: string,
  onNotify: (value: string) => void,
  options?: ListenOptions,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  cb = setCallback(options as any, cb);
  options =
    typeof options === 'object' && options && !Array.isArray(options)
      ? (options as ListenOptions)
      : {};

  if (!pool) {
    return logError(
      invokingResource,
      cb,
      isPromise,
      new Error('kuradb is not connected to PostgreSQL yet.')
    );
  }

  try {
    const id = nextListenerId++;
    let state = listeners.get(channel);

    if (!state) {
      state = {
        metaPromise: null,
        subscriptions: new Map(),
      };
      listeners.set(channel, state);

      state.metaPromise = pool.listen(
        channel,
        (value: string) => {
          const current = listeners.get(channel);
          if (!current) return;

          for (const subscription of current.subscriptions.values()) {
            subscription.onNotify(value);
          }
        },
        () => {
          const current = listeners.get(channel);
          if (!current) return;

          for (const subscription of current.subscriptions.values()) {
            subscription.onListen?.();
          }
        }
      ) as Promise<{ unlisten(): Promise<void> }>;
    }

    state.subscriptions.set(id, {
      resource: invokingResource,
      onNotify,
      onListen: options.onListen,
    });

    await state.metaPromise;

    const response: ListenSubscription = { id, channel, resource: invokingResource };
    if (!cb) return response;
    safeInvokeCallback(cb, response, invokingResource);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err);
  }
}

export async function rawUnlisten(
  invokingResource: string,
  subscriptionId: number,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  if (!pool) {
    return logError(
      invokingResource,
      cb,
      isPromise,
      new Error('kuradb is not connected to PostgreSQL yet.')
    );
  }

  try {
    for (const [channel, state] of listeners.entries()) {
      if (!state.subscriptions.delete(subscriptionId)) continue;

      if (state.subscriptions.size === 0 && state.metaPromise) {
        const meta = await state.metaPromise;
        await meta.unlisten();
        listeners.delete(channel);
      }

      if (!cb) return true;
      safeInvokeCallback(cb, true, invokingResource);
      return;
    }

    if (!cb) return false;
    safeInvokeCallback(cb, false, invokingResource);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err);
  }
}

export async function rawCopyFrom(
  invokingResource: string,
  query: string,
  input: CopyInput,
  options?: CopyOptions,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  cb = setCallback(options as any, cb);
  options =
    typeof options === 'object' && options && !Array.isArray(options)
      ? (options as CopyOptions)
      : {};

  if (!pool) {
    return logError(
      invokingResource,
      cb,
      isPromise,
      new Error('kuradb is not connected to PostgreSQL yet.')
    );
  }

  try {
    const chunks = Array.isArray(input) ? input : [input];
    const writable = await (pool as any).unsafe(query, []).writable();
    await pipeline(Readable.from(chunks), writable);

    const bytes = chunks.reduce((total, chunk) => {
      if (typeof chunk === 'string')
        return total + Buffer.byteLength(chunk, options.encoding ?? 'utf8');
      return total + chunk.byteLength;
    }, 0);

    const response = {
      bytes,
      chunks: chunks.length,
    };

    if (!cb) return response;
    safeInvokeCallback(cb, response, invokingResource);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err, query);
  }
}

export async function rawCopyTo(
  invokingResource: string,
  query: string,
  options?: CopyOptions,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  cb = setCallback(options as any, cb);
  options =
    typeof options === 'object' && options && !Array.isArray(options)
      ? (options as CopyOptions)
      : {};

  if (!pool) {
    return logError(
      invokingResource,
      cb,
      isPromise,
      new Error('kuradb is not connected to PostgreSQL yet.')
    );
  }

  try {
    const readable = await (pool as any).unsafe(query, []).readable();
    const chunks: Buffer[] = [];

    for await (const chunk of readable as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, options.encoding ?? 'utf8'));
    }

    const response = Buffer.concat(chunks).toString(options.encoding ?? 'utf8');

    if (!cb) return response;
    safeInvokeCallback(cb, response, invokingResource);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err, query);
  }
}
