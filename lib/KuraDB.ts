export type { ColumnDefinition, SchemaDefinition, TableDefinition } from './orm';
export { defineColumn, defineSchema, defineTable } from './orm';

type Query = string | number;
type Params = Record<string, unknown> | unknown[];
type ResultCallback<T> = (result: T | null, err?: string) => void;
type Transaction =
  | string[]
  | [string, Params][]
  | { query: string; values?: Params; parameters?: Params }[];

interface Row {
  [column: string | number]: unknown;
}

interface QueryResult extends Array<Row> {
  command?: string;
  count?: number | null;
}

interface KuraDbClient {
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
  transaction: (
    query: Transaction,
    params?: Params | ResultCallback<boolean>,
    cb?: ResultCallback<boolean>
  ) => Promise<boolean>;
  isReady: () => boolean;
  awaitConnection: () => Promise<true>;
  startTransaction: (
    cb: (
      query: <T = QueryResult>(statement: string, params?: Params) => Promise<T>
    ) => Promise<boolean | undefined>
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
  params?: Params | ResultCallback<boolean>,
  cb?: ResultCallback<boolean>
) {
  assert(Array.isArray(query), `First argument expected array, received ${typeof query}`);

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

  return [query, normalizedParams as Params | undefined, normalizedCallback] as const;
}

function execute(method: string, query: Query | Transaction, params?: Params) {
  return new Promise((resolve, reject) => {
    exportsObject[method](
      query,
      params,
      (result: unknown, error?: string) => {
        if (error) return reject(new Error(error));
        resolve(result);
      },
      currentResourceName,
      true
    );
  }) as Promise<unknown>;
}

export const kuradb: KuraDbClient = {
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
  async transaction(
    query: Transaction,
    params?: Params | ResultCallback<boolean>,
    cb?: ResultCallback<boolean>
  ) {
    const [normalizedQuery, normalizedParams, normalizedCallback] = normalizeTransactionArgs(
      query,
      params,
      cb
    );
    const result = await execute('transaction', normalizedQuery, normalizedParams);
    if (normalizedCallback) normalizedCallback(result as boolean);
    return result as boolean;
  },
  isReady() {
    return exportsObject.isReady() as boolean;
  },
  async awaitConnection() {
    return exportsObject.awaitConnection() as Promise<true>;
  },
  async startTransaction(cb) {
    return exportsObject.startTransaction(cb, currentResourceName) as Promise<boolean>;
  },
};
