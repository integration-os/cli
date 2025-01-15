#!/usr/bin/env node

import settings from "../settings.json";
import path from "path";
import {
    apiHeaders,
    checkExistence,
    cloneObject,
    commonModelNameFormatter,
    createFolder,
    createFolderStructure,
    getCurrentPath,
    getStoredCredentials,
    readLineInterface,
    replaceStructureValues,
    splitNames
} from "../helpers";
import axios from "axios";

interface AddCommonModelArguments {
    models: string[];
}

const initialise = async (): Promise<AddCommonModelArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the names of models: ", async (models) => {
            let modelNames = (await splitNames(models)).filter((model: string) => model !== null && model !== "");

            if (!modelNames.length) {
                return resolve(await initialise());
            }

            for (const model of modelNames) {
                if (await checkIfCommonModelAlreadyExists(model)) {
                    console.error(`${model} already exists!`);

                    modelNames = modelNames.filter((item) => item !== model);
                } else if (await checkIfCommonModelAlreadyExistsInDataBase(model)) {
                    if (!await askIfShouldAddAnyway(model)) {
                        modelNames = modelNames.filter((item) => item !== model);
                    }
                }
            }

            readLineInterface.close();

            resolve({
                models: modelNames,
            });
        });
    });
};

const askIfShouldAddAnyway = async (model: string): Promise<boolean> => {
    return new Promise((resolve) => {
        readLineInterface.question(`${model} already exists in the Database. Do you add it anyway? (Y/N) `, async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                resolve(true);
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                resolve(false);
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await askIfShouldAddAnyway(model));
            }
        });
    });
};

const checkIfCommonModelAlreadyExists = async (model: string): Promise<boolean> => await checkExistence(path.join(await getCurrentPath(), ...settings.paths.commonModels.split("/"), model));

const checkIfCommonModelAlreadyExistsInDataBase = async (model: string): Promise<boolean> => {
    const modelResponse = await axios.get(`${(await getStoredCredentials())?.url}/v1/common-models?name=${model}`, {
        headers: await apiHeaders(),
        validateStatus: () => true,
    });

    return !!modelResponse?.data?.rows?.length;
};

export const addCommonModel = async () => {
    try {
        const { models } = await initialise();

        const commonModelsPath = path.join(await getCurrentPath(), ...settings.paths.commonModels.split("/"));

        const commonModelFolderStructure = settings.structures.commonModel;

        for (const model of models) {
            const modelName = await commonModelNameFormatter(model);
            const modelPath = path.join(commonModelsPath, modelName);

            if (await checkExistence(modelPath)) {
                console.error(`${model} already exists as ${modelName}!`);
            } else {
                const modifiedCommonModelStructure = await replaceStructureValues(cloneObject(commonModelFolderStructure), {
                    modelName
                });

                await createFolder(modelPath);
                await createFolderStructure(modelPath, {
                    ...modifiedCommonModelStructure,
                    name: modelName
                });

                console.log(`${model} added as ${modelName}!`);
            }
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};