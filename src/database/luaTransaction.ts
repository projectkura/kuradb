import type pg from 'pg';
import { logError } from '../logger';
import type {
  CFXCallback,
  CFXParameters,
  NormalizedQuery,
  ParameterSet,
  QueryResult,
  QueryRow,
  TransactionOptions,
  TransactionOutcome,
} from '../types';
import { setCallback } from '../utils/setCallback';
import { normalizeQuery } from '../utils/sql';
import {
  beginTransactionClient,
  commitTransactionClient,
  executeQuery,
  rollbackTransactionClient,
} from './connection';
import { pool } from './pool';

interface LuaTransactionSession {
  id: string;
  resource: string;
  client: pg.PoolClient;
  options: TransactionOptions;
}

const luaTransactionSessions = new Map<string, LuaTransactionSession>();
let luaTransactionSequence = 0;

function normalizeOptions(options?: TransactionOptions | CFXCallback) {
  if (typeof options === 'object' && options && !Array.isArray(options)) {
    return options;
  }

  return {} as TransactionOptions;
}

function createSessionId() {
  luaTransactionSequence += 1;
  return `lua-tx:${Date.now().toString(36)}:${luaTransactionSequence.toString(36)}`;
}

function getSession(sessionId: string, invokingResource: string) {
  if (typeof sessionId !== 'string' || sessionId === '') {
    return null;
  }

  const session = luaTransactionSessions.get(sessionId);
  if (!session || session.resource !== invokingResource) {
    return null;
  }

  return session;
}

function buildInvalidSessionError() {
  return new Error('Invalid or expired Lua transaction session.');
}

export async function beginLuaTransaction(
  invokingResource: string,
  options?: TransactionOptions | CFXCallback,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  cb = setCallback(options as CFXParameters, cb);
  const normalizedOptions = normalizeOptions(options);

  if (!pool) {
    return logError(
      invokingResource,
      cb,
      isPromise,
      new Error('kuradb is not connected to PostgreSQL yet.')
    );
  }

  try {
    const client = await beginTransactionClient(pool, normalizedOptions);
    const sessionId = createSessionId();

    luaTransactionSessions.set(sessionId, {
      id: sessionId,
      resource: invokingResource,
      client,
      options: normalizedOptions,
    });

    if (!cb) return sessionId;
    cb(sessionId);
    return sessionId;
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err);
  }
}

export async function stepLuaTransaction(
  invokingResource: string,
  sessionId: string,
  query: string,
  parameters?: CFXParameters,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  cb = setCallback(parameters, cb);

  const session = getSession(sessionId, invokingResource);
  if (!session) {
    return logError(invokingResource, cb, isPromise, buildInvalidSessionError());
  }

  let request: NormalizedQuery;

  try {
    request = normalizeQuery(query, parameters as ParameterSet);
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err, query, parameters);
  }

  try {
    const result = (await executeQuery(session.client, invokingResource, request, {
      prepare: session.options.prepare,
    })) as QueryResult<QueryRow>;

    if (!cb) return result;
    cb(result);
    return result;
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err, request.text, request.values);
  }
}

function normalizeFinishArgs(
  payloadOrCallback?: unknown | CFXCallback,
  cb?: CFXCallback
): readonly [unknown, CFXCallback | undefined] {
  if (typeof payloadOrCallback === 'function') {
    return [undefined, payloadOrCallback as CFXCallback] as const;
  }

  return [payloadOrCallback, cb] as const;
}

export async function finishLuaTransaction(
  invokingResource: string,
  sessionId: string,
  shouldCommit: boolean,
  payloadOrCallback?: unknown | CFXCallback,
  cb?: CFXCallback,
  isPromise?: boolean
) {
  const [payload, normalizedCallback] = normalizeFinishArgs(payloadOrCallback, cb);
  cb = normalizedCallback;

  const session = getSession(sessionId, invokingResource);
  if (!session) {
    return logError(invokingResource, cb, isPromise, buildInvalidSessionError());
  }

  luaTransactionSessions.delete(sessionId);

  try {
    if (shouldCommit) {
      await commitTransactionClient(session.client);

      const response = payload === undefined ? true : (payload as TransactionOutcome<unknown>);
      if (!cb) return response;
      cb(response);
      return response;
    }

    await rollbackTransactionClient(session.client);

    if (!cb) return false;
    cb(false);
    return false;
  } catch (err) {
    return logError(invokingResource, cb, isPromise, err);
  }
}

export async function rollbackLuaTransactionsForResource(resourceName: string) {
  const sessions = [...luaTransactionSessions.values()].filter(
    (session) => session.resource === resourceName
  );

  for (const session of sessions) {
    luaTransactionSessions.delete(session.id);
    await rollbackTransactionClient(session.client).catch(() => {});
  }
}

export async function closeLuaTransactionSessions() {
  const sessions = [...luaTransactionSessions.values()];
  luaTransactionSessions.clear();

  for (const session of sessions) {
    await rollbackTransactionClient(session.client).catch(() => {});
  }
}
