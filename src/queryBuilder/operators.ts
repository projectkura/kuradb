export interface FilterExpression {
  type: string;
  column: string;
  value?: unknown;
  operator?: string;
}

export function eq(column: string, value: unknown): FilterExpression {
  return { type: 'comparison', column, operator: '=', value };
}

export function ne(column: string, value: unknown): FilterExpression {
  return { type: 'comparison', column, operator: '<>', value };
}

export function lt(column: string, value: unknown): FilterExpression {
  return { type: 'comparison', column, operator: '<', value };
}

export function lte(column: string, value: unknown): FilterExpression {
  return { type: 'comparison', column, operator: '<=', value };
}

export function gt(column: string, value: unknown): FilterExpression {
  return { type: 'comparison', column, operator: '>', value };
}

export function gte(column: string, value: unknown): FilterExpression {
  return { type: 'comparison', column, operator: '>=', value };
}

export function like(column: string, pattern: string): FilterExpression {
  return { type: 'like', column, value: pattern };
}

export function ilike(column: string, pattern: string): FilterExpression {
  return { type: 'ilike', column, value: pattern };
}

export function inArray(column: string, values: unknown[]): FilterExpression {
  return { type: 'in', column, value: values };
}

export function notInArray(column: string, values: unknown[]): FilterExpression {
  return { type: 'notIn', column, value: values };
}

export function isNull(column: string): FilterExpression {
  return { type: 'isNull', column };
}

export function isNotNull(column: string): FilterExpression {
  return { type: 'isNotNull', column };
}

export function and(...conditions: FilterExpression[]): FilterExpression {
  return { type: 'and', column: '', value: conditions };
}

export function or(...conditions: FilterExpression[]): FilterExpression {
  return { type: 'or', column: '', value: conditions };
}

export function not(condition: FilterExpression): FilterExpression {
  return { type: 'not', column: '', value: condition };
}
