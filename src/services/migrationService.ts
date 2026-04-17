import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ColumnDefinition, ColumnKind, TableDefinition } from '../orm';

export interface Migration {
  version: number;
  description: string;
  up: string;
  down?: string;
}

let migrations: Migration[] = [];
let currentVersion = 0;

export function generateCreateTableSQL(table: TableDefinition<any>): string {
  const columns: string[] = [];

  for (const [, col] of Object.entries(table.columns) as [string, ColumnDefinition][]) {
    let colDef = `"${col.name}" ${mapColumnTypeToSQL(col.kind)}`;

    if (col.primaryKey) colDef += ' PRIMARY KEY';
    if (!col.nullable && !col.primaryKey) colDef += ' NOT NULL';
    if (col.defaultExpression) colDef += ` DEFAULT ${col.defaultExpression}`;

    columns.push(colDef);
  }

  return `CREATE TABLE IF NOT EXISTS "${table.schema}"."${table.name}" (\n  ${columns.join(',\n  ')}\n);`;
}

export function generateDropTableSQL(table: TableDefinition<any>): string {
  return `DROP TABLE IF EXISTS "${table.schema}"."${table.name}";`;
}

export function addMigration(description: string, up: string, down?: string): void {
  const version = migrations.length + 1;
  migrations.push({ version, description, up, down });
}

export function clearMigrations(): void {
  migrations = [];
}

export function getPendingMigrations(): Migration[] {
  return migrations.filter((m) => m.version > currentVersion);
}

export function getAllMigrations(): Migration[] {
  return migrations;
}

export function setCurrentVersion(version: number): void {
  currentVersion = version;
}

export function getCurrentVersion(): number {
  return currentVersion;
}

export function saveMigrationsToFile(outputPath: string): string {
  const pending = getPendingMigrations();

  const migrationSQL = [
    '-- Auto-generated migrations',
    `-- Generated at: ${new Date().toISOString()}`,
    `-- Apply migrations from version ${currentVersion + 1} onwards`,
    '',
    ...pending.map((m) => [`-- Migration v${m.version}: ${m.description}`, m.up, ''].join('\n')),
  ].join('\n');

  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(outputPath, migrationSQL);
  return outputPath;
}

function mapColumnTypeToSQL(kind: ColumnKind | string): string {
  const typeMap: Record<string, string> = {
    uuid: 'UUID',
    string: 'VARCHAR(255)',
    number: 'INTEGER',
    boolean: 'BOOLEAN',
    date: 'TIMESTAMP',
    json: 'JSONB',
    bigint: 'BIGINT',
    custom: 'TEXT',
  };

  return typeMap[kind] || 'TEXT';
}
