import { join } from 'node:path';
import type { SchemaDefinition } from '../orm';
import {
  createMigrationFromSchema,
  getPendingMigrations,
  type MigrationFile,
  type MigrationSqlExecutor,
  recordAppliedMigration,
} from './migrationService';
import { generateLuaTypes } from './typeGenerator';

export type { MigrationSqlExecutor } from './migrationService';

export interface ApplyMigrationCallbacks {
  onBeforeApply?: (pending: MigrationFile[]) => void | Promise<void>;
  onMigrationApplied?: (migration: MigrationFile) => void | Promise<void>;
}

export function getSchemaGeneratedLuaPath(basePath: string): string {
  return join(basePath, 'lib/schema.generated.lua');
}

export function generateMigrationArtifacts(
  basePath: string,
  schema: SchemaDefinition,
  customName?: string
) {
  const result = createMigrationFromSchema(basePath, schema, customName);
  generateSchemaTypes(basePath, schema);
  return result;
}

export function generateSchemaTypes(basePath: string, schema: SchemaDefinition) {
  generateLuaTypes(schema, getSchemaGeneratedLuaPath(basePath));
}

export async function applyPendingMigrations(
  basePath: string,
  schema: SchemaDefinition,
  sqlExecutor: MigrationSqlExecutor,
  callbacks: ApplyMigrationCallbacks = {}
) {
  const pending = await getPendingMigrations(basePath, sqlExecutor);

  if (pending.length === 0) {
    return pending;
  }

  await callbacks.onBeforeApply?.(pending);

  for (const migration of pending) {
    await sqlExecutor(migration.sql, []);
    await recordAppliedMigration(migration, sqlExecutor);
    await callbacks.onMigrationApplied?.(migration);
  }

  generateSchemaTypes(basePath, schema);
  return pending;
}
