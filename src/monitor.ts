import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";

function getStatsFile() { 
    return path.join(process.cwd(), "stats.csv");
}

export async function prepareLogging() {
    const filePath = getStatsFile();
    if (fsSync.existsSync(filePath)) {
        await fs.rm(filePath);
    }
    fs.writeFile(filePath, "Time;Heap Memory;Total Memory\n");
}

export async function logStats() {
    const filePath = getStatsFile();
    const memoryUsage = process.memoryUsage();
    const time = process.hrtime.bigint();
    const line = `${time.toString()};${memoryUsage.heapTotal};${memoryUsage.rss}\n`;
    await fs.appendFile(filePath, line);
    console.log(line);
}

export async function createStatsLogger(consoleLogFrequency: number) {
    const filePath = path.join(process.cwd(), "stats.csv");
    if (fsSync.existsSync(filePath)) {
        await fs.rm(filePath);
    }
    fs.writeFile(filePath, "Time;Heap Memory;Total Memory\n");

    let logCount = 0;

    return async() => {
        const memoryUsage = process.memoryUsage();
        const time = process.hrtime.bigint();
        const line = `${time.toString()};${memoryUsage.heapTotal};${memoryUsage.rss}\n`;
        await fs.appendFile(filePath, line);

        ++logCount;
        if (logCount >= consoleLogFrequency) {
            console.log(line);
            logCount = 0;
        }
    };
};