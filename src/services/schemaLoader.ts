import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import type { SchemaDefinition } from '../orm';

const SCHEMA_EXPORT_NAME = 'schema';

export function getSchemaPath(basePath: string): string {
  return join(basePath, 'schema.ts');
}

export function loadSchema(basePath: string): SchemaDefinition {
  const schemaPath = getSchemaPath(basePath);

  if (!existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}. Create it and export "schema".`);
  }

  const source = readFileSync(schemaPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2023,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      resolveJsonModule: true,
    },
    fileName: schemaPath,
    reportDiagnostics: true,
  });

  if (transpiled.diagnostics?.length) {
    const diagnostics = ts.formatDiagnosticsWithColorAndContext(transpiled.diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => dirname(schemaPath),
      getNewLine: () => '\n',
    });

    throw new Error(`Failed to transpile schema.ts:\n${diagnostics}`);
  }

  const moduleRecord = { exports: {} as Record<string, unknown> };
  const requireFromSchema = createRequire(schemaPath);

  try {
    const evaluateModule = new Function(
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
      transpiled.outputText
    ) as (
      exports: Record<string, unknown>,
      require: NodeRequire,
      module: { exports: Record<string, unknown> },
      __filename: string,
      __dirname: string
    ) => void;

    evaluateModule(
      moduleRecord.exports,
      requireFromSchema,
      moduleRecord,
      schemaPath,
      dirname(schemaPath)
    );
  } catch (err) {
    throw new Error(
      `Failed to evaluate ${schemaPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const schema = moduleRecord.exports[SCHEMA_EXPORT_NAME] as SchemaDefinition | undefined;

  if (
    !schema ||
    typeof schema !== 'object' ||
    !schema.tables ||
    typeof schema.tables !== 'object'
  ) {
    throw new Error(`Schema file must export a "${SCHEMA_EXPORT_NAME}" schema definition.`);
  }

  return schema;
}
