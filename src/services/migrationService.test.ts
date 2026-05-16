export {};

const assertMigration = require('node:assert/strict');
const { test: testMigration } = require('node:test');
const { defineColumn, defineSchema, defineTable } = require('../orm/index.ts');
const { generateCreateTableSQL } = require('./migrationService.ts');

testMigration('generateCreateTableSQL maps kura column kinds into postgres types', () => {
  const table = defineTable('public', 'characters', {
    id: defineColumn('id', 'ulid', { primaryKey: true }),
    characterIndex: defineColumn('character_index', 'integer'),
    createdAt: defineColumn('created_at', 'timestamptz'),
    metadata: defineColumn('metadata', 'jsonb'),
  });

  const schema = defineSchema('public', {
    characters: table,
  });

  const sql = generateCreateTableSQL(schema.tables.characters);

  assertMigration.ok(sql.includes('"id" CHAR(26) PRIMARY KEY'));
  assertMigration.ok(sql.includes('"character_index" INTEGER NOT NULL'));
  assertMigration.ok(sql.includes('"created_at" TIMESTAMPTZ NOT NULL'));
  assertMigration.ok(sql.includes('"metadata" JSONB NOT NULL'));
});
