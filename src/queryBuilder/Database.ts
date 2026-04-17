import type { TableDefinition } from '../orm';
import { DeleteBuilder } from './DeleteBuilder';
import { InsertBuilder } from './InsertBuilder';
import { SelectBuilder } from './SelectBuilder';
import { UpdateBuilder } from './UpdateBuilder';

export class Database {
  select(columns?: Record<string, string> | null): SelectBuilder {
    return new SelectBuilder(columns);
  }

  insert(table: TableDefinition<any>): InsertBuilder {
    return new InsertBuilder(table);
  }

  update(table: TableDefinition<any>): UpdateBuilder {
    return new UpdateBuilder(table);
  }

  delete(table: TableDefinition<any>): DeleteBuilder {
    return new DeleteBuilder(table);
  }
}

export const db = new Database();
