import { logError } from '../logger';
import type {
  CFXCallback,
  CFXParameters,
  NormalizedQuery,
  ParameterSet,
  QueryType,
} from '../types';
import { parseResponse } from '../utils/parseResponse';
import { setCallback } from '../utils/setCallback';
import { normalizeQuery } from '../utils/sql';
import { executeQuery } from './connection';
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

export async function rawQuery(
  type: QueryType,
  invokingResource: string,
  query: string,
  parameters?: CFXParameters,
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

  let request: NormalizedQuery;

  try {
    request = normalizeQuery(query, parameters as ParameterSet, type);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err, query, parameters);
  }

  try {
    const result = await executeQuery(pool, invokingResource, request);
    const response = parseResponse(type, result);

    if (!cb) return response;
    safeInvokeCallback(cb, response, invokingResource);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err, request.text, request.values);
  }
}
