export {};

const assertQueryBuilder = require('node:assert/strict');
const { readFileSync: readFileSyncQueryBuilder } = require('node:fs');
const { join: joinQueryBuilder } = require('node:path');
const { test: testQueryBuilder } = require('node:test');
const { LuaFactory } = require('wasmoon');

const queryBuilderSource = readFileSyncQueryBuilder(
  joinQueryBuilder(__dirname, '..', '..', 'lib', 'QueryBuilder.lua'),
  'utf8'
);

const prelude = `
exports = { kuradb = {} }
GetCurrentResourceName = function() return 'test-resource' end
promise = {
  new = function()
    return {
      resolve = function() end,
      reject = function() end,
    }
  end
}
Citizen = {
  Await = function(value) return value end,
}
`;

const schemaSetup = `
kura.db.tables = {
  users = {
    schema = 'public',
    name = 'users',
    columns = {
      id = 'id',
      username = 'username',
      createdAt = 'created_at',
      snakeCase = 'snake_case',
    },
    columnOrder = { 'id', 'username', 'createdAt', 'snakeCase' },
    columnRefs = {
      id = { schema = 'public', table = 'users', luaName = 'id', sqlName = 'id' },
      username = { schema = 'public', table = 'users', luaName = 'username', sqlName = 'username' },
      createdAt = { schema = 'public', table = 'users', luaName = 'createdAt', sqlName = 'created_at' },
      snakeCase = { schema = 'public', table = 'users', luaName = 'snakeCase', sqlName = 'snake_case' },
    },
    primaryKey = { 'id' },
  },
  weird = {
    schema = 'pub"lic',
    name = 'wei"rd',
    columns = {
      ['weirdAlias'] = 'weird"name',
    },
    columnOrder = { 'weirdAlias' },
    columnRefs = {
      ['weirdAlias'] = {
        schema = 'pub"lic',
        table = 'wei"rd',
        luaName = 'weird"Alias',
        sqlName = 'weird"name',
      },
    },
    primaryKey = {},
  },
}

kura.db.tables.users.id = kura.db.tables.users.columnRefs.id
kura.db.tables.users.username = kura.db.tables.users.columnRefs.username
kura.db.tables.users.createdAt = kura.db.tables.users.columnRefs.createdAt
kura.db.tables.users.snakeCase = kura.db.tables.users.columnRefs.snakeCase
kura.db.tables.weird.weirdAlias = kura.db.tables.weird.columnRefs.weirdAlias
`;

async function withLua<T>(snippet: string): Promise<T> {
  const factory = new LuaFactory();
  const lua = await factory.createEngine();

  try {
    await lua.doString(prelude);
    await lua.doString(queryBuilderSource);
    await lua.doString(schemaSetup);
    return (await lua.doString(snippet)) as T;
  } finally {
    await lua.global.close();
  }
}

testQueryBuilder(
  'QueryBuilder Lua runtime quotes normal and snake_case identifiers safely',
  async () => {
    const result = await withLua<{ sql: string; params: unknown[] }>(`
      local users = kura.db.tables.users
      local sql, params = kura.db.select({ users.id, users.snakeCase })
        :from(users)
        :where(op.eq('snake_case', 'value'))
        :toSQL()
      return { sql = sql, params = params }
    `);

    assertQueryBuilder.equal(
      result.sql,
      'SELECT "id" AS "id", "snake_case" AS "snakeCase" FROM "public"."users" WHERE "snake_case" = $1'
    );
    assertQueryBuilder.deepEqual(result.params, ['value']);
  }
);

testQueryBuilder(
  'QueryBuilder Lua runtime maps camelCase generated refs to snake_case SQL names and aliases results back',
  async () => {
    const result = await withLua<{ sql: string; params: unknown[] }>(`
      local users = kura.db.tables.users
      local sql, params = kura.db.select({ users.createdAt })
        :from(users)
        :where(op.eq(users.createdAt, 42))
        :toSQL()
      return { sql = sql, params = params }
    `);

    assertQueryBuilder.equal(
      result.sql,
      'SELECT "created_at" AS "createdAt" FROM "public"."users" WHERE "created_at" = $1'
    );
    assertQueryBuilder.deepEqual(result.params, [42]);
  }
);

testQueryBuilder(
  'QueryBuilder Lua runtime escapes embedded double quotes in generated refs, tables, and aliases',
  async () => {
    const result = await withLua<{ sql: string }>(`
      local weird = kura.db.tables.weird
      local sql = kura.db.select({ weird.weirdAlias })
        :from(weird)
        :toSQL()
      return { sql = sql }
    `);

    assertQueryBuilder.equal(
      result.sql,
      'SELECT "weird""name" AS "weird""Alias" FROM "pub""lic"."wei""rd"'
    );
  }
);

testQueryBuilder(
  'QueryBuilder Lua runtime quotes string-based compatibility inputs instead of treating them as raw SQL',
  async () => {
    const result = await withLua<{ sql: string; params: unknown[] }>(`
      local sql, params = kura.db.select({ 'user"name' })
        :from('weird"table')
        :where(op.eq('user"name', 7))
        :orderBy({ ['user"name'] = 'desc' })
        :toSQL()
      return { sql = sql, params = params }
    `);

    assertQueryBuilder.equal(
      result.sql,
      'SELECT "user""name" FROM "public"."weird""table" WHERE "user""name" = $1 ORDER BY "user""name" DESC'
    );
    assertQueryBuilder.deepEqual(result.params, [7]);
  }
);

testQueryBuilder(
  'QueryBuilder Lua runtime quotes malicious-looking identifier input as an identifier',
  async () => {
    const result = await withLua<{ sql: string }>(`
      local sql = kura.db.select({ 'id"; DROP TABLE users; --' })
        :from('users"; DROP TABLE users; --')
        :toSQL()
      return { sql = sql }
    `);

    assertQueryBuilder.equal(
      result.sql,
      'SELECT "id""; DROP TABLE users; --" FROM "public"."users""; DROP TABLE users; --"'
    );
  }
);

testQueryBuilder(
  'QueryBuilder Lua runtime compiles exists() to an EXISTS query without selecting full row columns',
  async () => {
    const result = await withLua<{ sql: string; params: unknown[] }>(`
      local users = kura.db.tables.users
      local sql, params = kura.db.select({ users.id, users.createdAt, users.username })
        :from(users)
        :where(op.eq(users.id, 5))
        :exists()
        :toSQL()
      return { sql = sql, params = params }
    `);

    assertQueryBuilder.equal(
      result.sql,
      'SELECT EXISTS(SELECT 1 FROM "public"."users" WHERE "id" = $1 LIMIT 1) AS "exists"'
    );
    assertQueryBuilder.deepEqual(result.params, [5]);
    assertQueryBuilder.ok(!result.sql.includes('"created_at" AS "createdAt"'));
    assertQueryBuilder.ok(!result.sql.includes('"username" AS "username"'));
  }
);

testQueryBuilder('QueryBuilder Lua runtime returns a boolean for exists()', async () => {
  const result = await withLua<{ hasRows: boolean; noRows: boolean }>(`
      local users = kura.db.tables.users
      local txTrue = kura.db._createTransactionContext(function(method, sql, params)
        return { { exists = true } }
      end)
      local txFalse = kura.db._createTransactionContext(function(method, sql, params)
        return { { exists = false } }
      end)

      local hasRows = txTrue.select():from(users):exists():await()
      local noRows = txFalse.select():from(users):exists():await()

      return {
        hasRows = hasRows,
        noRows = noRows,
      }
    `);

  assertQueryBuilder.equal(result.hasRows, true);
  assertQueryBuilder.equal(result.noRows, false);
});

testQueryBuilder(
  'QueryBuilder Lua runtime allows forUpdate() inside a transaction-bound builder context',
  async () => {
    const result = await withLua<{ sql: string; id: number }>(`
      local users = kura.db.tables.users
      local tx = kura.db._createTransactionContext(function(method, sql, params)
        return { { id = 1 } }
      end)

      local sqlBuilder = tx.select({ users.id })
        :from(users)
        :where(op.eq(users.id, 1))
        :forUpdate()

      local builder = tx.select({ users.id })
        :from(users)
        :where(op.eq(users.id, 1))
        :forUpdate()
        :single()

      local sql = select(1, sqlBuilder:toSQL())
      local row = builder:await()

      return { sql = sql, id = row.id }
    `);

    assertQueryBuilder.equal(
      result.sql,
      'SELECT "id" AS "id" FROM "public"."users" WHERE "id" = $1 FOR UPDATE'
    );
    assertQueryBuilder.equal(result.id, 1);
  }
);

testQueryBuilder(
  'QueryBuilder Lua runtime errors when forUpdate() is used outside a transaction context',
  async () => {
    const result = await withLua<{ ok: boolean; err: string }>(`
      local users = kura.db.tables.users
      local ok, err = pcall(function()
        kura.db.select()
          :from(users)
          :forUpdate()
          :await()
      end)

      return {
        ok = ok,
        err = err,
      }
    `);

    assertQueryBuilder.equal(result.ok, false);
    assertQueryBuilder.match(result.err, /forUpdate\(\) requires a transaction context/);
  }
);

testQueryBuilder(
  'QueryBuilder Lua runtime quotes returning identifiers safely and returningValue() is scalar-oriented',
  async () => {
    const result = await withLua<{ sql: string; value: string }>(`
      local weird = kura.db.tables.weird
      local tx = kura.db._createTransactionContext(function(method, sql, params)
        return { { ['weird"Alias'] = 'ok' } }
      end)

      local sqlBuilder = tx.insert(weird)
        :values({ weirdAlias = 'value' })
        :returningValue(weird.weirdAlias)

      local sql = select(1, sqlBuilder:toSQL())
      local value = sqlBuilder:await()

      return { sql = sql, value = value }
    `);

    assertQueryBuilder.equal(
      result.sql,
      'INSERT INTO "pub""lic"."wei""rd" ("weird""name") VALUES ($1) RETURNING "weird""name" AS "weird""Alias"'
    );
    assertQueryBuilder.equal(result.value, 'ok');
  }
);
