import { KURADB_RESOURCE_NAME } from './config';
import {
  pool,
  rawBatch,
  rawCopyFrom,
  rawCopyTo,
  rawExecute,
  rawInsertMany,
  rawListen,
  rawNotify,
  rawQuery,
  rawTransaction,
  rawUnlisten,
  startTransaction,
} from './database';
import type {
  BatchOptions,
  CFXCallback,
  CFXParameters,
  CopyInput,
  CopyOptions,
  InsertManyOptions,
  ListenOptions,
  ParameterSet,
  TransactionOptions,
  TransactionQuery,
} from './types';
import { sleep } from './utils/sleep';
import './database';
import './commands';
import { db } from './queryBuilder';
import { loadSchema } from './services/schemaLoader';

const kuradbExports = {} as Record<string, Function>;

kuradbExports.isReady = () => {
  return !!pool;
};

kuradbExports.awaitConnection = async () => {
  while (!pool) await sleep(0);
  return true;
};

kuradbExports.query = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawQuery(null, invokingResource, query, parameters, cb, isPromise);
};

kuradbExports.single = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawQuery('single', invokingResource, query, parameters, cb, isPromise);
};

kuradbExports.scalar = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawQuery('scalar', invokingResource, query, parameters, cb, isPromise);
};

kuradbExports.update = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawQuery('update', invokingResource, query, parameters, cb, isPromise);
};

kuradbExports.insert = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawQuery('insert', invokingResource, query, parameters, cb, isPromise);
};

kuradbExports.prepare = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawExecute(invokingResource, query, parameters, cb, isPromise, true);
};

kuradbExports.rawExecute = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawExecute(invokingResource, query, parameters, cb, isPromise);
};

kuradbExports.batch = (
  query: string,
  parameterSets?: Array<Record<string, unknown> | unknown[]>,
  options?: BatchOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawBatch(invokingResource, query, parameterSets, options, cb, isPromise);
};

kuradbExports.insertMany = (
  target: string,
  rows: Array<Record<string, unknown>>,
  options?: InsertManyOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawInsertMany(invokingResource, target, rows, options, cb, isPromise);
};

kuradbExports.transaction = (
  queries: TransactionQuery,
  parameters?: ParameterSet,
  options?: TransactionOptions | CFXCallback,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawTransaction(invokingResource, queries, parameters, options, cb, isPromise);
};

kuradbExports.startTransaction = (
  queries: (
    query: (statement: string, values?: ParameterSet) => Promise<unknown>
  ) => Promise<boolean | undefined>,
  options?: TransactionOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource()
) => {
  return startTransaction(invokingResource, queries as any, options, cb, true);
};

kuradbExports.notify = (
  channel: string,
  payload?: string | null,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawNotify(invokingResource, channel, payload, cb, isPromise);
};

kuradbExports.listen = (
  channel: string,
  onNotify: (value: string) => void,
  options?: ListenOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawListen(invokingResource, channel, onNotify, options, cb, isPromise);
};

kuradbExports.unlisten = (
  subscriptionId: number,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawUnlisten(invokingResource, subscriptionId, cb, isPromise);
};

kuradbExports.copyFrom = (
  query: string,
  input: CopyInput,
  options?: CopyOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawCopyFrom(invokingResource, query, input, options, cb, isPromise);
};

kuradbExports.copyTo = (
  query: string,
  options?: CopyOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawCopyTo(invokingResource, query, options, cb, isPromise);
};

kuradbExports.store = (query: string, cb: Function) => {
  cb(query);
};

function exportAsync(method: string) {
  return (...args: unknown[]) => {
    return new Promise((resolve, reject) => {
      kuradbExports[method](
        ...args,
        (result: unknown, err?: string) => {
          if (err) return reject(new Error(err));
          resolve(result);
        },
        GetInvokingResource(),
        true
      );
    });
  };
}

for (const key in kuradbExports) {
  const method = kuradbExports[key];
  global.exports(key, method);
  global.exports(`${key}_async`, exportAsync(key));
  global.exports(`${key}Sync`, exportAsync(key));
}

global.exports('db', () => db);
global.exports('schema', () => loadSchema(GetResourcePath(KURADB_RESOURCE_NAME)));
