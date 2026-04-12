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

const KuraDB = {} as Record<string, Function>;

KuraDB.isReady = () => {
  return !!pool;
};

KuraDB.awaitConnection = async () => {
  while (!pool) await sleep(0);
  return true;
};

KuraDB.query = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawQuery(null, invokingResource, query, parameters, cb, isPromise);
};

KuraDB.single = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawQuery('single', invokingResource, query, parameters, cb, isPromise);
};

KuraDB.scalar = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawQuery('scalar', invokingResource, query, parameters, cb, isPromise);
};

KuraDB.update = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawQuery('update', invokingResource, query, parameters, cb, isPromise);
};

KuraDB.insert = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawQuery('insert', invokingResource, query, parameters, cb, isPromise);
};

KuraDB.prepare = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawExecute(invokingResource, query, parameters, cb, isPromise, true);
};

KuraDB.rawExecute = (
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawExecute(invokingResource, query, parameters, cb, isPromise);
};

KuraDB.batch = (
  query: string,
  parameterSets?: Array<Record<string, unknown> | unknown[]>,
  options?: BatchOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawBatch(invokingResource, query, parameterSets, options, cb, isPromise);
};

KuraDB.insertMany = (
  target: string,
  rows: Array<Record<string, unknown>>,
  options?: InsertManyOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawInsertMany(invokingResource, target, rows, options, cb, isPromise);
};

KuraDB.transaction = (
  queries: TransactionQuery,
  parameters?: ParameterSet,
  options?: TransactionOptions | CFXCallback,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawTransaction(invokingResource, queries, parameters, options, cb, isPromise);
};

KuraDB.startTransaction = (
  queries: (
    query: (statement: string, values?: ParameterSet) => Promise<unknown>
  ) => Promise<boolean | undefined>,
  options?: TransactionOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource()
) => {
  return startTransaction(invokingResource, queries as any, options, cb, true);
};

KuraDB.notify = (
  channel: string,
  payload?: string | null,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawNotify(invokingResource, channel, payload, cb, isPromise);
};

KuraDB.listen = (
  channel: string,
  onNotify: (value: string) => void,
  options?: ListenOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawListen(invokingResource, channel, onNotify, options, cb, isPromise);
};

KuraDB.unlisten = (
  subscriptionId: number,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawUnlisten(invokingResource, subscriptionId, cb, isPromise);
};

KuraDB.copyFrom = (
  query: string,
  input: CopyInput,
  options?: CopyOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawCopyFrom(invokingResource, query, input, options, cb, isPromise);
};

KuraDB.copyTo = (
  query: string,
  options?: CopyOptions,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawCopyTo(invokingResource, query, options, cb, isPromise);
};

KuraDB.store = (query: string, cb: Function) => {
  cb(query);
};

function exportAsync(method: string) {
  return (...args: unknown[]) => {
    return new Promise((resolve, reject) => {
      KuraDB[method](
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

for (const key in KuraDB) {
  const method = KuraDB[key];
  global.exports(key, method);
  global.exports(`${key}_async`, exportAsync(key));
  global.exports(`${key}Sync`, exportAsync(key));
}
