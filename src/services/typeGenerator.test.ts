const assertTypeGen = require('node:assert/strict');
const {
  mkdtempSync: mkdtempSyncTypeGen,
  readFileSync: readFileSyncTypeGen,
  rmSync: rmSyncTypeGen,
} = require('node:fs');
const { tmpdir: tmpdirTypeGen } = require('node:os');
const { join: joinTypeGen } = require('node:path');
const { test: testTypeGen } = require('node:test');
const { defineColumn, defineSchema, defineTable } = require('../orm/index.ts');
const { generateLuaTypes } = require('./typeGenerator.ts');

function withTempOutput(run: (outputPath: string) => void) {
  const tempDir = mkdtempSyncTypeGen(joinTypeGen(tmpdirTypeGen(), 'kuradb-typegen-'));
  const outputPath = joinTypeGen(tempDir, 'schema.generated.lua');

  try {
    run(outputPath);
  } finally {
    rmSyncTypeGen(tempDir, { recursive: true, force: true });
  }
}

testTypeGen('generateLuaTypes emits generated column refs and top-level aliases', () => {
  const schema = defineSchema('public', {
    characters: defineTable('public', 'characters', {
      id: defineColumn('id', 'uuid', { primaryKey: true }),
      ownerId: defineColumn('owner_id', 'uuid'),
      createdAt: defineColumn('created_at', 'date', { nullable: true }),
    }),
  });

  withTempOutput((outputPath) => {
    generateLuaTypes(schema, outputPath);

    const output = readFileSyncTypeGen(outputPath, 'utf8');

    assertTypeGen.ok(output.includes('---@class CharactersColumns'));
    assertTypeGen.ok(output.includes('columnRefs = {'));
    assertTypeGen.ok(output.includes("sqlName = 'owner_id'"));
    assertTypeGen.ok(output.includes('nullable = true'));
    assertTypeGen.ok(output.includes('---@field id KuraDBColumnRef<string>'));
    assertTypeGen.ok(output.includes('schema.characters.id = schema.characters.columnRefs.id'));
    assertTypeGen.ok(
      output.includes('schema.characters.createdAt = schema.characters.columnRefs.createdAt')
    );
  });
});

testTypeGen(
  'generateLuaTypes keeps reserved names under columnRefs without top-level aliases',
  () => {
    const schema = defineSchema('public', {
      weird: defineTable('public', 'weird', {
        schema: defineColumn('schema', 'string'),
        name: defineColumn('name', 'string'),
      }),
    });

    withTempOutput((outputPath) => {
      generateLuaTypes(schema, outputPath);

      const output = readFileSyncTypeGen(outputPath, 'utf8');

      assertTypeGen.ok(output.includes('schema = {'));
      assertTypeGen.ok(output.includes('name = {'));
      assertTypeGen.ok(!output.includes('schema.weird.schema = schema.weird.columnRefs.schema'));
      assertTypeGen.ok(!output.includes('schema.weird.name = schema.weird.columnRefs.name'));
    });
  }
);
