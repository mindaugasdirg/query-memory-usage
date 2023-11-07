import { IModelHost, SnapshotDb } from "@itwin/core-backend";
import { loadConfig } from "./config";
import { queryElementAspects } from "./query";
import { createStatsLogger, prepareLogging } from "./monitor";

async function withSnapshotDb(filePath: string, func: (iModelDb: SnapshotDb) => Promise<void>) {
    try {
        await IModelHost.startup();
        const iModelDb = SnapshotDb.openFile(filePath);
        await func(iModelDb);
    } catch (error: unknown) {
        console.log(error);
        await IModelHost.shutdown();
    }
}

(async function main() {
    const config = loadConfig();
    // const timer = setTimeout(await createStatsLogger(60), 1000);
    // timer.unref();
    createStatsLogger;
    await prepareLogging();
    await withSnapshotDb(config.IMODEL_FILE, queryElementAspects({ pageSize: config.PAGE_SIZE, usePragmaShrinkMemory: config.PRAGMA_SHRINK_DB, useSetTimeout: config.USE_SET_TIMEOUT }));
    // clearTimeout(timer);
})();
