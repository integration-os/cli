#!/usr/bin/env node

import {
    apiHeaders,
    checkExistence,
    getActionName,
    getCurrentPath,
    getStoredCredentials,
    isSuccessful,
    listSubDirectories,
    logger,
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

interface PushPlatformModelArguments {
    platform: string;
    all: boolean;
    models: string[];
    pushActions: boolean;
    connectionDefinitionId: string;
    connectionAuthMethod: DataObject;
    platformId: string;
    setActive: boolean;
}

const initialise = async (): Promise<PushPlatformModelArguments> => {
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

            const pushAllModels = await askIfShouldPushAllModels();
            let models: string[] = [];

            if (!pushAllModels) {
                models = await askForModelNames();
            }

            const pushActions = await askIfShouldPushActions();
            let setActive = false;

            if (pushActions) {
                setActive = await askForActiveStatus();
            }

            resolve({
                platform,
                all: pushAllModels,
                models,
                pushActions,
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

const askIfShouldPushAllModels = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to push all the platform models? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                resolve(true);
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                resolve(false);
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await askIfShouldPushAllModels());
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

const askIfShouldPushActions = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you also want to push all the actions in the selected models? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                resolve(true);
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                resolve(false);
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await askIfShouldPushActions());
            }
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

const syncPlatformSchema = async (platformName: string, platformModelPath: string, connectionDefinitionId: string, platformId: string, modelName: string) => {
    try {
        const data = await getPushStructureData(platformModelPath, settings.pushStructures.platform.schemas);
        const configFilePath = path.join(platformModelPath, "config.json");

        if (!data.connectionDefinitionId) {
            data.connectionDefinitionId = connectionDefinitionId;
        }

        if (!data.platformId) {
            data.platformId = platformId;
        }

        if (!data.mapping?.commonModelName) {
            data.mapping = null;
        }

        const schemaId = data._id;
        let pageId;

        const platformPageFilePath = path.join(platformModelPath, "page.json");

        if (await checkExistence(platformPageFilePath)) {
            const pageData = await getPushStructureData(platformModelPath, settings.pushStructures.platform.schemaPage);

            const createNewPlatformSchemaPage = async () => {
                const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/platform-pages`, pageData, {
                    headers: await apiHeaders(),
                    validateStatus: () => true,
                });

                if (await isSuccessful(response.status)) {
                    const obj = JSON.parse(await readFile(platformPageFilePath) as string);
                    obj._id = response.data._id;
                    pageId = response.data._id;
                    data.platformPageId = response.data._id;

                    await overwriteFile(platformPageFilePath, JSON.stringify(obj, null, 4));

                    const schemaObj = JSON.parse(await readFile(configFilePath) as string);
                    schemaObj.platformPageId = response.data._id;

                    await overwriteFile(configFilePath, JSON.stringify(schemaObj, null, 4));

                    return {
                        success: true,
                        message: null,
                        data: {
                            id: response.data._id,
                        }
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
                const newPlatformSchemaPageResponse = await createNewPlatformSchemaPage();

                if (!newPlatformSchemaPageResponse.success) {
                    return newPlatformSchemaPageResponse;
                }
            } else if (!await isSuccessful(response.status)) {
                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                    data: null,
                };
            }
        }

        if (!pageId) {
            const pageData = {
                ...settings.statics.schemaPageContent,
                platformName,
                platformId,
                connectionDefinitionId,
                modelName: data.modelName ?? "",
            };

            const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/platform-pages`, pageData, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (await isSuccessful(response.status)) {
                pageId = response.data._id;
                data.platformPageId = response.data._id;

                await overwriteFile(platformPageFilePath, JSON.stringify({
                    ...pageData,
                    _id: pageId,
                }, null, 4));

                if (await checkExistence(configFilePath)) {
                    const obj = JSON.parse(await readFile(configFilePath) as string);
                    obj.platformPageId = response.data._id;
                    obj.platformId = platformId;
                    obj.connectionDefinitionId = connectionDefinitionId;
                    await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));
                } else {
                    logger.log("error", `Schema: ${modelName}: Config file does not exist!`);

                    return {
                        success: false,
                        message: "Config file does not exist!",
                    };
                }
            } else {
                logger.log("error", `Schema Page: ${modelName}: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                };
            }
        }

        const updatePage = async (connectionModelSchemaId: string) => {
            const pageData = {
                ...JSON.parse(await readFile(platformPageFilePath) as string),
                type: "schema",
                connectionModelSchemaId,
            };

            const response = await axios.patch(`${(await getStoredCredentials())?.url}/v1/platform-pages/${pageData._id}`, pageData, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (await isSuccessful(response.status)) {
                await overwriteFile(platformPageFilePath, JSON.stringify(pageData, null, 4));

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

        const createNewConnectionModelSchema = async () => {
            const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/connection-model-schemas`, data, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (await isSuccessful(response.status)) {
                if (await checkExistence(configFilePath)) {
                    const obj = JSON.parse(await readFile(configFilePath) as string);
                    obj._id = response.data._id;
                    obj.version = response.data.version;

                    await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));

                    const pageUpdateResponse = await updatePage(response.data._id);

                    if (!pageUpdateResponse.success) {
                        return pageUpdateResponse;
                    }

                    return {
                        success: true,
                        message: null,
                        data: {
                            id: response.data._id,
                        }
                    };
                } else {
                    logger.log("error", `Schema: Create: ${modelName}: Config file does not exist!`);

                    return {
                        success: false,
                        message: "Config file does not exist!",
                    };
                }
            } else {
                logger.log("error", `Schema: Create: ${modelName}: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                };
            }
        };

        if (schemaId) {
            const response = await axios.patch(`${(await getStoredCredentials())?.url}/v1/connection-model-schemas/${schemaId}`, data, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (response.status === 404) {
                const newConnectionModelSchemaResponse = await createNewConnectionModelSchema();

                if (!newConnectionModelSchemaResponse.success) {
                    return newConnectionModelSchemaResponse;
                }
            } else if (!await isSuccessful(response.status)) {
                logger.log("error", `Schema: Patch: ${modelName}: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                };
            }

            const pageUpdateResponse = await updatePage(schemaId);

            if (!pageUpdateResponse.success) {
                return pageUpdateResponse;
            }

            return {
                success: true,
                message: null,
                data: {
                    id: schemaId,
                }
            };
        } else {
            return await createNewConnectionModelSchema();
        }
    } catch (error) {
        logger.log("error", `Schema: Fail: ${modelName}: ${axios.isAxiosError(error) ? `API Error: ${error.message}` : error}`);

        return {
            success: false,
            message: axios.isAxiosError(error) ? `API Error: ${error.message}` : error,
        };
    }
};

const syncPlatformAction = async (platformName: string, actionName: string, platformModelActionPath: string, connectionDefinitionId: string, connectionAuthMethod: DataObject, setActive: boolean, platformId: string, connectionModelSchemaId: string) => {
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
                    data.platformPageId = response.data._id;

                    await overwriteFile(platformPageFilePath, JSON.stringify(obj, null, 4));

                    return {
                        success: true,
                        message: null,
                    };
                } else {
                    logger.log("error", `Action Page: Create: ${actionName}: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

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
            } else if (await isSuccessful(response.status)) {
                await overwriteFile(platformPageFilePath, JSON.stringify({
                    ...pageData,
                    _id: pageId,
                }, null, 4));
            } else {
                logger.log("error", `Action Page: Patch: ${actionName}: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                    data: null,
                };
            }
        }

        if (!pageId) {
            const pageData = {
                ...settings.statics.actionPageContent,
                platformName,
                platformId,
                connectionDefinitionId,
                connectionModelSchemaId,
                modelName: data.modelName ?? "",
            };

            const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/platform-pages`, pageData, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (await isSuccessful(response.status)) {
                pageId = response.data._id;
                data.platformPageId = response.data._id;

                await overwriteFile(platformPageFilePath, JSON.stringify({
                    ...pageData,
                    _id: pageId,
                }, null, 4));
            } else {
                logger.log("error", `Schema Page: ${data.modelName}: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                };
            }
        }

        const updatePage = async (connectionModelDefinitionId: string) => {
            const pageData = {
                ...JSON.parse(await readFile(platformPageFilePath) as string),
                type: "action",
                connectionModelSchemaId,
                connectionModelDefinitionId,
            };

            const response = await axios.patch(`${(await getStoredCredentials())?.url}/v1/platform-pages/${pageData._id}`, pageData, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (await isSuccessful(response.status)) {
                await overwriteFile(platformPageFilePath, JSON.stringify(pageData, null, 4));

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

                const pageUpdateResponse = await updatePage(response.data._id);

                if (!pageUpdateResponse.success) {
                    return pageUpdateResponse;
                }

                definitionId = response.data._id;
                definitionName = await getActionName(response.data.name.replaceAll(":", "-").replaceAll("/", "-"), definitionId);

                return {
                    success: true,
                    message: null,
                };
            } else {
                logger.log("error", `Action: Create: ${actionName}: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

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
                logger.log("error", `Action: Patch: ${actionName}: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                };
            }

            const pageUpdateResponse = await updatePage(definitionId);

            if (!pageUpdateResponse.success) {
                return pageUpdateResponse;
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
        logger.log("error", `Action: Fail: ${actionName}: API Error: ${axios.isAxiosError(error) ? `API Error: ${error.message}` : error}`);

        return {
            success: false,
            message: axios.isAxiosError(error) ? `API Error: ${error.message}` : error,
        };
    }
};

export const pushPlatformModel = async () => {
    try {
        const {
            platform,
            all,
            models,
            pushActions,
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

            await syncPlatformModels(platformModels, platform, connectionDefinitionId, connectionAuthMethod, platformId, pushActions, setActive);
        } else {
            const platformModels = await listSubDirectories(modelsPath);

            await syncPlatformModels(platformModels.filter((model) => models.includes(model.name)), platform, connectionDefinitionId, connectionAuthMethod, platformId, pushActions, setActive);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const syncPlatformModels = async (models: {
    name: any;
    path: any;
}[], platform: string, connectionDefinitionId: string, connectionAuthMethod: DataObject, platformId: string, pushActions: boolean, setActive: boolean) => {
    let modelsSuccessCount = 0, actionsSuccessCount = 0, totalModelsCount = models.length, totalActionsCount = 0;

    console.log(`Total: ${totalModelsCount}`);
    console.log("\r\n");

    for (const model of models) {
        console.log(`${model.name}:`);

        const schemaResponse = await syncPlatformSchema(platform, path.join(model.path, model.name), connectionDefinitionId, platformId, model.name);

        if (schemaResponse.success) {
            modelsSuccessCount++;

            console.log("\tSchema: Pushed");

            if (pushActions) {
                const actionsPath = path.join(model.path, model.name, "actions");
                let totalModelActionsCount = 0;

                if (await checkExistence(actionsPath)) {
                    const platformModelActions = await listSubDirectories(actionsPath);
                    totalModelActionsCount = platformModelActions.length;
                    totalActionsCount += platformModelActions.length;
                    let currentModelActionsSuccess = 0;

                    for (const modelAction of platformModelActions) {
                        const actionResponse = await syncPlatformAction(platform, modelAction.name, path.join(modelAction.path, modelAction.name), connectionDefinitionId, connectionAuthMethod, setActive, platformId, schemaResponse.data?.id);

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
        } else {
            console.log(`\tSchema: ${pc.red(schemaResponse.message as string)}`);
            console.log(`\tActions: ${pc.red("Skipped")}`);
        }
    }

    console.log("\r\n");
    if (pushActions) {
        console.log(`Pushed ${modelsSuccessCount}/${totalModelsCount} models and ${actionsSuccessCount}/${totalActionsCount} actions for ${platform}.`);
    } else {
        console.log(`Pushed ${modelsSuccessCount}/${totalModelsCount} models for ${platform}.`);
    }
};