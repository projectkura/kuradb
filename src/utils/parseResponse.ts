import type { QueryResult, QueryRow, QueryType } from '../types';

export function parseResponse(type: QueryType, result: QueryResult<QueryRow>) {
  switch (type) {
    case 'insert': {
      const firstRow = result[0];
      if (!firstRow) return null;
      if ('id' in firstRow) return firstRow.id ?? null;
      const values = Object.values(firstRow);
      return values[0] ?? null;
    }

    case 'update':
      return result.count ?? result.length ?? 0;

    case 'single':
      return result[0] ?? null;

    case 'scalar': {
      const firstRow = result[0];
      return firstRow ? (Object.values(firstRow)[0] ?? null) : null;
    }

    default:
      return result ?? null;
  }
}
