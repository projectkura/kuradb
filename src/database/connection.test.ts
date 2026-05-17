export {};

const assertConnection = require('node:assert/strict');
const { test: testConnection } = require('node:test');
const { toQueryResult } = require('./connection.ts');

testConnection('toQueryResult preserves rows and metadata for a single pg result', () => {
  const result = toQueryResult({
    rows: [{ id: 'abc' }],
    rowCount: 1,
    command: 'SELECT',
  });

  assertConnection.deepEqual(result, [{ id: 'abc' }]);
  assertConnection.equal(result.count, 1);
  assertConnection.equal(result.command, 'SELECT');
});

testConnection('toQueryResult flattens multi-statement pg results safely', () => {
  const result = toQueryResult([
    {
      rows: [],
      rowCount: 0,
      command: 'CREATE',
    },
    {
      rows: [{ exists: true }],
      rowCount: 1,
      command: 'SELECT',
    },
    {
      rows: [],
      rowCount: 0,
      command: 'CREATE',
    },
  ]);

  assertConnection.deepEqual(result, [{ exists: true }]);
  assertConnection.equal(result.count, 1);
  assertConnection.equal(result.command, 'CREATE');
});
