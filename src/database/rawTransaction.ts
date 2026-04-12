import { logError } from '../logger';
import type { CFXCallback, NormalizedQuery, ParameterSet, TransactionQuery } from '../types';
import { setCallback } from '../utils/setCallback';
import { normalizeTransactionQueries } from '../utils/sql';
import { applyTransactionIsolation, type DatabaseClient, executeQuery } from './connection';
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

export async function rawTransaction(
  invokingResource: string,
  queries: TransactionQuery,
  parameters?: ParameterSet,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  cb = setCallback(parameters, cb);

  if (!pool) {
    return logError(
      invokingResource,
      cb,
      isPromise,
      new Error('kuradb is not connected to PostgreSQL yet.')
    );
  }

  let normalizedQueries: NormalizedQuery[];

  try {
    normalizedQueries = normalizeTransactionQueries(queries, parameters);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err);
  }

  let response = false;

  try {
    await (pool as any).begin(async (sql: DatabaseClient) => {
      await applyTransactionIsolation(sql);

      for (const request of normalizedQueries) {
        await executeQuery(sql, invokingResource, request);
      }
    });

    response = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    TriggerEvent('kuradb:transaction-error', {
      queries: normalizedQueries.map((entry) => entry.text),
      parameters,
      message,
      resource: invokingResource,
    });

    return logError(invokingResource, cb, isPromise, err);
  }

  if (!cb) return response;
  safeInvokeCallback(cb, response, invokingResource);
}
