#!/usr/bin/env node

import path from "path";
import {
    apiHeaders,
    checkExistence,
    commonModelNameFormatter,
    createFile,
    createFolder,
    extractProperties,
    getAllRows,
    getCurrentPath,
    getStoredCredentials,
    isSuccessful,
    logApiError,
    logger,
    readLineInterface,
    redCross,
    removeFileOrFolder,
    splitNames
} from "../helpers";
import settings from "../settings.json";
import axios from "axios";
import { DataObject } from "../interfaces";
import Table from "cli-table3";
import pc from "picocolors";

interface PullCommonEnumsArguments {
    enums?: string[];
    all?: boolean;
    validate: boolean;
}

const initialise = async (): Promise<PullCommonEnumsArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to pull all common enums? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                const validate = await askIfShouldValidate();

                readLineInterface.close();

                resolve({
                    all: true,
                    enums: [],
                    validate,
                });
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                const enums = await askForEnumNames();
                const validate = await askIfShouldValidate();

                readLineInterface.close();

                resolve({
                    all: false,
                    enums,
                    validate,
                });
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await initialise());
            }
        });
    });
};

const askForEnumNames = async (): Promise<string[]> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the names of enums: ", async (enums) => {
            const enumNames = (await splitNames(enums)).filter((enumItem: string) => enumItem !== null && enumItem !== "");

            if (!enumNames.length) {
                return resolve(await askForEnumNames());
            }

            resolve(enumNames);
        });
    });
};

const askIfShouldValidate = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to validate each common enum after pulling? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                resolve(true);
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                resolve(false);
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await askIfShouldValidate());
            }
        });
    });
};

const validatePull = async (enumPath: string, enumName: string): Promise<{ success: boolean }> => {
    let invalidated = false;
    const table = new Table({
        style: { head: ["reset"] },
    });

    console.log(`${pc.blue("Validating...")}`);
    const enumRow = [];

    if (await checkExistence(enumPath)) {
        enumRow.push("Folder ✔");

        const configPath = path.join(enumPath, "config.json");

        if (await checkExistence(configPath)) {
            enumRow.push("Config ✔");
        } else {
            logger.log("error", `${enumName}: Config missing.`);
            enumRow.push(`Config ${redCross}`);

            invalidated = true;
        }
    } else {
        logger.log("error", `${enumName}: Folder missing.`);
        enumRow.push(`Enum Folder ${redCross}`);

        invalidated = true;
    }

    table.push(enumRow);

    console.log(table.toString());

    return {
        success: !invalidated,
    };
};

export const pullCommonEnum = async () => {
    try {
        const { all, enums, validate } = await initialise();
        console.log("\r\n");

        const commonEnumsPath = path.join(await getCurrentPath(), ...settings.paths.commonEnums.split("/"));
        let totalEnumsCount = 0;
        let successCount = 0;

        if (all) {
            const allEnums = await getAllRows(`${(await getStoredCredentials())?.url}/v1/public/sdk/common-enums`);

            totalEnumsCount = allEnums.length;

            if (totalEnumsCount) {
                console.log(`Total: ${totalEnumsCount}`);
                console.log("\r\n");

                for (const enumItem of allEnums) {
                    const enumName = await commonModelNameFormatter(enumItem.name);

                    console.log(`Pulling: ${enumName}`);
                    logger.log("info", `Pulling: ${enumName}`);

                    const enumPath = path.join(commonEnumsPath, enumName);

                    await storeEnumData(enumPath, enumItem);

                    if (validate) {
                        const validation = await validatePull(enumPath, enumItem.name);

                        if (validation.success) {
                            console.log(`${pc.green("Pull Validated!")}`);
                            console.log("\r\n");
                        } else {
                            console.error(`${pc.red("Pull Validation Failed!")}`);
                            console.log("\r\n");
                        }
                    }

                    successCount++;
                }
            }
        } else if (Array.isArray(enums)) {
            totalEnumsCount = enums.length;

            console.log(`Total: ${totalEnumsCount}`);
            console.log("\r\n");

            for (const enumItem of enums) {
                console.log(`Pulling: ${enumItem}`);
                logger.log("info", `Pulling: ${enumItem}`);

                const enumData = await axios.get(`${(await getStoredCredentials())?.url}/v1/public/sdk/common-enums?name=${enumItem}`, {
                    headers: await apiHeaders(),
                    validateStatus: () => true,
                });

                if (await isSuccessful(enumData.status)) {
                    if (enumData.data.rows.length) {
                        const enumName = await commonModelNameFormatter(enumItem);
                        const enumPath = path.join(commonEnumsPath, enumName);
                        await storeEnumData(enumPath, enumData.data.rows[0]);

                        if (validate) {
                            const validation = await validatePull(enumPath, enumItem);

                            if (validation.success) {
                                console.log(`${pc.green("Pull Validated!")}`);
                            } else {
                                console.error(`${pc.red("Pull Validation Failed!")}`);
                            }
                        }

                        successCount++;
                    } else {
                        console.error(`${enumItem} does not exist!`);
                    }
                } else {
                    await logApiError(enumData.data?.error ?? enumData.data);
                }
            }
        }

        if (!validate) {
            console.log("\r\n");
        }
        console.log(`Successfully pulled: ${successCount}`);
        console.log(`Failed: ${totalEnumsCount - successCount}`);
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const storeEnumData = async (enumPath: string, enumItem: DataObject) => {
    if (!await checkExistence(enumPath)) {
        await createFolder(enumPath);
    }

    const commonEnumKeyStructure = settings.extractKeys.commonEnum;

    for (const structure of commonEnumKeyStructure) {
        const filePath = path.join(enumPath, structure.path);

        if (await checkExistence(filePath)) {
            await removeFileOrFolder(filePath);
        }

        const properties = await extractProperties(enumItem, structure.keys);

        let data = structure.root ? Object.values(properties)[0] : properties;
        if (typeof data === "object") {
            data = JSON.stringify(data, null, 4);
        }

        await createFile(filePath, data);
    }
};