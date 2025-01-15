#!/usr/bin/env node

import {
    apiHeaders,
    checkExistence,
    getActionName,
    getCurrentPath,
    getStoredCredentials,
    isSuccessful,
    listSubDirectories,
    overwriteFile,
    readFile,
    readLineInterface,
    renameFileOrFolder,
    splitNames,
    toPascalCase
} from "../helpers";
import path from "path";
import settings from "../settings.json";
import axios from "axios";
import { DataObject } from "../interfaces";
import pc from "picocolors";

interface PushPlatformActionArguments {
    platform: string;
    all: boolean;
    models: string[];
    connectionDefinitionId: string;
    connectionAuthMethod: DataObject;
    platformId: string;
    setActive: boolean;
}

const initialise = async (): Promise<PushPlatformActionArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the name of the platform: ", async (platform) => {
            if (!platform.length || platform === "") {
                return resolve(await initialise());
            }

            const platformPath = path.join(await getCurrentPath(), ...settings.paths.platforms.split("/"), await toPascalCase(platform));

            if (!await checkExistence(platformPath)) {
                console.error("Platform does not exist!");

                return resolve(await initialise());
            }

            if (!await checkExistence(path.join(platformPath, "models"))) {
                console.error("Platform does not have any models!");

                return resolve(await initialise());
            }

            const connectionDetails = await checkIfPlatformHasConnectionAndPlatformData(platformPath);

            if (!connectionDetails.success) {
                console.error(connectionDetails.message);

                return resolve(await initialise());
            }

            const pushAllModels = await askIfShouldPushForAllModels();
            let models: string[] = [];

            if (!pushAllModels) {
                models = await askForModelNames();
            }

            const setActive = await askForActiveStatus();

            resolve({
                platform,
                all: pushAllModels,
                models,
                connectionDefinitionId: connectionDetails.data?.connectionDefinitionId ?? "",
                connectionAuthMethod: connectionDetails.data?.connectionDefinitionAuthMethod ?? {},
                platformId: connectionDetails.data?.platformId ?? "",
                setActive,
            });
        });
    });
};

const checkIfPlatformHasConnectionAndPlatformData = async (platformPath: string): Promise<{
    success: boolean,
    message: string | null,
    data: { platformId: string, connectionDefinitionId: string, connectionDefinitionAuthMethod?: DataObject } | null
}> => {
    const configsPath = path.join(platformPath, "configs");

    if (await checkExistence(configsPath)) {
        const connectionDefinitionConfigurationPath = path.join(configsPath, "connection-definition.json");

        if (await checkExistence(connectionDefinitionConfigurationPath)) {
            const connectionDefinition = JSON.parse(await readFile(connectionDefinitionConfigurationPath) as string);

            if (connectionDefinition._id) {
                const connectionPlatformConfigurationPath = path.join(configsPath, "connection-platform.json");

                if (await checkExistence(connectionPlatformConfigurationPath)) {
                    const connectionPlatform = JSON.parse(await readFile(connectionPlatformConfigurationPath) as string);

                    if (connectionPlatform._id) {
                        return {
                            success: true,
                            message: null,
                            data: {
                                connectionDefinitionId: connectionDefinition._id,
                                platformId: connectionPlatform._id,
                                connectionDefinitionAuthMethod: connectionDefinition.authMethod
                            },
                        };
                    } else {
                        return {
                            success: false,
                            message: "Platform ID is not available! Please push the platform first!",
                            data: null
                        };
                    }
                } else {
                    return {
                        success: false,
                        message: "Platform does not have a platform configuration!",
                        data: null
                    };
                }
            } else {
                return {
                    success: false,
                    message: "Connection Definition ID is not available! Please push the platform first!",
                    data: null
                };
            }
        } else {
            return {
                success: false,
                message: "Platform does not have a connection definition!",
                data: null
            };
        }
    } else {
        return {
            success: false,
            message: "Platform does not have a configs folder!",
            data: null
        };
    }
};

const askIfShouldPushForAllModels = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to push actions for all the platform models? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                resolve(true);
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                resolve(false);
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await askIfShouldPushForAllModels());
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

const askForActiveStatus = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to set the actions as active? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                resolve(true);
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                resolve(false);
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await askForActiveStatus());
            }
        });
    });
};

const getPushStructureData = async (platformModelPath: string, structure: DataObject) => {
    let structureData: {
        [key: string]: any
    } = {};

    for (const { name, root, key, nested } of structure.files) {
        if (name.endsWith(".json")) {
            if (await checkExistence(path.join(platformModelPath, name))) {
                const fileContents: any = JSON.parse(await readFile(path.join(platformModelPath, name)) as string);

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
            const fileContents: any = await readFile(path.join(platformModelPath, name)) as string;

            if (root && key && fileContents.length) {
                if (nested) {
                    let keysPath = key.split(".");
                    let lastKey = keysPath.pop();

                    if (lastKey) {
                        keysPath.reduce((nestedObject: { [x: string]: any; }, key: string | number, index: number) => {
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

const syncPlatformAction = async (actionName: string, platformModelActionPath: string, connectionDefinitionId: string, connectionAuthMethod: DataObject, setActive: boolean) => {
    try {
        const data = await getPushStructureData(platformModelActionPath, settings.pushStructures.platform.actions);
        const configFilePath = path.join(platformModelActionPath, "definition", "config.json");

        let definitionName = await getActionName(data.name.replaceAll(":", "-").replaceAll("/", "-"), data._id),
            definitionId = data._id;

        if (!data.connectionDefinitionId) {
            data.connectionDefinitionId = connectionDefinitionId;

            const obj = JSON.parse(await readFile(configFilePath) as string);
            obj.connectionDefinitionId = connectionDefinitionId;
            await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));
        }

        if (!data.authMethod) {
            data.authMethod = connectionAuthMethod;

            const obj = JSON.parse(await readFile(configFilePath) as string);
            obj.authMethod = connectionAuthMethod;
            await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));
        }

        if (!data.mapping?.commonModelName) {
            data.mapping = null;

            const obj = JSON.parse(await readFile(configFilePath) as string);
            obj.mapping = null;
            await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));
        }

        if (setActive) {
            data.active = true;
        }

        let pageId;
        const platformPageFilePath = path.join(platformModelActionPath, "definition", "page.json");

        if (await checkExistence(platformPageFilePath)) {
            const pageData = await getPushStructureData(platformModelActionPath, settings.pushStructures.platform.actionPage);

            const createNewPlatformActionPage = async () => {
                const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/platform-pages`, pageData, {
                    headers: await apiHeaders(),
                    validateStatus: () => true,
                });

                if (await isSuccessful(response.status)) {
                    const obj = JSON.parse(await readFile(platformPageFilePath) as string);
                    obj._id = response.data._id;
                    pageId = response.data._id;

                    await overwriteFile(platformPageFilePath, JSON.stringify(obj, null, 4));

                    return {
                        success: true,
                        message: null,
                    };
                } else {
                    return {
                        success: false,
                        message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                    };
                }
            };

            pageId = pageData._id;

            const response = await axios.patch(`${(await getStoredCredentials())?.url}/v1/platform-pages/${pageId}`, pageData, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (response.status === 404) {
                const newPlatformActionPageResponse = await createNewPlatformActionPage();

                if (!newPlatformActionPageResponse.success) {
                    return newPlatformActionPageResponse;
                }
            } else if (!await isSuccessful(response.status)) {
                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                    data: null,
                };
            }
        }

        const createNewConnectionModelDefinition = async () => {
            const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/connection-model-definitions`, data, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (await isSuccessful(response.status)) {
                const configFilePath = path.join(platformModelActionPath, "definition", "config.json");

                const obj = JSON.parse(await readFile(configFilePath) as string);
                obj._id = response.data._id;

                await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));

                definitionId = response.data._id;
                definitionName = await getActionName(response.data.name.replaceAll(":", "-").replaceAll("/", "-"), definitionId);

                return {
                    success: true,
                    message: null,
                };
            } else {
                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                };
            }
        };

        let finalResponse = null;

        if (definitionId) {
            const response = await axios.patch(`${(await getStoredCredentials())?.url}/v1/connection-model-definitions/${definitionId}`, data, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (response.status === 404) {
                const newConnectionModelActionResponse = await createNewConnectionModelDefinition();

                if (!newConnectionModelActionResponse.success) {
                    return newConnectionModelActionResponse;
                }
            } else if (!await isSuccessful(response.status)) {
                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                };
            }

            finalResponse = {
                success: true,
                message: null,
            };
        } else {
            finalResponse = await createNewConnectionModelDefinition();
        }

        if (definitionName !== actionName) {
            const newPlatformModelActionPath = path.join(path.dirname(platformModelActionPath), definitionName);

            await renameFileOrFolder(platformModelActionPath, newPlatformModelActionPath);
        }

        return finalResponse;
    } catch (error) {
        return {
            success: false,
            message: axios.isAxiosError(error) ? `API Error: ${error.message}` : error,
        };
    }
};

export const pushPlatformAction = async () => {
    try {
        const {
            platform,
            all,
            models,
            connectionDefinitionId,
            platformId,
            connectionAuthMethod,
            setActive
        } = await initialise();
        console.log("\r\n");

        const platformPath = path.join(await getCurrentPath(), ...settings.paths.platforms.split("/"), platform);
        const modelsPath = path.join(platformPath, "models");

        if (all) {
            const platformModels = await listSubDirectories(modelsPath);

            await syncPlatformModelActions(platformModels, platform, connectionDefinitionId, connectionAuthMethod, platformId, setActive);
        } else {
            const platformModels = await listSubDirectories(modelsPath);

            let missingModels = 0;
            const modelNames = platformModels.map((platformModel) => platformModel.name);
            for (const model of models) {
                if (!modelNames.includes(model)) {
                    missingModels++;
                    console.error(`${model} does not exist!`);
                }

                if (missingModels !== 0) {
                    console.log("\r\n");
                }
            }

            await syncPlatformModelActions(platformModels.filter((model) => models.includes(model.name)), platform, connectionDefinitionId, connectionAuthMethod, platformId, setActive);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const syncPlatformModelActions = async (models: {
    name: any;
    path: any;
}[], platform: string, connectionDefinitionId: string, connectionAuthMethod: DataObject, platformId: string, setActive: boolean) => {
    let actionsSuccessCount = 0, totalModelsCount = models.length, totalActionsCount = 0;

    console.log(`Total: ${totalModelsCount}`);
    console.log("\r\n");

    for (const model of models) {
        console.log(`${model.name}:`);

        const actionsPath = path.join(model.path, model.name, "actions");
        let totalModelActionsCount = 0;

        if (await checkExistence(actionsPath)) {
            const platformModelActions = await listSubDirectories(actionsPath);
            totalModelActionsCount = platformModelActions.length;
            totalActionsCount += platformModelActions.length;
            let currentModelActionsSuccess = 0;

            for (const modelAction of platformModelActions) {
                const actionResponse = await syncPlatformAction(modelAction.name, path.join(modelAction.path, modelAction.name), connectionDefinitionId, connectionAuthMethod, setActive);

                if (actionResponse.success) {
                    actionsSuccessCount++;
                    currentModelActionsSuccess++;
                } else {
                    console.log(`\tAction ${modelAction.name}: ${pc.red(actionResponse.message as string)}`);
                }
            }

            console.log(`\tActions: ${currentModelActionsSuccess}/${totalModelActionsCount} Pushed`);
        } else {
            console.error("\tNo actions available.");
        }
    }

    if (totalModelsCount !== 0) {
        console.log("\r\n");
    }

    console.log(`Pushed ${actionsSuccessCount}/${totalActionsCount} actions for ${totalModelsCount} models for ${platform}.`);
};