import { logError } from '../logger';
import type {
  CFXCallback,
  ParameterSet,
  QueryResult,
  QueryRow,
  TransactionCallbackResult,
  TransactionOptions,
  TransactionOutcome,
} from '../types';
import { normalizeQuery } from '../utils/sql';
import { type DatabaseClient, executeQuery, withTransaction } from './connection';
import { pool } from './pool';

class ManualRollbackError extends Error {}

async function runQuery(
  client: DatabaseClient,
  invokingResource: string,
  query: string,
  values?: ParameterSet,
  options: TransactionOptions = {}
) {
  const request = normalizeQuery(query, values);
  return executeQuery(client, invokingResource, request, {
    prepare: options.prepare,
  }) as Promise<QueryResult<QueryRow>>;
}

export async function startTransaction<T = true>(
  invokingResource: string,
  queries: (
    query: (statement: string, values?: ParameterSet) => Promise<QueryResult<QueryRow>>
  ) => Promise<TransactionCallbackResult<T>>,
  options?: TransactionOptions,
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

  let response: TransactionOutcome<T> = true;

  try {
    await withTransaction(pool, options ?? {}, async (client: DatabaseClient) => {
      const result = await queries((statement, values) =>
        runQuery(client, invokingResource, statement, values, options)
      );

      if (result === false) {
        throw new ManualRollbackError('Transaction was cancelled by startTransaction callback.');
      }

      response = result === undefined ? true : (result as Exclude<T, undefined>);
    });
  } catch (err) {
    if (err instanceof ManualRollbackError) {
      response = false;
    } else {
      return logError(invokingResource, cb, isPromise, err);
    }
  }

  if (cb) cb(response);
  return response;
}
