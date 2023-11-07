import { ElementAspect, ExternalSourceAspect, IModelDb } from "@itwin/core-backend";
import { DbResult } from "@itwin/core-bentley";
import { ElementAspectProps, QueryRowFormat } from "@itwin/core-common";
import { logStats } from "./monitor";

export interface Flags {
    useSetTimeout: boolean;
    usePragmaShrinkMemory: boolean;
    pageSize: number;
}

const noop = () => {};
const noopAsync = async() => {};

export function queryElementAspects(flags: Flags) {
    const timeout = flags.useSetTimeout ?
        async () => new Promise<void>(resolve => setTimeout(resolve, 1000)) :
        noopAsync;

    const cleanDbCache = flags.usePragmaShrinkMemory ?
        (iModelDb: IModelDb) => {
            iModelDb.withPreparedSqliteStatement("PRAGMA shrink_memory", statement => {
                while (DbResult.BE_SQLITE_ROW === statement.step()) {
                    console.log("Looping Pragma shrink_memory");
                }
            })
        } :
        noop;

    return async(iModelDb: IModelDb) => {
        const aspectCount = iModelDb.withPreparedStatement(`SELECT COUNT(*) FROM ${ElementAspect.classFullName}`, statement => {
            if (DbResult.BE_SQLITE_ROW === statement.step()) {
                return statement.getValue(0).getInteger();
            }

            return 0;
        });

        let processedAspects = 0;
        let lastAspectId = ""; // saving last aspect id to simulate that something is done with the aspect
        const callback = (aspect: ElementAspect) => {
            lastAspectId = aspect.id;
            ++processedAspects;

            if (processedAspects % 10_000 === 0) {
                console.log(`Progress: ${processedAspects}/${aspectCount}`);
                logStats();
            }
        };
    
        if (flags.pageSize === -1) {
            await queryElementAspectsWithoutPaging(timeout, cleanDbCache, callback, iModelDb);
        } else {
            await queryElementAspectsInPages(flags.pageSize, timeout, cleanDbCache, callback, iModelDb);
        }

        console.log(`last aspect id: ${lastAspectId}`);
    }
}

async function queryElementAspectsInPages(pageSize: number, timeout: () => Promise<void>, cleanDbCache: (iModelDb: IModelDb) => void, callback: (aspect: ElementAspect) => void, iModelDb: IModelDb) {
    let currentPage = 0;
    const getAspectPropsSql = `SELECT * FROM ONLY ${ExternalSourceAspect.classFullName}`;
    while (true) {
        const queryReader = iModelDb.createQueryReader(
            getAspectPropsSql,
            undefined,
            {
                rowFormat: QueryRowFormat.UseJsPropertyNames,
                limit: { count: pageSize, offset: pageSize * currentPage }
            }
        );


        let currentPageSize = 0;
        for await (const rowProxy of queryReader) {
            const row = rowProxy.toRow();
            const aspectProps: ElementAspectProps = { ...row, classFullName: ExternalSourceAspect.classFullName, className: undefined }; // add in property required by EntityProps
            const aspectEntity = iModelDb.constructEntity<ElementAspect>(aspectProps);
            ++currentPageSize;

            callback(aspectEntity);
        }

        await timeout();
        cleanDbCache(iModelDb);

        ++currentPage;

        if (currentPageSize < pageSize) {
            break;
        }
    }
}

async function queryElementAspectsWithoutPaging(timeout: () => Promise<void>, cleanDbCache: (iModelDb: IModelDb) => void, callback: (aspect: ElementAspect) => void, iModelDb: IModelDb) {
    const getAspectPropsSql = `SELECT * FROM ONLY ${ExternalSourceAspect.classFullName}`;
    const queryReader = iModelDb.createQueryReader(
        getAspectPropsSql,
        undefined,
        { rowFormat: QueryRowFormat.UseJsPropertyNames }
    );

    for await (const rowProxy of queryReader) {
        const row = rowProxy.toRow();
        const aspectProps: ElementAspectProps = { ...row, classFullName: ExternalSourceAspect.classFullName, className: undefined }; // add in property required by EntityProps
        const aspectEntity = iModelDb.constructEntity<ElementAspect>(aspectProps);

        callback(aspectEntity);
    }

    await timeout();
    cleanDbCache(iModelDb);
}
