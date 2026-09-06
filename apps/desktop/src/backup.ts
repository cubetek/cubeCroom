import { app } from 'electron';
import { createBackup } from '@cubecroom/core';
import { SCHEMA_VERSION } from '@cubecroom/db';
import { databaseHandle, fileStore, repositories } from './store.js';

/** Shared by manual backup, restore protection, and the update transaction. */
export function takeBackup(destinationRoot: string, store = fileStore()) {
  return createBackup({
    destinationRoot,
    database: databaseHandle().sqlite,
    fileStore: store,
    storageNames: repositories().stats.storageNames(),
    contents: repositories().stats.contents(),
    appVersion: app.getVersion(),
    schemaVersion: SCHEMA_VERSION,
  });
}
