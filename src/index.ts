import { pool, rawExecute, rawQuery, rawTransaction, startTransaction } from './database';
import type { CFXCallback, CFXParameters, ParameterSet, TransactionQuery } from './types';
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

KuraDB.transaction = (
  queries: TransactionQuery,
  parameters?: ParameterSet,
  cb?: CFXCallback,
  invokingResource = GetInvokingResource(),
  isPromise?: boolean
) => {
  void rawTransaction(invokingResource, queries, parameters, cb, isPromise);
};

KuraDB.startTransaction = (
  queries: (
    query: (statement: string, values?: ParameterSet) => Promise<unknown>
  ) => Promise<boolean | undefined>,
  invokingResource = GetInvokingResource()
) => {
  return startTransaction(invokingResource, queries, undefined, true);
};

KuraDB.store = (query: string, cb: Function) => {
  cb(query);
};

function exportAsync(method: string) {
  return (query: unknown, parameters?: unknown, invokingResource = GetInvokingResource()) => {
    return new Promise((resolve, reject) => {
      KuraDB[method](
        query,
        parameters,
        (result: unknown, err?: string) => {
          if (err) return reject(new Error(err));
          resolve(result);
        },
        invokingResource,
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
