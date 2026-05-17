export {};

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { LuaFactory } = require('wasmoon');

const kuraDbLuaSource = readFileSync(join(__dirname, '..', '..', 'lib', 'KuraDB.lua'), 'utf8');
const queryBuilderSource = readFileSync(
  join(__dirname, '..', '..', 'lib', 'QueryBuilder.lua'),
  'utf8'
);

const prelude = `
local state = {
  transactionSequence = 0,
  queries = {},
  finishes = {},
}

_G.__tx_state = state

exports = {
  kuradb = {
    beginLuaTransaction = function(_, options, cb)
      state.transactionSequence = state.transactionSequence + 1
      cb('session:' .. state.transactionSequence)
    end,
    stepLuaTransaction = function(_, sessionId, statement, values, cb)
      state.queries[#state.queries + 1] = {
        sessionId = sessionId,
        statement = statement,
        values = values,
      }

      if statement:find('SELECT', 1, true) == 1 then
        cb({
          { id = 'acct_1', balance = 100 }
        })
        return
      end

      cb({ count = 1 })
    end,
    finishLuaTransaction = function(_, sessionId, shouldCommit, payload, cb)
      state.finishes[#state.finishes + 1] = {
        sessionId = sessionId,
        shouldCommit = shouldCommit,
        payload = payload,
      }

      if shouldCommit then
        if payload == nil then
          cb(true)
        else
          cb(payload)
        end
        return
      end

      cb(false)
    end,
    awaitConnection = function()
      return true
    end,
  }
}

GetCurrentResourceName = function() return 'test-resource' end
GetResourceState = function(resourceName)
  if resourceName == 'kuradb' then
    return 'started'
  end

  return 'missing'
end

Wait = function() end

promise = {
  new = function()
    local state = { value = nil, error = nil }

    return {
      __state = state,
      resolve = function(self, value)
        state.value = value
      end,
      reject = function(self, err)
        state.error = err
      end,
    }
  end
}

Citizen = {
  Await = function(p)
    if p.__state.error ~= nil then
      error(p.__state.error)
    end

    return p.__state.value
  end,
  CreateThreadNow = function(fn)
    fn()
  end,
}
`;

const schemaSetup = `
kura.db.tables = {
  accounts = {
    schema = 'public',
    name = 'accounts',
    columns = {
      id = 'id',
      balance = 'balance',
    },
    columnOrder = { 'id', 'balance' },
    columnRefs = {
      id = { schema = 'public', table = 'accounts', luaName = 'id', sqlName = 'id' },
      balance = { schema = 'public', table = 'accounts', luaName = 'balance', sqlName = 'balance' },
    },
    primaryKey = { 'id' },
  },
}

kura.db.tables.accounts.id = kura.db.tables.accounts.columnRefs.id
kura.db.tables.accounts.balance = kura.db.tables.accounts.columnRefs.balance
`;

async function withLua<T>(snippet: string): Promise<T> {
  const factory = new LuaFactory();
  const lua = await factory.createEngine();

  try {
    await lua.doString(prelude);
    await lua.doString(kuraDbLuaSource);
    await lua.doString(queryBuilderSource);
    await lua.doString(schemaSetup);
    return (await lua.doString(snippet)) as T;
  } finally {
    await lua.global.close();
  }
}

test('KuraDB Lua transaction bridge returns callback payloads and supports tx builders', async () => {
  const result = await withLua<{
    id: string;
    balance: number;
    committed: boolean;
    sql: string;
  }>(`
    local accounts = kura.db.tables.accounts
    local value = kura.db.transaction.await(function(query, tx)
      local account = tx.select({ accounts.id, accounts.balance })
        :from(accounts)
        :where(op.eq(accounts.id, 'acct_1'))
        :forUpdate()
        :single()
        :await()

      return {
        id = account.id,
        balance = account.balance,
      }
    end)

    return {
      id = value.id,
      balance = value.balance,
      committed = __tx_state.finishes[1].shouldCommit,
      sql = __tx_state.queries[1].statement,
    }
  `);

  assert.equal(result.id, 'acct_1');
  assert.equal(result.balance, 100);
  assert.equal(result.committed, true);
  assert.match(result.sql, /FOR UPDATE/);
});

test('KuraDB Lua transaction bridge rolls back when callback returns false', async () => {
  const result = await withLua<{
    value: boolean;
    committed: boolean;
  }>(`
    local value = kura.db.transaction.await(function()
      return false
    end)

    return {
      value = value,
      committed = __tx_state.finishes[1].shouldCommit,
    }
  `);

  assert.equal(result.value, false);
  assert.equal(result.committed, false);
});

test('KuraDB Lua transaction bridge commits and returns true for nil callback results', async () => {
  const result = await withLua<{
    value: boolean;
    committed: boolean;
  }>(`
    local value = kura.db.transaction.await(function()
      return nil
    end)

    return {
      value = value,
      committed = __tx_state.finishes[1].shouldCommit,
    }
  `);

  assert.equal(result.value, true);
  assert.equal(result.committed, true);
});

test('KuraDB Lua transaction bridge rolls back on callback errors', async () => {
  const result = await withLua<{
    ok: boolean;
    err: string;
    committed: boolean;
  }>(`
    local ok, err = pcall(function()
      kura.db.transaction.await(function()
        error('boom')
      end)
    end)

    return {
      ok = ok,
      err = err,
      committed = __tx_state.finishes[1].shouldCommit,
    }
  `);

  assert.equal(result.ok, false);
  assert.match(String(result.err), /boom/);
  assert.equal(result.committed, false);
});
