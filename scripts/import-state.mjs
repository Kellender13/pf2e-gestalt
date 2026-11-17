import { MODULE_ID } from './constants.mjs';
/** Cross-client pause: the elected GM's background sync must also see an import in progress. */
export function variantImportRunning(actor) {
  const state=actor?.flags?.[MODULE_ID]?.pathmuncherImport;
  return !!state && Date.now()-state.started<30*60*1000;
}
