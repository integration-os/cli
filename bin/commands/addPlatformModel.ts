#!/usr/bin/env node

import {
    apiHeaders,
    checkExistence,
    cloneObject,
    commonModelNameFormatter,
    createFolderStructure,
    getCaseCorrectedPath,
    getCurrentPath,
    getStoredCredentials,
    isSuccessful,
    readLineInterface,
    replaceStructureValues,
    splitNames,
    toPascalCase
} from "../helpers";
import path from "path";
import settings from "../settings.json";
import axios from "axios";

interface AddPlatformModelArguments {
    platform: string,
    models: string[]
}

const initialise = async (): Promise<AddPlatformModelArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the name of the platform: ", async (platform) => {
            if (!platform.length || platform === "") {
                return resolve(await initialise());
            }

            const models = await askForModelNames();

            readLineInterface.close();

            resolve({
                platform,
                models,
            });
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

export const addPlatformModel = async (): Promise<void> => {
    try {
        const { platform, models } = await initialise();

        const platformPath = path.join(await getCurrentPath(), ...settings.paths.platforms.split("/"), await toPascalCase(platform));

        if (await checkExistence(platformPath)) {
            const modelFolderStructure = settings.structures.model;

            let platformConfig = {
                platformId: "",
                platformVersion: "",
                connectionPlatform: path.basename(path.dirname(await getCaseCorrectedPath(path.join(platformPath, "models")))),
                connectionDefinitionId: ""
            };

            const platformResponse = await axios.get(`${(await getStoredCredentials())?.url}/v1/platforms?name=${platform}`, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (await isSuccessful(platformResponse.status) && platformResponse.data?.rows?.length) {
                const { _id, platformVersion, connectionDefinitionId, name } = platformResponse.data.rows[0];
                platformConfig = {
                    platformVersion,
                    platformId: _id,
                    connectionPlatform: name,
                    connectionDefinitionId
                };
            }

            for (const model of models) {
                const modelName = await commonModelNameFormatter(model);
                const modelPath = path.join(platformPath, "models", modelName);

                if (await checkExistence(modelPath)) {
                    console.error(`${model} already exists in ${platform} as ${modelName}, skipping...`);
                } else {
                    await createFolderStructure(modelPath, {
                        ...await replaceStructureValues(cloneObject({
                            ...modelFolderStructure,
                            folders: [
                                ...modelFolderStructure.folders.filter((folder) => folder.name === "schema"),
                                {
                                    name: "actions",
                                    folders: [...modelFolderStructure.folders.filter((folder) => folder.name === "actions")[0].folders.map((folder) => ({
                                        ...folder,
                                        name: `${folder.name}-${modelName}`
                                    }))]
                                },
                            ]
                        }), {
                            modelName,
                            ...platformConfig
                        }),
                        name: modelName
                    });

                    console.log(`${model} added to ${platform} as ${modelName}!`);
                }
            }
        } else {
            console.error(`${platform} does not exist!`);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};