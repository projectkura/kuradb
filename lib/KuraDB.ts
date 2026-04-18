export type { ColumnDefinition, SchemaDefinition, TableDefinition } from './orm';
export { defineColumn, defineSchema, defineTable } from './orm';

type Query = string | number;
type Params = Record<string, unknown> | unknown[];
type ResultCallback<T> = (result: T | null, err?: string) => void;
type BatchParams = Array<Record<string, unknown> | unknown[]>;
type Transaction =
  | string[]
  | [string, Params][]
  | { query: string; values?: Params; parameters?: Params }[];

type TransactionOptions = {
  isolationLevel?: 'READ COMMITTED' | 'READ UNCOMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  readOnly?: boolean;
  deferrable?: boolean;
  prepare?: boolean;
  pipeline?: boolean;
};

type BatchOptions = TransactionOptions & {
  transactional?: boolean;
};

type InsertManyOptions = {
  columns?: string[];
  returning?: false | string | string[];
  chunkSize?: number;
};

type CopyChunk = string | Uint8Array;
type CopyOptions = {
  format?: 'text' | 'csv' | 'binary';
  encoding?: BufferEncoding;
};

type ListenOptions = {
  onListen?: () => void;
};

type ListenSubscription = {
  id: number;
  channel: string;
  resource: string;
};

interface Row {
  [column: string | number]: unknown;
}

interface QueryResult extends Array<Row> {
  command?: string;
  count?: number | null;
}

interface kuradb_client {
  store: (query: string) => number;
  ready: (callback: () => void) => void;
  query: <T = QueryResult | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) => Promise<T>;
  single: <T = Row | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) => Promise<T>;
  scalar: <T = unknown | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) => Promise<T>;
  update: <T = number | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) => Promise<T>;
  insert: <T = unknown | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) => Promise<T>;
  prepare: <T = unknown | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) => Promise<T>;
  rawExecute: <T = unknown | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) => Promise<T>;
  batch: <T = unknown[]>(
    query: string,
    parameterSets: BatchParams,
    options?: BatchOptions | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) => Promise<T>;
  insertMany: <T = unknown>(
    target: string,
    rows: Record<string, unknown>[],
    options?: InsertManyOptions | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) => Promise<T>;
  transaction: (
    query: Transaction,
    params?: Params,
    options?: TransactionOptions | ResultCallback<boolean>,
    cb?: ResultCallback<boolean>
  ) => Promise<boolean>;
  notify: (
    channel: string,
    payload?: string | null,
    cb?: ResultCallback<boolean>
  ) => Promise<boolean>;
  listen: (
    channel: string,
    onNotify: (value: string) => void,
    options?: ListenOptions | ResultCallback<ListenSubscription>,
    cb?: ResultCallback<ListenSubscription>
  ) => Promise<ListenSubscription>;
  unlisten: (subscriptionId: number, cb?: ResultCallback<boolean>) => Promise<boolean>;
  copyFrom: (
    query: string,
    input: CopyChunk | CopyChunk[],
    options?: CopyOptions | ResultCallback<{ bytes: number; chunks: number }>,
    cb?: ResultCallback<{ bytes: number; chunks: number }>
  ) => Promise<{ bytes: number; chunks: number }>;
  copyTo: (
    query: string,
    options?: CopyOptions | ResultCallback<string>,
    cb?: ResultCallback<string>
  ) => Promise<string>;
  isReady: () => boolean;
  awaitConnection: () => Promise<true>;
  startTransaction: (
    cb: (
      query: <T = QueryResult>(statement: string, params?: Params) => Promise<T>
    ) => Promise<boolean | undefined>,
    options?: TransactionOptions
  ) => Promise<boolean>;
}

declare const global: {
  exports: {
    kuradb: Record<string, (...args: unknown[]) => unknown>;
  };
};

const queryStore: string[] = [];
const exportsObject = global.exports.kuradb;
const currentResourceName = GetCurrentResourceName();

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new TypeError(message);
}

function getStoredQuery(query: Query) {
  if (typeof query === 'number') {
    const storedQuery = queryStore[query];
    assert(
      typeof storedQuery === 'string',
      'First argument received invalid query store reference'
    );
    return storedQuery;
  }

  assert(typeof query === 'string', `First argument expected string, received ${typeof query}`);
  return query;
}

function normalizeQueryArgs<T>(
  query: Query,
  params?: Params | ResultCallback<T>,
  cb?: ResultCallback<T>
) {
  const normalizedQuery = getStoredQuery(query);
  let normalizedParams = params;
  let normalizedCallback = cb;

  if (typeof params === 'function') {
    normalizedCallback = params;
    normalizedParams = undefined;
  }

  if (normalizedCallback !== undefined) {
    assert(
      typeof normalizedCallback === 'function',
      `Third argument expected function, received ${typeof normalizedCallback}`
    );
  }

  return [normalizedQuery, normalizedParams as Params | undefined, normalizedCallback] as const;
}

function normalizeTransactionArgs(
  query: Transaction,
  params?: Params,
  options?: TransactionOptions | ResultCallback<boolean>,
  cb?: ResultCallback<boolean>
) {
  assert(Array.isArray(query), `First argument expected array, received ${typeof query}`);

  let normalizedOptions = options;
  let normalizedCallback = cb;

  if (typeof options === 'function') {
    normalizedCallback = options;
    normalizedOptions = undefined;
  }

  if (normalizedCallback !== undefined) {
    assert(
      typeof normalizedCallback === 'function',
      `Fourth argument expected function, received ${typeof normalizedCallback}`
    );
  }

  return [
    query,
    params,
    normalizedOptions as TransactionOptions | undefined,
    normalizedCallback,
  ] as const;
}

function normalizeOptionalCallback<T, TOptions>(
  options?: TOptions | ResultCallback<T>,
  cb?: ResultCallback<T>
): readonly [TOptions | undefined, ResultCallback<T> | undefined] {
  if (typeof options === 'function') {
    return [undefined, options as ResultCallback<T>] as const;
  }

  return [options, cb] as const;
}

function execute(method: string, ...args: unknown[]) {
  return new Promise((resolve, reject) => {
    exportsObject[method](
      ...args,
      (result: unknown, error?: string) => {
        if (error) return reject(new Error(error));
        resolve(result);
      },
      currentResourceName,
      true
    );
  }) as Promise<unknown>;
}

export const kuradb: kuradb_client = {
  store(query) {
    assert(typeof query === 'string', `Query expects a string, received ${typeof query}`);
    queryStore.push(query);
    return queryStore.length - 1;
  },
  ready(callback) {
    setImmediate(async () => {
      while (GetResourceState('kuradb') !== 'started') {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await exportsObject.awaitConnection();
      callback();
    });
  },
  async query<T = QueryResult | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) {
    const [normalizedQuery, normalizedParams, normalizedCallback] = normalizeQueryArgs(
      query,
      params,
      cb
    );
    const result = await execute('query', normalizedQuery, normalizedParams);
    if (normalizedCallback) normalizedCallback(result as T);
    return result as T;
  },
  async single<T = Row | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) {
    const [normalizedQuery, normalizedParams, normalizedCallback] = normalizeQueryArgs(
      query,
      params,
      cb
    );
    const result = await execute('single', normalizedQuery, normalizedParams);
    if (normalizedCallback) normalizedCallback(result as T);
    return result as T;
  },
  async scalar<T = unknown | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) {
    const [normalizedQuery, normalizedParams, normalizedCallback] = normalizeQueryArgs(
      query,
      params,
      cb
    );
    const result = await execute('scalar', normalizedQuery, normalizedParams);
    if (normalizedCallback) normalizedCallback(result as T);
    return result as T;
  },
  async update<T = number | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) {
    const [normalizedQuery, normalizedParams, normalizedCallback] = normalizeQueryArgs(
      query,
      params,
      cb
    );
    const result = await execute('update', normalizedQuery, normalizedParams);
    if (normalizedCallback) normalizedCallback(result as T);
    return result as T;
  },
  async insert<T = unknown | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) {
    const [normalizedQuery, normalizedParams, normalizedCallback] = normalizeQueryArgs(
      query,
      params,
      cb
    );
    const result = await execute('insert', normalizedQuery, normalizedParams);
    if (normalizedCallback) normalizedCallback(result as T);
    return result as T;
  },
  async prepare<T = unknown | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) {
    const [normalizedQuery, normalizedParams, normalizedCallback] = normalizeQueryArgs(
      query,
      params,
      cb
    );
    const result = await execute('prepare', normalizedQuery, normalizedParams);
    if (normalizedCallback) normalizedCallback(result as T);
    return result as T;
  },
  async rawExecute<T = unknown | null>(
    query: Query,
    params?: Params | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) {
    const [normalizedQuery, normalizedParams, normalizedCallback] = normalizeQueryArgs(
      query,
      params,
      cb
    );
    const result = await execute('rawExecute', normalizedQuery, normalizedParams);
    if (normalizedCallback) normalizedCallback(result as T);
    return result as T;
  },
  async batch<T = unknown[]>(
    query: string,
    parameterSets: BatchParams,
    options?: BatchOptions | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) {
    const [normalizedOptions, normalizedCallback] = normalizeOptionalCallback(options, cb);
    const result = await execute('batch', query, parameterSets, normalizedOptions);
    if (normalizedCallback) normalizedCallback(result as T);
    return result as T;
  },
  async insertMany<T = unknown>(
    target: string,
    rows: Record<string, unknown>[],
    options?: InsertManyOptions | ResultCallback<T>,
    cb?: ResultCallback<T>
  ) {
    const [normalizedOptions, normalizedCallback] = normalizeOptionalCallback(options, cb);
    const result = await execute('insertMany', target, rows, normalizedOptions);
    if (normalizedCallback) normalizedCallback(result as T);
    return result as T;
  },
  async transaction(
    query: Transaction,
    params?: Params,
    options?: TransactionOptions | ResultCallback<boolean>,
    cb?: ResultCallback<boolean>
  ) {
    const [normalizedQuery, normalizedParams, normalizedOptions, normalizedCallback] =
      normalizeTransactionArgs(query, params, options, cb);
    const result = await execute(
      'transaction',
      normalizedQuery,
      normalizedParams,
      normalizedOptions
    );
    if (normalizedCallback) normalizedCallback(result as boolean);
    return result as boolean;
  },
  async notify(channel, payload, cb) {
    const result = await execute('notify', channel, payload);
    if (cb) cb(result as boolean);
    return result as boolean;
  },
  async listen(channel, onNotify, options, cb) {
    const [normalizedOptions, normalizedCallback] = normalizeOptionalCallback(options, cb);
    const result = await execute('listen', channel, onNotify, normalizedOptions);
    if (normalizedCallback) normalizedCallback(result as ListenSubscription);
    return result as ListenSubscription;
  },
  async unlisten(subscriptionId, cb) {
    const result = await execute('unlisten', subscriptionId);
    if (cb) cb(result as boolean);
    return result as boolean;
  },
  async copyFrom(query, input, options, cb) {
    const [normalizedOptions, normalizedCallback] = normalizeOptionalCallback(options, cb);
    const result = await execute('copyFrom', query, input, normalizedOptions);
    if (normalizedCallback) normalizedCallback(result as { bytes: number; chunks: number });
    return result as { bytes: number; chunks: number };
  },
  async copyTo(query, options, cb) {
    const [normalizedOptions, normalizedCallback] = normalizeOptionalCallback(options, cb);
    const result = await execute('copyTo', query, normalizedOptions);
    if (normalizedCallback) normalizedCallback(result as string);
    return result as string;
  },
  isReady() {
    return exportsObject.isReady() as boolean;
  },
  async awaitConnection() {
    return exportsObject.awaitConnection() as Promise<true>;
  },
  async startTransaction(cb, options) {
    return execute('startTransaction', cb, options) as Promise<boolean>;
  },
};
