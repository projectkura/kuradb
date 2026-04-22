import type { TableDefinition } from '../orm';
import { DeleteBuilder } from './DeleteBuilder';
import { InsertBuilder } from './InsertBuilder';
import { SelectBuilder } from './SelectBuilder';
import { UpdateBuilder } from './UpdateBuilder';

function resolveTable(table: TableDefinition<any> | string): TableDefinition<any> {
  if (typeof table === 'string') {
    return {
      schema: 'public',
      name: table,
      columns: {},
      primaryKey: [],
    };
  }

  return table;
}

export class Database {
  select(columns?: Record<string, string> | null): SelectBuilder {
    return new SelectBuilder(columns);
  }

  insert(table: TableDefinition<any> | string): InsertBuilder {
    return new InsertBuilder(resolveTable(table));
  }

  update(table: TableDefinition<any> | string): UpdateBuilder {
    return new UpdateBuilder(resolveTable(table));
  }

  delete(table: TableDefinition<any> | string): DeleteBuilder {
    return new DeleteBuilder(resolveTable(table));
  }
}

export const db = new Database();
export const kura = { db };
