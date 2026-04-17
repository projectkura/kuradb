import { KURADB_RESOURCE_NAME } from '../config';
import { rawQuery } from '../database';
import type { QueryType } from '../types';

export function executeQuery(
  type: 'query' | 'single' | 'scalar' | 'update' | 'insert',
  sql: string,
  parameters: unknown[]
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const queryType: QueryType = type === 'query' ? null : type;
    void rawQuery(
      queryType,
      KURADB_RESOURCE_NAME,
      sql,
      parameters,
      (result: unknown, err?: string) => {
        if (err) return reject(new Error(err));
        resolve(result);
      },
      true
    );
  });
}
