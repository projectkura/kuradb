export type QueryType = 'insert' | 'update' | 'scalar' | 'single' | null;

export type ParameterSet = Record<string, unknown> | unknown[] | null | undefined;
export type BatchParameters = Array<Record<string, unknown> | unknown[]> | null | undefined;
export type CFXParameters = ParameterSet | BatchParameters;

export interface TransactionRequest {
  query: string;
  parameters?: ParameterSet;
  values?: ParameterSet;
}

export type TransactionQuery = string[] | [string, ParameterSet][] | TransactionRequest[];

export type CFXCallback = (result: unknown, err?: string) => void;

export type StatementKind = 'insert' | 'update' | 'delete' | 'select' | 'other';
export type TransactionIsolationLevel =
  | 'READ COMMITTED'
  | 'READ UNCOMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

export interface QueryMetadata {
  text: string;
  trimmedText: string;
  placeholderCount: number;
  statementKind: StatementKind;
  hasReturning: boolean;
}

export interface NormalizedQuery extends QueryMetadata {
  values: unknown[];
}

export interface TransactionOptions {
  isolationLevel?: TransactionIsolationLevel;
  readOnly?: boolean;
  deferrable?: boolean;
  prepare?: boolean;
  pipeline?: boolean;
}

export interface BatchOptions extends TransactionOptions {
  transactional?: boolean;
}

export interface InsertManyOptions {
  columns?: string[];
  returning?: false | string | string[];
  chunkSize?: number;
}

export type QueryRow = Record<string, unknown>;

export type QueryResult<T extends QueryRow = QueryRow> = T[] & {
  command?: string;
  count?: number | null;
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

export type CopyChunk = string | Uint8Array;
export type CopyInput = CopyChunk | CopyChunk[];

export interface CopyOptions {
  format?: 'text' | 'csv' | 'binary';
  encoding?: BufferEncoding;
}

export interface CopyResult {
  bytes: number;
  chunks: number;
}

export interface ListenOptions {
  onListen?: () => void;
}

export interface ListenSubscription {
  id: number;
  channel: string;
  resource: string;
}

export interface CursorOptions {
  batchSize?: number;
}
