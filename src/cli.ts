import pg from 'pg';
import { parseGenerateCommandArgs } from './commandParsing';
import { schema } from './schema';
import {
  applyPendingMigrations,
  generateMigrationArtifacts,
  generateSchemaTypes,
  type MigrationSqlExecutor,
} from './services/migrationRunner';
import { isMinimumVersion } from './utils/versions';

const KURADB_MINIMUM_POSTGRES_VERSION = '17.0.0';

const command = process.argv[2];
const commandArgs = process.argv.slice(3);

void main();

async function main() {
  try {
    switch (command) {
      case 'generate':
        await handleGenerate(commandArgs);
        break;
      case 'migrate':
        await handleMigrate();
        break;
      case undefined:
      case '--help':
      case '-h':
        printUsage();
        break;
      default:
        console.log(`Unknown command: ${command}`);
        printUsage();
        process.exitCode = 1;
        break;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

async function handleGenerate(args: string[]) {
  const options = parseGenerateCommandArgs(args);
  const basePath = process.cwd();

  if (options.typesOnly) {
    generateSchemaTypes(basePath, schema);
    console.log(`Generated Lua types: ${basePath}/lib/schema.generated.lua`);
    console.log(`Schema generated: ${Object.keys(schema.tables).length} tables ready`);
    return;
  }

  const result = generateMigrationArtifacts(basePath, schema, options.customName);

  if (result.created && result.migration) {
    console.log(`Generated migration: ${result.migration.path}`);
    console.log(`Updated journal: ${result.journalPath}`);
  } else {
    console.log('No schema changes detected. No new migration created.');
    console.log(`Migration journal: ${result.journalPath}`);
  }

  console.log(`Generated Lua types: ${basePath}/lib/schema.generated.lua`);
  console.log(`Schema generated: ${Object.keys(schema.tables).length} tables ready`);

  if (result.created) {
    console.log('Run "kuradb migrate" to apply pending migration files');
  }
}

async function handleMigrate() {
  const basePath = process.cwd();
  const connectionString = getConnectionString();
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 10000,
  });

  const sqlExecutor: MigrationSqlExecutor = async (sql, parameters) => {
    const result = await pool.query(sql, parameters);
    return result.rows as unknown[];
  };

  try {
    await assertMinimumPostgresVersion(pool);

    const pending = await applyPendingMigrations(basePath, schema, sqlExecutor, {
      onBeforeApply: (items) => {
        console.log(`Applying ${items.length} migration file(s)...`);
      },
      onMigrationApplied: (migration) => {
        console.log(`Applied ${migration.filename}`);
      },
    });

    if (pending.length === 0) {
      console.log('No pending migrations. Run "kuradb generate" if you changed the schema.');
      return;
    }

    console.log('Updated Lua types');
    console.log('Migration complete');
  } finally {
    await pool.end().catch(() => {});
  }
}

function getConnectionString() {
  const connectionString =
    process.env.KURADB_CONNECTION_STRING?.trim() ??
    process.env.kuradb_connection_string?.trim() ??
    process.env.DATABASE_URL?.trim() ??
    '';

  if (!connectionString) {
    throw new Error(
      'Set KURADB_CONNECTION_STRING before running kuradb migrate from the command line.'
    );
  }

  return connectionString;
}

async function assertMinimumPostgresVersion(pool: pg.Pool) {
  const versionResult = await pool.query('SHOW server_version');
  const version = String(versionResult.rows[0]?.server_version ?? '0.0.0');

  if (!isMinimumVersion(version, KURADB_MINIMUM_POSTGRES_VERSION)) {
    throw new Error(
      `PostgreSQL ${version} is not supported. kuradb requires PostgreSQL ${KURADB_MINIMUM_POSTGRES_VERSION}+.`
    );
  }
}

function printUsage() {
  console.log('Usage: kuradb <generate [name] [--types-only]|migrate>');
}
