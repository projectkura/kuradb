import { setDebug } from '../config';
import { sleep } from '../utils/sleep';
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
  if (resourceName !== GetCurrentResourceName()) return;
  void closeConnectionPool();
});

export * from './connection';
export * from './pool';
export * from './rawExecute';
export * from './rawQuery';
export * from './rawTransaction';
export * from './startTransaction';
