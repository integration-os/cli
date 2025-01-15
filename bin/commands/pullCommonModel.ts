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
import { DataObject } from "../interfaces";
import axios from "axios";
import pc from "picocolors";
import Table from "cli-table3";

interface PullCommonModelsArguments {
    models: string[];
    all: boolean;
    validate: boolean;
}

const initialise = async (): Promise<PullCommonModelsArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to pull all common models? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                const validate = await askIfShouldValidate();
                readLineInterface.close();

                resolve({
                    all: true,
                    models: [],
                    validate,
                });
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                const models = await askForModelNames();
                const validate = await askIfShouldValidate();

                readLineInterface.close();

                resolve({
                    all: false,
                    models,
                    validate,
                });
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await initialise());
            }
        });
    });
};

const askForModelNames = async (): Promise<string[]> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the names of models: ", async (models) => {
            const modelNames = (await splitNames(models)).filter((model: string) => model !== null && model !== "");

            if (!modelNames.length) {
                return resolve(await askForModelNames());
            }

            resolve(modelNames);
        });
    });
};

const askIfShouldValidate = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to validate each common model after pulling? (Y/N) ", async (answer) => {
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

const validatePull = async (modelPath: string, modelName: string): Promise<{ success: boolean }> => {
    let invalidated = false;
    const table = new Table({
        style: { head: ["reset"] },
    });

    console.log(`${pc.blue("Validating...")}`);
    const modelRow = [];

    if (await checkExistence(modelPath)) {
        modelRow.push("Folder ✔");

        const configPath = path.join(modelPath, "config.json");

        if (await checkExistence(configPath)) {
            modelRow.push("Config ✔");
        } else {
            logger.log("error", `${modelName}: Config missing.`);
            modelRow.push(`Config ${redCross}`);

            invalidated = true;
        }

        const fieldsPath = path.join(modelPath, "fields.json");

        if (await checkExistence(fieldsPath)) {
            modelRow.push("Fields ✔");
        } else {
            logger.log("error", `${modelName}: Fields missing.`);
            modelRow.push(`Fields ${redCross}`);

            invalidated = true;
        }

        const samplePath = path.join(modelPath, "sample.json");

        if (await checkExistence(samplePath)) {
            modelRow.push("Sample ✔");
        } else {
            logger.log("error", `${modelName}: Sample missing.`);
            modelRow.push(`Sample ${redCross}`);

            invalidated = true;
        }

        const rsTypesPath = path.join(modelPath, "types.rs");

        if (await checkExistence(rsTypesPath)) {
            modelRow.push("Rust Types ✔");
        } else {
            logger.log("error", `${modelName}: Rust Types missing.`);
            modelRow.push(`Rust Types ${redCross}`);

            invalidated = true;
        }

        const tsTypesPath = path.join(modelPath, "types.ts");

        if (await checkExistence(tsTypesPath)) {
            modelRow.push("TS Types ✔");
        } else {
            logger.log("error", `${modelName}: TS Types missing.`);
            modelRow.push(`TS Types ${redCross}`);

            invalidated = true;
        }
    } else {
        logger.log("error", `${modelName}: Folder missing.`);
        modelRow.push(`Enum Folder ${redCross}`);

        invalidated = true;
    }

    table.push(modelRow);

    console.log(table.toString());

    return {
        success: !invalidated,
    };
};

export const pullCommonModel = async () => {
    try {
        const { all, models, validate } = await initialise();
        console.log("\r\n");

        const commonModelsPath = path.join(await getCurrentPath(), ...settings.paths.commonModels.split("/"));
        let totalModelsCount = 0;
        let successCount = 0;

        if (all) {
            const allModels = await getAllRows(`${(await getStoredCredentials())?.url}/v1/common-models`);

            totalModelsCount = allModels.length;

            if (totalModelsCount) {
                console.log(`Total: ${totalModelsCount}`);
                console.log("\r\n");

                for (const model of allModels) {
                    const modelName = await commonModelNameFormatter(model.name);

                    console.log(`Pulling: ${modelName}`);
                    logger.log("info", `Pulling: ${modelName}`);

                    const modelPath = path.join(commonModelsPath, modelName);
                    await storeModelData(modelPath, model);

                    if (validate) {
                        const validation = await validatePull(modelPath, model.name);

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
        } else if (Array.isArray(models)) {
            totalModelsCount = models.length;
            console.log(`Total: ${totalModelsCount}`);
            console.log("\r\n");

            for (const model of models) {
                console.log(`Pulling: ${model}`);
                logger.log("info", `Pulling: ${model}`);

                const response = await axios.get(`${(await getStoredCredentials())?.url}/v1/common-models?name=${model}`, {
                    headers: await apiHeaders(),
                    validateStatus: () => true,
                });

                if (await isSuccessful(response.status)) {
                    if (response.data.rows?.length) {
                        const modelName = await commonModelNameFormatter(model);
                        const modelPath = path.join(commonModelsPath, modelName);
                        await storeModelData(modelPath, response.data.rows[0]);

                        if (validate) {
                            const validation = await validatePull(modelPath, model);

                            if (validation.success) {
                                console.log(`${pc.green("Pull Validated!")}`);
                                console.log("\r\n");
                            } else {
                                console.error(`${pc.red("Pull Validation Failed!")}`);
                                console.log("\r\n");
                            }
                        }

                        successCount++;
                    } else {
                        console.error(`${model} does not exist!`);
                    }
                } else {
                    await logApiError(response.data?.error ?? response.data);
                }
            }
        }

        console.log("\r\n");
        console.log(`Successfully pulled: ${successCount}`);
        console.log(`Failed: ${totalModelsCount - successCount}`);
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const storeModelData = async (modelPath: string, model: DataObject) => {
    if (!await checkExistence(modelPath)) {
        await createFolder(modelPath);
    }

    const commonModelKeyStructure = settings.extractKeys.commonModel;

    for (const structure of commonModelKeyStructure) {
        const filePath = path.join(modelPath, structure.path);

        if (await checkExistence(filePath)) {
            await removeFileOrFolder(filePath);
        }

        const properties = await extractProperties(model, structure.keys);

        let data = structure.root ? Object.values(properties)[0] : properties;
        if (typeof data === "object") {
            data = JSON.stringify(data, null, 4);
        }

        await createFile(filePath, data);
    }
};