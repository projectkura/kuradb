import { logError } from '../logger';
import type { CFXCallback, ParameterSet, QueryResult, QueryRow } from '../types';
import { normalizeQuery } from '../utils/sql';
import { applyTransactionIsolation, type DatabaseClient, executeQuery } from './connection';
import { pool } from './pool';

class ManualRollbackError extends Error {}

async function runQuery(
  client: DatabaseClient,
  invokingResource: string,
  query: string,
  values?: ParameterSet
) {
  const request = normalizeQuery(query, values);
  return executeQuery(client, invokingResource, request) as Promise<QueryResult<QueryRow>>;
}

export async function startTransaction(
  invokingResource: string,
  queries: (
    query: (statement: string, values?: ParameterSet) => Promise<QueryResult<QueryRow>>
  ) => Promise<boolean | undefined>,
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

  let response = false;

  try {
    await (pool as any).begin(async (sql: DatabaseClient) => {
      await applyTransactionIsolation(sql);

      const shouldCommit = await queries((statement, values) =>
        runQuery(sql, invokingResource, statement, values)
      );

      if (shouldCommit === false) {
        throw new ManualRollbackError('Transaction was cancelled by startTransaction callback.');
      }
    });

    response = true;
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
