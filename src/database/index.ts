import { setDebug } from '../config';
import { sleep } from '../utils/sleep';
import { closeLuaTransactionSessions, rollbackLuaTransactionsForResource } from './luaTransaction';
import { closeConnectionPool, createConnectionPool, pool } from './pool';

setTimeout(async () => {
  setDebug();

  while (!pool) {
    await createConnectionPool();

    if (!pool) {
      await sleep(30000);
    }
  }
});

setInterval(() => {
  setDebug();
}, 1000);

on('onResourceStop', (resourceName: string) => {
  if (resourceName === GetCurrentResourceName()) {
    void (async () => {
      await closeLuaTransactionSessions();
      await closeConnectionPool();
    })();
    return;
  }

  void rollbackLuaTransactionsForResource(resourceName);
});

export * from './connection';
export * from './luaTransaction';
export * from './pool';
export * from './primitives';
export * from './rawExecute';
export * from './rawQuery';
export * from './rawTransaction';
export * from './startTransaction';
