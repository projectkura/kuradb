export type QueryType = 'insert' | 'update' | 'scalar' | 'single' | null;

export type ParameterSet = Record<string, unknown> | unknown[] | null | undefined;
export type BatchParameters = Array<Record<string, unknown> | unknown[]> | null | undefined;
export type CFXParameters = ParameterSet | BatchParameters;

export type TransactionQuery =
  | string[]
  | [string, ParameterSet][]
  | {
      query: string;
      parameters?: ParameterSet;
      values?: ParameterSet;
    }[];

export type CFXCallback = (result: unknown, err?: string) => void;

export type StatementKind = 'insert' | 'update' | 'delete' | 'select' | 'other';

export interface NormalizedQuery {
  text: string;
  values: unknown[];
  placeholderCount: number;
  statementKind: StatementKind;
}

export type QueryRow = Record<string, unknown>;

export type QueryResult<T extends QueryRow = QueryRow> = T[] & {
  command?: string;
  count?: number | null;
  columns?: unknown[];
  statement?: unknown;
};

export interface QueryLogEntry {
  resource: string;
  query: string;
  parameters: unknown[];
  duration: number;
  rowCount: number;
  at: number;
}

export interface KuraDbDebugState {
  enabled: boolean | string[];
  slowQueryWarning: number;
  logSize: number;
  resultSetWarning: number;
}
