import { logError } from '../logger';
import type { CFXCallback, CFXParameters, QueryType } from '../types';
import { parseResponse } from '../utils/parseResponse';
import { setCallback } from '../utils/setCallback';
import {
  coercePreparedResult,
  getStatementKind,
  normalizeBatchParameters,
  normalizeQuery,
} from '../utils/sql';
import { executeQuery, executeQueryNoWait } from './connection';
import { pool } from './pool';

function getQueryType(query: string): QueryType {
  const statementKind = getStatementKind(query);
  if (statementKind === 'insert') return 'insert';
  if (statementKind === 'update' || statementKind === 'delete') return 'update';
  return null;
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

export async function rawExecute(
  invokingResource: string,
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  isPromise?: boolean,
  prepare?: boolean
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

  const type = getQueryType(query);
  let parameterSets: unknown[][];

  try {
    parameterSets = normalizeBatchParameters(query, parameters as any);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err, query, parameters);
  }

  try {
    let finalResponse: unknown;

    if (parameterSets.length === 1) {
      const request = normalizeQuery(query, parameterSets[0], type);
      const result = await executeQuery(pool, invokingResource, request, { prepare });
      finalResponse =
        prepare && type === null ? coercePreparedResult(result) : parseResponse(type, result);
    } else if (parameterSets.length > 5) {
      // Pipeline multiple parameter sets concurrently
      const requests = parameterSets.map((values) => normalizeQuery(query, values, type));
      const results = await Promise.all(
        requests.map((request) => executeQueryNoWait(pool!, request, prepare))
      );
      finalResponse = results.map((result) =>
        prepare && type === null ? coercePreparedResult(result) : parseResponse(type, result)
      );
    } else {
      const responses: unknown[] = [];
      for (const values of parameterSets) {
        const request = normalizeQuery(query, values, type);
        const result = await executeQuery(pool, invokingResource, request, { prepare });
        const response =
          prepare && type === null ? coercePreparedResult(result) : parseResponse(type, result);
        responses.push(response);
      }
      finalResponse = responses;
    }

    if (!cb) return finalResponse;
    safeInvokeCallback(cb, finalResponse, invokingResource);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err, query, parameters);
  }
}
