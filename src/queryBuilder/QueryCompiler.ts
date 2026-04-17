import type { FilterExpression } from './operators';

export interface CompiledQuery {
  sql: string;
  parameters: unknown[];
}

export interface SelectQuery {
  type: 'select';
  select: string[];
  schema: string;
  table: string;
  where: FilterExpression | null;
  orderBy: Record<string, 'asc' | 'desc'>;
  limit?: number;
  offset?: number;
}

export interface InsertQuery {
  type: 'insert';
  schema: string;
  table: string;
  values: Record<string, unknown>;
  returning: string[] | null;
}

export interface UpdateQuery {
  type: 'update';
  schema: string;
  table: string;
  set: Record<string, unknown>;
  where: FilterExpression | null;
  returning: string[] | null;
}

export interface DeleteQuery {
  type: 'delete';
  schema: string;
  table: string;
  where: FilterExpression | null;
  returning: string[] | null;
}

export type QueryDefinition = SelectQuery | InsertQuery | UpdateQuery | DeleteQuery;

export class QueryCompiler {
  private paramIndex = 0;
  private parameters: unknown[] = [];

  compile(query: QueryDefinition): CompiledQuery {
    this.paramIndex = 0;
    this.parameters = [];

    const sql = this.buildSQL(query);
    return { sql, parameters: this.parameters };
  }

  private buildSQL(query: QueryDefinition): string {
    switch (query.type) {
      case 'select':
        return this.buildSelect(query);
      case 'insert':
        return this.buildInsert(query);
      case 'update':
        return this.buildUpdate(query);
      case 'delete':
        return this.buildDelete(query);
    }
  }

  private formatTable(schema: string, table: string): string {
    return `"${schema}"."${table}"`;
  }

  private buildSelect(query: SelectQuery): string {
    const parts: string[] = [];

    if (query.select.length > 0) {
      parts.push(`SELECT ${query.select.map((c) => `"${c}"`).join(', ')}`);
    } else {
      parts.push('SELECT *');
    }

    parts.push(`FROM ${this.formatTable(query.schema, query.table)}`);

    if (query.where) {
      parts.push(`WHERE ${this.buildCondition(query.where)}`);
    }

    if (Object.keys(query.orderBy).length > 0) {
      const orders = Object.entries(query.orderBy)
        .map(([col, dir]) => `"${col}" ${dir.toUpperCase()}`)
        .join(', ');
      parts.push(`ORDER BY ${orders}`);
    }

    if (query.limit !== undefined) {
      parts.push(`LIMIT $${++this.paramIndex}`);
      this.parameters.push(query.limit);
    }

    if (query.offset !== undefined) {
      parts.push(`OFFSET $${++this.paramIndex}`);
      this.parameters.push(query.offset);
    }

    return parts.join(' ');
  }

  private buildInsert(query: InsertQuery): string {
    const cols = Object.keys(query.values);
    const vals = cols.map(() => `$${++this.paramIndex}`);

    for (const col of cols) {
      this.parameters.push(query.values[col]);
    }

    let sql = `INSERT INTO ${this.formatTable(query.schema, query.table)} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')})`;

    if (query.returning) {
      sql += ` RETURNING ${query.returning.map((c) => (c === '*' ? '*' : `"${c}"`)).join(', ')}`;
    }

    return sql;
  }

  private buildUpdate(query: UpdateQuery): string {
    const sets = Object.entries(query.set)
      .map(([col, val]) => {
        this.parameters.push(val);
        return `"${col}" = $${++this.paramIndex}`;
      })
      .join(', ');

    let sql = `UPDATE ${this.formatTable(query.schema, query.table)} SET ${sets}`;

    if (query.where) {
      sql += ` WHERE ${this.buildCondition(query.where)}`;
    }

    if (query.returning) {
      sql += ` RETURNING ${query.returning.map((c) => (c === '*' ? '*' : `"${c}"`)).join(', ')}`;
    }

    return sql;
  }

  private buildDelete(query: DeleteQuery): string {
    let sql = `DELETE FROM ${this.formatTable(query.schema, query.table)}`;

    if (query.where) {
      sql += ` WHERE ${this.buildCondition(query.where)}`;
    }

    if (query.returning) {
      sql += ` RETURNING ${query.returning.map((c) => (c === '*' ? '*' : `"${c}"`)).join(', ')}`;
    }

    return sql;
  }

  private buildCondition(condition: FilterExpression): string {
    switch (condition.type) {
      case 'comparison': {
        this.parameters.push(condition.value);
        return `"${condition.column}" ${condition.operator} $${++this.paramIndex}`;
      }

      case 'like': {
        this.parameters.push(condition.value);
        return `"${condition.column}" LIKE $${++this.paramIndex}`;
      }

      case 'ilike': {
        this.parameters.push(condition.value);
        return `"${condition.column}" ILIKE $${++this.paramIndex}`;
      }

      case 'in': {
        const values = condition.value as unknown[];
        const placeholders = values.map((v) => {
          this.parameters.push(v);
          return `$${++this.paramIndex}`;
        });
        return `"${condition.column}" IN (${placeholders.join(', ')})`;
      }

      case 'notIn': {
        const values = condition.value as unknown[];
        const placeholders = values.map((v) => {
          this.parameters.push(v);
          return `$${++this.paramIndex}`;
        });
        return `"${condition.column}" NOT IN (${placeholders.join(', ')})`;
      }

      case 'isNull':
        return `"${condition.column}" IS NULL`;

      case 'isNotNull':
        return `"${condition.column}" IS NOT NULL`;

      case 'and': {
        const conditions = (condition.value as FilterExpression[])
          .map((c) => `(${this.buildCondition(c)})`)
          .join(' AND ');
        return conditions;
      }

      case 'or': {
        const conditions = (condition.value as FilterExpression[])
          .map((c) => `(${this.buildCondition(c)})`)
          .join(' OR ');
        return conditions;
      }

      case 'not':
        return `NOT (${this.buildCondition(condition.value as FilterExpression)})`;

      default:
        throw new Error(`Unknown condition type: ${condition.type}`);
    }
  }
}
