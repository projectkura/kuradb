import type { TableDefinition } from '../orm';
import { executeQuery } from './execute';
import type { FilterExpression } from './operators';
import { QueryCompiler } from './QueryCompiler';

export class DeleteBuilder implements PromiseLike<unknown> {
  private _schema: string;
  private _table: string;
  private _where: FilterExpression | null = null;
  private _returning: string[] | null = null;

  constructor(table: TableDefinition<any>) {
    this._schema = table.schema;
    this._table = table.name;
  }

  where(condition: FilterExpression): this {
    this._where = condition;
    return this;
  }

  returning(columns?: string[]): this {
    this._returning = columns || ['*'];
    return this;
  }

  toSQL(): { sql: string; parameters: unknown[] } {
    const compiler = new QueryCompiler();
    return compiler.compile({
      type: 'delete',
      schema: this._schema,
      table: this._table,
      where: this._where,
      returning: this._returning,
    });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const { sql, parameters } = this.toSQL();
    return executeQuery('update', sql, parameters).then(onfulfilled, onrejected);
  }
}
