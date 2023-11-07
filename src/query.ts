import { ElementAspect, IModelDb } from "@itwin/core-backend";
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
        let lastAspectId = "";
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
    const aspectClassNameIdMap = new Set<{ schemaName: string; className: string; }>();

    console.log("Querying class infos");
    const getAspectClassesSql = `SELECT DISTINCT (ec_classname(ECClassId, 'c')) as className, (ec_classname(ECClassId, 's')) as schemaName FROM ${ElementAspect.classFullName}`;
    const queryReader = iModelDb.createQueryReader(getAspectClassesSql);
    for await (const rowProxy of queryReader) {
        const row = rowProxy.toRow();
        aspectClassNameIdMap.add({ schemaName: row.schemaName, className: row.className });
    }
    console.log("Queried class infos");

    for (const { schemaName, className } of aspectClassNameIdMap) {
        const classFullName = `${schemaName}:${className}`;

        let currentPage = 0;
        const getAspectPropsSql = `SELECT * FROM ONLY [${schemaName}]:[${className}]`;
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
                const aspectProps: ElementAspectProps = { ...row, classFullName, className: undefined }; // add in property required by EntityProps
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
}

async function queryElementAspectsWithoutPaging(timeout: () => Promise<void>, cleanDbCache: (iModelDb: IModelDb) => void, callback: (aspect: ElementAspect) => void, iModelDb: IModelDb) {
    const aspectClassNameIdMap = new Set<{ schemaName: string; className: string; }>();

    console.log("Querying class infos");
    const getAspectClassesSql = `SELECT DISTINCT (ec_classname(ECClassId, 'c')) as className, (ec_classname(ECClassId, 's')) as schemaName FROM ${ElementAspect.classFullName}`;
    const queryReader = iModelDb.createQueryReader(getAspectClassesSql);
    for await (const rowProxy of queryReader) {
        const row = rowProxy.toRow();
        aspectClassNameIdMap.add({ schemaName: row.schemaName, className: row.className });
    }
    console.log("Queried class infos");

    for (const { schemaName, className } of aspectClassNameIdMap) {
        const classFullName = `${schemaName}:${className}`;

        const getAspectPropsSql = `SELECT * FROM ONLY [${schemaName}]:[${className}]`;
        const queryReader = iModelDb.createQueryReader(
            getAspectPropsSql,
            undefined,
            { rowFormat: QueryRowFormat.UseJsPropertyNames }
        );

        for await (const rowProxy of queryReader) {
            const row = rowProxy.toRow();
            const aspectProps: ElementAspectProps = { ...row, classFullName, className: undefined }; // add in property required by EntityProps
            const aspectEntity = iModelDb.constructEntity<ElementAspect>(aspectProps);

            callback(aspectEntity);
        }

        await timeout();
        cleanDbCache(iModelDb);
    }
}
