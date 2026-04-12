import type {
  NormalizedQuery,
  ParameterSet,
  QueryType,
  StatementKind,
  TransactionQuery,
} from '../types';

function assertNumericKey(key: string) {
  if (!/^\d+$/.test(key)) {
    throw new Error(
      `Expected numeric parameter keys for PostgreSQL placeholders, received "${key}".`
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getStatementKind(query: string): StatementKind {
  const trimmedQuery = query.trim().toUpperCase();
  if (trimmedQuery.startsWith('INSERT')) return 'insert';
  if (trimmedQuery.startsWith('UPDATE')) return 'update';
  if (trimmedQuery.startsWith('DELETE')) return 'delete';
  if (trimmedQuery.startsWith('SELECT') || trimmedQuery.startsWith('WITH')) return 'select';
  return 'other';
}

export function getPlaceholderCount(query: string) {
  const matches = query.match(/\$(\d+)/g) ?? [];
  return matches.reduce((max, match) => {
    const index = Number.parseInt(match.slice(1), 10);
    return Number.isNaN(index) ? max : Math.max(max, index);
  }, 0);
}

export function normalizeParameters(query: string, parameters?: ParameterSet) {
  const placeholderCount = getPlaceholderCount(query);

  if (parameters == null) {
    return placeholderCount > 0 ? new Array<unknown>(placeholderCount).fill(null) : [];
  }

  if (Array.isArray(parameters)) {
    const normalized = [...parameters];

    if (placeholderCount > normalized.length) {
      normalized.push(...new Array<unknown>(placeholderCount - normalized.length).fill(null));
    }

    return normalized;
  }

  const normalized: unknown[] = new Array<unknown>(placeholderCount).fill(null);

  for (const [key, value] of Object.entries(parameters)) {
    assertNumericKey(key);
    normalized[Number.parseInt(key, 10) - 1] = value;
  }

  return normalized;
}

export function normalizeQuery(
  query: string,
  parameters?: ParameterSet,
  type?: QueryType
): NormalizedQuery {
  if (typeof query !== 'string') {
    throw new Error(`Expected query to be a string but received ${typeof query}.`);
  }

  const statementKind = getStatementKind(query);
  let text = query.trim();

  if (type === 'insert' && statementKind === 'insert' && !/\breturning\b/i.test(text)) {
    text = `${text} RETURNING id`;
  }

  return {
    text,
    values: normalizeParameters(text, parameters),
    placeholderCount: getPlaceholderCount(text),
    statementKind,
  };
}

export function normalizeBatchParameters(
  query: string,
  parameters?: ParameterSet | Array<Record<string, unknown> | unknown[]>
) {
  if (parameters == null) return [[]];

  if (Array.isArray(parameters)) {
    if (parameters.length === 0) return [[]];

    if (parameters.every((entry) => Array.isArray(entry) || isPlainObject(entry))) {
      return parameters.map((entry) => normalizeParameters(query, entry as ParameterSet));
    }

    return [normalizeParameters(query, parameters)];
  }

  return [normalizeParameters(query, parameters)];
}

function isTransactionObject(
  query: string | { query: string; parameters?: ParameterSet; values?: ParameterSet }
): query is { query: string; parameters?: ParameterSet; values?: ParameterSet } {
  return typeof query === 'object' && query !== null && 'query' in query;
}

export function normalizeTransactionQueries(queries: TransactionQuery, parameters?: ParameterSet) {
  if (!Array.isArray(queries)) {
    throw new Error(`Transaction queries must be an array, received "${typeof queries}".`);
  }

  return queries.map((entry) => {
    if (Array.isArray(entry)) {
      return normalizeQuery(entry[0], entry[1]);
    }

    if (isTransactionObject(entry)) {
      return normalizeQuery(entry.query, entry.parameters ?? entry.values);
    }

    return normalizeQuery(entry, parameters);
  });
}

export function coercePreparedResult(result: Array<Record<string, unknown>>) {
  const firstRow = result[0];
  if (!firstRow) return null;

  const values = Object.values(firstRow);
  return values.length === 1 ? values[0] : firstRow;
}
