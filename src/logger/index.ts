import { getDebugState, kuradbDebug } from '../config';
import type { CFXCallback, QueryLogEntry } from '../types';

const queryLogs = new Map<string, QueryLogEntry[]>();

function shouldDebugResource(resource: string) {
  if (kuradbDebug === true) return true;
  if (Array.isArray(kuradbDebug)) return kuradbDebug.includes(resource);
  return false;
}

export function getQueryLogs(resource?: string) {
  if (resource) return queryLogs.get(resource) ?? [];
  return queryLogs;
}

export function logQuery(
  resource: string,
  query: string,
  duration: number,
  parameters: unknown[],
  rowCount: number
) {
  const debugState = getDebugState();
  const entry: QueryLogEntry = {
    resource,
    query,
    parameters,
    duration,
    rowCount,
    at: Date.now(),
  };

  let current = queryLogs.get(resource) ?? [];
  current.push(entry);

  if (current.length > debugState.logSize * 2) {
    current = current.slice(-debugState.logSize);
    queryLogs.set(resource, current);
  } else if (!queryLogs.has(resource)) {
    queryLogs.set(resource, current);
  }

  if (rowCount >= debugState.resultSetWarning) {
    console.warn(
      `^3[kuradb] ${resource} received an oversized result set (${rowCount} rows).\n${query}^0`
    );
  }

  if (duration >= debugState.slowQueryWarning) {
    console.warn(
      `^3[kuradb] Slow query from ${resource} took ${duration.toFixed(2)}ms.\n${query}^0`
    );
  } else if (shouldDebugResource(resource)) {
    console.log(
      `^5[kuradb] ${resource} ${duration.toFixed(2)}ms (${rowCount} rows)\n${query}\n${JSON.stringify(parameters)}^0`
    );
  }
}

function buildErrorMessage(err: unknown, query?: string, parameters?: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (!query) return message;
  return `${message}\nQuery: ${query}\nParameters: ${JSON.stringify(parameters ?? [])}`;
}

export function logError(
  resource: string,
  cb: CFXCallback | undefined,
  isPromise: boolean | undefined,
  err: unknown,
  query?: string,
  parameters?: unknown
) {
  const message = buildErrorMessage(err, query, parameters);

  console.error(`^1[kuradb] ${resource} failed to execute a query.\n${message}^0`);

  TriggerEvent('kuradb:error', {
    query,
    parameters,
    message: err instanceof Error ? err.message : String(err),
    err,
    resource,
  });

  if (cb) {
    cb(null, message);
    return;
  }

  if (isPromise) {
    throw err instanceof Error ? err : new Error(message);
  }
}
