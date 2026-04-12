import type {
  InsertManyOptions,
  NormalizedQuery,
  ParameterSet,
  QueryMetadata,
  QueryType,
  StatementKind,
  TransactionQuery,
  TransactionRequest,
} from '../types';

const queryMetadataCache = new Map<string, QueryMetadata>();
const IDENTIFIER_PART = /^[A-Za-z_][A-Za-z0-9_$]*$/;

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

function parseStatementKind(query: string): StatementKind {
  const trimmedQuery = query.trim().toUpperCase();
  if (trimmedQuery.startsWith('INSERT')) return 'insert';
  if (trimmedQuery.startsWith('UPDATE')) return 'update';
  if (trimmedQuery.startsWith('DELETE')) return 'delete';
  if (trimmedQuery.startsWith('SELECT') || trimmedQuery.startsWith('WITH')) return 'select';
  return 'other';
}

function parsePlaceholderCount(query: string) {
  const matches = query.match(/\$(\d+)/g) ?? [];
  return matches.reduce((max, match) => {
    const index = Number.parseInt(match.slice(1), 10);
    return Number.isNaN(index) ? max : Math.max(max, index);
  }, 0);
}

export function getQueryMetadata(query: string): QueryMetadata {
  const cached = queryMetadataCache.get(query);
  if (cached) return cached;

  const trimmedText = query.trim();
  const metadata: QueryMetadata = {
    text: query,
    trimmedText,
    placeholderCount: parsePlaceholderCount(trimmedText),
    statementKind: parseStatementKind(trimmedText),
    hasReturning: /\breturning\b/i.test(trimmedText),
  };

  queryMetadataCache.set(query, metadata);
  return metadata;
}

export function getStatementKind(query: string): StatementKind {
  return getQueryMetadata(query).statementKind;
}

export function getPlaceholderCount(query: string) {
  return getQueryMetadata(query).placeholderCount;
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

  const metadata = getQueryMetadata(query);
  let text = metadata.trimmedText;

  if (type === 'insert' && metadata.statementKind === 'insert' && !metadata.hasReturning) {
    text = `${text} RETURNING id`;
  }

  const finalMetadata = text === metadata.trimmedText ? metadata : getQueryMetadata(text);

  return {
    ...finalMetadata,
    text,
    values: normalizeParameters(text, parameters),
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

function isTransactionObject(query: unknown): query is TransactionRequest {
  return typeof query === 'object' && query !== null && 'query' in query;
}

type TransactionEntry = string | [string, ParameterSet] | TransactionRequest;

function normalizeTransactionQueryList(
  queries: TransactionQuery | Record<string, TransactionEntry>
): TransactionEntry[] {
  if (Array.isArray(queries)) return queries;

  if (isTransactionObject(queries)) {
    return [queries];
  }

  const numericEntries = Object.entries(queries).filter(([key]) => /^\d+$/.test(key));

  if (numericEntries.length > 0) {
    return numericEntries
      .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10))
      .map(([, value]) => value as TransactionEntry);
  }

  return Object.values(queries) as TransactionEntry[];
}

export function normalizeTransactionQueries(queries: any, parameters?: ParameterSet) {
  const queryList = normalizeTransactionQueryList(queries);

  return queryList.map((entry) => {
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

export function escapeIdentifier(identifier: string) {
  const parts = identifier.split('.');

  if (!parts.length || parts.some((part) => !IDENTIFIER_PART.test(part))) {
    throw new Error(`Invalid PostgreSQL identifier "${identifier}".`);
  }

  return parts.map((part) => `"${part}"`).join('.');
}

export function normalizeInsertRows(rows: Array<Record<string, unknown>>, options: InsertManyOptions = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('insertMany rows must be a non-empty array of objects.');
  }

  if (!rows.every(isPlainObject)) {
    throw new Error('insertMany rows must contain only plain objects.');
  }

  const columns = options.columns ?? Object.keys(rows[0]);

  if (columns.length === 0) {
    throw new Error('insertMany requires at least one target column.');
  }

  for (const row of rows) {
    for (const column of columns) {
      if (!(column in row)) {
        throw new Error(`insertMany row is missing column "${column}".`);
      }
    }
  }

  return { columns, rows };
}

export function buildInsertManyQuery(
  target: string,
  rows: Array<Record<string, unknown>>,
  options: InsertManyOptions = {}
) {
  const { columns, rows: normalizedRows } = normalizeInsertRows(rows, options);
  const table = escapeIdentifier(target);
  const quotedColumns = columns.map(escapeIdentifier).join(', ');
  const values: unknown[] = [];
  let placeholderOffset = 0;

  const valuesSql = normalizedRows
    .map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column]);
        placeholderOffset += 1;
        return `$${placeholderOffset}`;
      });

      return `(${placeholders.join(', ')})`;
    })
    .join(', ');

  let query = `INSERT INTO ${table} (${quotedColumns}) VALUES ${valuesSql}`;
  if (options.returning !== false) {
    if (!options.returning) {
      query += ' RETURNING id';
    } else if (Array.isArray(options.returning)) {
      query += ` RETURNING ${options.returning.map(escapeIdentifier).join(', ')}`;
    } else {
      query += ` RETURNING ${escapeIdentifier(options.returning)}`;
    }
  }

  return { query, values };
}
