import { config } from "dotenv";

export interface Config {
    IMODEL_FILE: string;
    PRAGMA_SHRINK_DB: boolean;

    /**
     * Set to -1 to disable paging
     */
    PAGE_SIZE: number;
    USE_SET_TIMEOUT: boolean;
}

function stringToBoolean(value?: string, defaultValue: boolean = false) {
    if (!value) {
        return defaultValue;
    }

    return value === "true";
}

export function loadConfig(): Config {
    const loadedConfig = config();

    if (loadedConfig.error) {
        console.error(loadedConfig.error.message);
        throw loadedConfig.error;
    }

    if (!loadedConfig.parsed?.IMODEL_FILE) {
        throw new Error("IMODEL_FILE variable is missing");
    }

    return {
        IMODEL_FILE: loadedConfig.parsed?.IMODEL_FILE,
        PRAGMA_SHRINK_DB: stringToBoolean(loadedConfig.parsed?.PRAGMA_SHRINK_DB, false),
        PAGE_SIZE: parseInt(loadedConfig.parsed?.PAGE_SIZE) ?? -1,
        USE_SET_TIMEOUT: stringToBoolean(loadedConfig.parsed?.USE_SET_TIMEOUT, false)
    }
}