import { parseGenerateCommandArgs } from '../commandParsing';
import { KURADB_RESOURCE_NAME } from '../config';
import type { SchemaDefinition } from '../orm';
import { defineColumn, defineTable } from '../orm';
import { db } from '../queryBuilder';
import { executeQuery } from '../queryBuilder/execute';
import { eq, lt } from '../queryBuilder/operators';
import { schema } from '../schema';
import {
  applyPendingMigrations,
  generateMigrationArtifacts,
  generateSchemaTypes,
} from '../services/migrationRunner';
import { getAllMigrations } from '../services/migrationService';

RegisterCommand(
  'kuradb',
  (source: number, args: string[]) => {
    if (source !== 0) {
      return console.log('^3This command can only be run server side^0');
    }

    switch (args[0]) {
      case 'generate':
        void handleGenerate(args.slice(1));
        break;
      case 'migrate':
        void handleMigrate();
        break;
      case 'benchmark':
        void handleBenchmark();
        break;
      default:
        console.log('^3Usage: kuradb <generate [name] [--types-only]|migrate|benchmark>^0');
    }
  },
  true
);

async function handleGenerate(args: string[]) {
  try {
    const basePath = GetResourcePath(KURADB_RESOURCE_NAME);
    const options = parseGenerateCommandArgs(args);

    if (options.typesOnly) {
      generateSchemaTypes(basePath, schema);
      console.log(`^2✓ Generated Lua types: ${basePath}/lib/schema.generated.lua^0`);
      updateSchemaRegistry(schema);
      console.log(`^2✓ Schema generated: ${Object.keys(schema.tables).length} tables ready^0`);
      return;
    }

    const result = generateMigrationArtifacts(basePath, schema, options.customName);

    if (result.created && result.migration) {
      console.log(`^2✓ Generated migration: ${result.migration.path}^0`);
      console.log(`^2✓ Updated journal: ${result.journalPath}^0`);
    } else {
      console.log('^3No schema changes detected. No new migration created.^0');
      console.log(`^2✓ Migration journal: ${result.journalPath}^0`);
    }
    console.log(`^2✓ Generated Lua types: ${basePath}/lib/schema.generated.lua^0`);

    updateSchemaRegistry(schema);

    console.log(`^2✓ Schema generated: ${Object.keys(schema.tables).length} tables ready^0`);
    if (result.created) {
      console.log('^3Run "kuradb migrate" to apply pending migration files^0');
    }
  } catch (err) {
    console.log(`^1✗ Generation failed: ${err}^0`);
  }
}

async function handleMigrate() {
  try {
    const basePath = GetResourcePath(KURADB_RESOURCE_NAME);
    const pending = await applyPendingMigrations(
      basePath,
      schema,
      (sql, parameters) => executeQuery('query', sql, parameters) as Promise<unknown>,
      {
        onBeforeApply: (items) => {
          console.log(`^3Applying ${items.length} migration file(s)...^0`);
        },
        onMigrationApplied: (migration) => {
          console.log(`^2✓ Applied ${migration.filename}^0`);
        },
      }
    );

    if (pending.length === 0) {
      console.log('^3No pending migrations. Run "kuradb generate" if you changed the schema.^0');
      return;
    }

    console.log('^2✓ Updated Lua types^0');

    emit('kuradb:schemaMigrated', schema);

    console.log('^2✓ Migration complete^0');
  } catch (err) {
    console.log(`^1✗ Migration failed: ${err}^0`);
  }
}

function updateSchemaRegistry(schemaDef: SchemaDefinition) {
  global.exports('getSchema', () => schemaDef);
  global.exports('getMigrations', () => getAllMigrations(GetResourcePath(KURADB_RESOURCE_NAME)));
}

const benchTable = defineTable('public', 'bench_orm', {
  id: defineColumn('id', 'number', { primaryKey: true }),
  username: defineColumn('username', 'string'),
  identifier: defineColumn('identifier', 'string'),
});

async function timed<T>(label: string, fn: () => PromiseLike<T> | Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  console.log(`^2  ${label}: ${elapsed}ms^0`);
  return result;
}

async function handleBenchmark() {
  try {
    console.log('^3=== kuradb ORM Benchmark ===^0');
    console.log('');

    // 1. Setup: create table using raw SQL (DDL isn't part of the query builder)
    await timed('Setup: DROP + CREATE bench_orm', async () => {
      await executeQuery('query', 'DROP TABLE IF EXISTS "public"."bench_orm"', []);
      await executeQuery(
        'query',
        `CREATE TABLE "public"."bench_orm" (
          "id" SERIAL PRIMARY KEY,
          "username" VARCHAR(255) NOT NULL DEFAULT '',
          "identifier" VARCHAR(255) NOT NULL DEFAULT ''
        )`,
        []
      );
    });

    // 2. INSERT — single row via query builder
    const insertedId = Number(
      await timed('Insert: single row', () =>
        db
          .insert(benchTable)
          .values({ username: 'orm_user_1', identifier: 'orm_id_1' })
          .returning(['id'])
      )
    );
    console.log(`    → inserted id: ${insertedId}`);

    // 3. INSERT — 100 rows via query builder (sequential)
    await timed('Insert: 100 rows (sequential builder)', async () => {
      for (let i = 2; i <= 101; i++) {
        await db
          .insert(benchTable)
          .values({ username: `orm_user_${i}`, identifier: `orm_id_${i}` });
      }
    });

    // 4. SELECT — all rows
    const allRows = await timed('Select: all rows', () => db.select().from(benchTable));
    console.log(`    → rows: ${(allRows as unknown[]).length}`);

    // 5. SELECT — with WHERE
    const filtered = await timed('Select: WHERE eq', () =>
      db.select().from(benchTable).where(eq('identifier', 'orm_id_50'))
    );
    console.log(`    → found: ${(filtered as unknown[]).length}`);

    // 6. SELECT — with WHERE + LIMIT + ORDER
    const paged = await timed('Select: WHERE lt + ORDER + LIMIT', () =>
      db
        .select({ id: 'id', username: 'username' })
        .from(benchTable)
        .where(lt('id', 50))
        .orderBy({ id: 'desc' })
        .limit(10)
    );
    console.log(`    → rows: ${(paged as unknown[]).length}`);

    // 7. UPDATE — single row
    await timed('Update: single row', () =>
      db.update(benchTable).set({ username: 'updated_user' }).where(eq('identifier', 'orm_id_1'))
    );

    // 8. UPDATE — bulk (all rows with id < 50)
    await timed('Update: bulk WHERE lt', () =>
      db.update(benchTable).set({ username: 'bulk_updated' }).where(lt('id', 50))
    );

    // 9. DELETE — single row
    await timed('Delete: single row', () =>
      db.delete(benchTable).where(eq('identifier', 'orm_id_101'))
    );

    // 10. DELETE — bulk
    await timed('Delete: bulk WHERE lt', () => db.delete(benchTable).where(lt('id', 20)));

    // 11. Verify remaining count
    const remainingRows = await timed('Select: rows remaining', () => db.select().from(benchTable));
    console.log(`    → remaining: ${(remainingRows as unknown[]).length}`);

    // 12. toSQL inspection (no execution)
    const { sql, parameters } = db
      .select({ id: 'id', username: 'username' })
      .from(benchTable)
      .where(eq('identifier', 'orm_id_50'))
      .orderBy({ id: 'desc' })
      .limit(5)
      .offset(0)
      .toSQL();
    console.log('');
    console.log('^3  toSQL() output:^0');
    console.log(`    SQL: ${sql}`);
    console.log(`    Params: ${JSON.stringify(parameters)}`);

    // Cleanup
    await timed('Cleanup: DROP bench_orm', async () => {
      await executeQuery('query', 'DROP TABLE IF EXISTS "public"."bench_orm"', []);
    });

    console.log('');
    console.log('^2=== Benchmark complete ===^0');
  } catch (err) {
    console.log(`^1✗ Benchmark failed: ${err}^0`);
  }
}
