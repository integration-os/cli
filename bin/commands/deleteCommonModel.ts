#!/usr/bin/env node

import path from "path";
import {
    apiHeaders,
    checkExistence,
    commonModelNameFormatter,
    getCurrentPath,
    getStoredCredentials,
    logApiError,
    readFile,
    readLineInterface,
    removeFileOrFolder,
    splitNames
} from "../helpers";
import settings from "../settings.json";
import axios from "axios";

interface DeleteCommonModelsArguments {
    models?: string[];
}

const initialise = async (): Promise<DeleteCommonModelsArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the names of models: ", async (models) => {
            const modelNames = (await splitNames(models)).filter((model: string) => model !== null && model !== "");

            if (!modelNames.length) {
                return resolve(await initialise());
            }

            readLineInterface.close();

            resolve({
                models: modelNames,
            });
        });
    });
};

export const deleteCommonModel = async () => {
    try {
        const { models } = await initialise();
        console.log("\r\n");

        const commonModelsPath = path.join(await getCurrentPath(), ...settings.paths.commonModels.split("/"));
        let totalModelsCount = 0;
        let successCount = 0;

        if (Array.isArray(models)) {
            totalModelsCount = models.length;
            console.log(`Total: ${totalModelsCount}`);
            console.log("\r\n");

            for (const model of models) {
                const modelName = await commonModelNameFormatter(model);
                const modelPath = path.join(commonModelsPath, modelName);

                if (await checkExistence(modelPath)) {
                    const configFilePath = path.join(modelPath, "config.json");
                    const configFileContent = JSON.parse(await readFile(configFilePath) as string);
                    const id = configFileContent?._id;

                    if (id) {
                        const response = await axios.delete(`${(await getStoredCredentials())?.url}/v1/common-models/${id}`, {
                            headers: await apiHeaders(),
                            validateStatus: () => true,
                        });

                        await logApiError(response?.data?.error);
                    }

                    await removeFileOrFolder(modelPath);

                    successCount++;
                } else {
                    console.error(`${model} does not exist!`);
                }
            }
        }

        console.log("\r\n");
        console.log(`Successfully deleted: ${successCount}`);
        console.log(`Failed: ${totalModelsCount - successCount}`);
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};