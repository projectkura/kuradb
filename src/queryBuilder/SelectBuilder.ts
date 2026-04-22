import type { TableDefinition } from '../orm';
import { executeQuery } from './execute';
import type { FilterExpression } from './operators';
import { QueryCompiler } from './QueryCompiler';

export class SelectBuilder implements PromiseLike<unknown[]> {
  private _select: string[] = [];
  private _schema = '';
  private _table = '';
  private _where: FilterExpression | null = null;
  private _orderBy: Record<string, 'asc' | 'desc'> = {};
  private _limit?: number;
  private _offset?: number;

  constructor(columns?: Record<string, string> | null) {
    if (columns) {
      this._select = Object.values(columns);
    }
  }

  from(table: TableDefinition<any> | string): this {
    if (typeof table === 'string') {
      this._schema = 'public';
      this._table = table;
      return this;
    }

    this._schema = table.schema;
    this._table = table.name;
    return this;
  }

  where(condition: FilterExpression): this {
    this._where = condition;
    return this;
  }

  orderBy(orderBy: Record<string, 'asc' | 'desc'>): this {
    this._orderBy = orderBy;
    return this;
  }

  limit(limit: number): this {
    this._limit = limit;
    return this;
  }

  offset(offset: number): this {
    this._offset = offset;
    return this;
  }

  toSQL(): { sql: string; parameters: unknown[] } {
    const compiler = new QueryCompiler();
    return compiler.compile({
      type: 'select',
      select: this._select,
      schema: this._schema,
      table: this._table,
      where: this._where,
      orderBy: this._orderBy,
      limit: this._limit,
      offset: this._offset,
    });
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const { sql, parameters } = this.toSQL();
    return (executeQuery('query', sql, parameters) as Promise<unknown[]>).then(
      onfulfilled,
      onrejected
    );
  }
}
