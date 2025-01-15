#!/usr/bin/env node

import path from "path";
import {
    apiHeaders,
    checkExistence,
    getCurrentPath,
    getStoredCredentials,
    isSuccessful,
    listSubDirectories,
    logApiError,
    logger,
    overwriteFile,
    readFile,
    readLineInterface,
    splitNames
} from "../helpers";
import settings from "../settings.json";
import axios from "axios";

interface PushCommonModelsArguments {
    models?: string[];
    all?: boolean;
}

const initialise = async (): Promise<PushCommonModelsArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to push all common models? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                readLineInterface.close();

                resolve({
                    all: true,
                    models: [],
                });
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                const models = await askForModelNames();

                readLineInterface.close();

                resolve({
                    all: false,
                    models,
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

export const pushCommonModel = async () => {
    try {
        const { all, models } = await initialise();
        console.log("\r\n");

        const commonModelsPath = path.join(await getCurrentPath(), ...settings.paths.commonModels.split("/"));
        let successCount = 0;
        let failCount = 0;
        let totalModelsCount = 0;

        logger.log("info", "Starting Common Model Push....");

        if (all) {
            const localModels = (await listSubDirectories(commonModelsPath)).map((model) => model.name);

            if (!localModels.length) {
                console.error("No models available to push!");
            } else {
                totalModelsCount = localModels.length;
                console.log(`Total: ${totalModelsCount}`);
                console.log("\r\n");

                for (const model of localModels) {
                    logger.log("info", `Pushing: ${model}`);

                    const modelPath = path.join(commonModelsPath, model);

                    const success = await syncCommonModel(model, modelPath);

                    success ? successCount++ : failCount++;
                }
            }
        } else if (Array.isArray(models)) {
            totalModelsCount = models.length;
            console.log(`Total: ${totalModelsCount}`);
            console.log("\r\n");

            for (const model of models) {
                logger.log("info", `Pushing: ${model}`);

                const modelPath = path.join(commonModelsPath, model);

                if (await checkExistence(modelPath)) {
                    const success = await syncCommonModel(model, modelPath);

                    success ? successCount++ : failCount++;
                } else {
                    console.error(`${model} does not exist!`);

                    failCount++;
                }
            }
        }

        console.log("\r\n");
        console.log(`Successfully pushed: ${successCount}`);
        console.log(`Failed: ${totalModelsCount - successCount}`);
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const getPushStructureData = async (modelPath: string) => {
    const pushStructure = settings.pushStructures.commonModels;

    let structureData: {
        [key: string]: any
    } = {};

    for (const { name, root, key, nested } of pushStructure.files) {
        if (name.endsWith(".json")) {
            if (await checkExistence(path.join(modelPath, name))) {
                const fileContents: any = JSON.parse(await readFile(path.join(modelPath, name)) as string);

                if (root && key) {
                    structureData[key] = fileContents;
                } else if (!root) {
                    structureData = {
                        ...structureData,
                        ...fileContents
                    };
                }
            }
        } else {
            const fileContents: any = await readFile(path.join(modelPath, name)) as string;

            if (root && key) {
                if (nested) {
                    let keysPath = key.split(".");
                    let lastKey = keysPath.pop();

                    if (lastKey) {
                        keysPath.reduce((nestedObject, key, index) => {
                            if (index === keysPath.length - 1) {
                                nestedObject[key] = { ...nestedObject[key], [lastKey]: fileContents };
                            } else if (!nestedObject[key]) {
                                nestedObject[key] = {};
                            }

                            return nestedObject[key];
                        }, structureData);
                    }
                } else {
                    structureData[key] = fileContents;
                }
            } else if (!root) {
                structureData = {
                    ...structureData,
                    ...fileContents
                };
            }
        }
    }

    return structureData;
};

const syncCommonModel = async (model: string, modelPath: string) => {
    const data = await getPushStructureData(modelPath);

    const modelId = data._id;

    const createNewCommonModel = async (containsId = false) => {
        const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/common-models`, data, {
            headers: await apiHeaders(),
            validateStatus: () => true,
        });

        if (await isSuccessful(response.status)) {
            const configFilePath = path.join(modelPath, "config.json");

            const obj = JSON.parse(await readFile(configFilePath) as string);
            obj._id = response.data._id;

            await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));

            containsId
                ? console.log(`${model} added! Config file has been updated.`)
                : console.log(`${model} added! Config file has been updated with the id.`);

            return true;
        } else {
            logger.log("error", `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

            await logApiError(response.data?.error ?? response.data?.message ?? response.data);

            return false;
        }
    };

    if (modelId) {
        const response = await axios.patch(`${(await getStoredCredentials())?.url}/v1/common-models/${modelId}`, data, {
            headers: await apiHeaders(),
            validateStatus: () => true,
        });

        if (await isSuccessful(response.status)) {
            if (response.data?.success) {
                console.log(`${model} updated!`);

                return true;
            }

            return false;
        } else if (response.status === 404) {
            return await createNewCommonModel(true);
        } else {
            logger.log("error", `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

            await logApiError(response.data?.error ?? response.data?.message ?? response.data);

            return false;
        }
    } else {
        return await createNewCommonModel();
    }
};