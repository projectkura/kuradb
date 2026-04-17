export type ColumnKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'json'
  | 'uuid'
  | 'bigint'
  | 'custom';

export interface ColumnDefinition<TValue = unknown> {
  name: string;
  kind: ColumnKind;
  nullable?: boolean;
  primaryKey?: boolean;
  defaultExpression?: string;
  encode?: (value: TValue) => unknown;
  decode?: (value: unknown) => TValue;
}

export interface TableDefinition<
  TColumns extends Record<string, ColumnDefinition> = Record<string, ColumnDefinition>,
> {
  schema: string;
  name: string;
  columns: TColumns;
  primaryKey: Array<keyof TColumns & string>;
}

export interface SchemaDefinition<
  TTables extends Record<string, TableDefinition<any>> = Record<string, TableDefinition<any>>,
> {
  name: string;
  tables: TTables;
}

export function defineColumn<TValue>(
  name: string,
  kind: ColumnKind,
  options: Omit<ColumnDefinition<TValue>, 'name' | 'kind'> = {}
): ColumnDefinition<TValue> {
  return {
    name,
    kind,
    ...options,
  };
}

export function defineTable<TColumns extends Record<string, ColumnDefinition>>(
  schema: string,
  name: string,
  columns: TColumns
): TableDefinition<TColumns> {
  const primaryKey = Object.entries(columns)
    .filter(([, column]) => column.primaryKey)
    .map(([key]) => key as keyof TColumns & string);

  return {
    schema,
    name,
    columns,
    primaryKey,
  };
}

export function defineSchema<TTables extends Record<string, TableDefinition<any>>>(
  name: string,
  tables: TTables
): SchemaDefinition<TTables> {
  return {
    name,
    tables,
  };
}
