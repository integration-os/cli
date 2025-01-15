#!/usr/bin/env node

import path from "path";
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
    splitNames
} from "../helpers";
import settings from "../settings.json";
import axios from "axios";
import { DataObject } from "../interfaces";
import pc from "picocolors";

interface PushPlatformArguments {
    platforms?: string[];
    all?: boolean;
    setActive?: boolean;
}

const initialise = async (): Promise<PushPlatformArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to push all platforms? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                const setActive = await askForActiveStatus();

                readLineInterface.close();

                resolve({
                    all: true,
                    platforms: [],
                    setActive,
                });
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                const platforms = await askForPlatformNames();

                const setActive = await askForActiveStatus();

                readLineInterface.close();

                resolve({
                    all: false,
                    platforms,
                    setActive,
                });
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await initialise());
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

const askForPlatformNames = async (): Promise<string[]> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the names of platforms: ", async (platforms) => {
            const platformNames = (await splitNames(platforms)).filter((platform: string) => platform !== null && platform !== "");

            if (!platformNames.length) {
                return resolve(await askForPlatformNames());
            }

            resolve(platformNames);
        });
    });
};

export const pushPlatform = async () => {
    try {
        const { all, platforms, setActive } = await initialise();
        console.log("\r\n");

        const platformsPath = path.join(await getCurrentPath(), ...settings.paths.platforms.split("/"));
        let successCount = 0;
        let failCount = 0;
        let totalPlatformsCount = 0;

        logger.log("info", "Starting Platform Push....");

        if (all) {
            const platforms = await listSubDirectories(platformsPath);

            totalPlatformsCount = platforms.length;

            if (!platforms.length) {
                console.error("No platforms available to push!");
            } else {
                console.log(`Total: ${platforms.length}`);
                console.log("\r\n");

                for (const platform of platforms) {
                    logger.log("info", `Pushing: ${platform.name}`);

                    const platformPath = path.join(platform.path, platform.name);

                    const success = await syncPlatform(platformPath, platform.name, setActive);

                    success ? successCount++ : failCount++;
                }
            }
        } else if (Array.isArray(platforms)) {
            totalPlatformsCount = platforms.length;

            console.log(`Total: ${platforms.length}`);
            console.log("\r\n");

            for (const platform of platforms) {
                const platformPath = path.join(platformsPath, platform);

                logger.log("info", `Pushing: ${platform}`);

                if (await checkExistence(platformPath)) {
                    const success = await syncPlatform(platformPath, platform, setActive);

                    success ? successCount++ : failCount++;
                } else {
                    console.error(`${platform} does not exist!`);
                    logger.log("error", `${platform} does not exist!`);

                    failCount++;
                }
            }
        }

        console.log(`Successfully pushed: ${successCount}`);
        console.log(`Failed: ${totalPlatformsCount - successCount}`);

        logger.log("info", "Finishing Platform Push....");
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const getPushStructureData = async (platformModelPath: string, structure: DataObject) => {
    let structureData: {
        [key: string]: any
    } = {};

    for (const {
        name,
        root,
        key,
        nested,
        copyKeys,
        manualStructure,
        spreadToRoot,
        addKeys,
        rearrangeKeys
    } of structure.files) {
        if (name.endsWith(".json")) {
            if (await checkExistence(path.join(platformModelPath, name))) {
                const fileContents: any = JSON.parse(await readFile(path.join(platformModelPath, name)) as string);

                if (copyKeys) {
                    copyKeys.forEach((key: string) => structureData[key] = fileContents[key]);
                }

                if (spreadToRoot) {
                    spreadToRoot.forEach((key: string) => {
                        if (fileContents[key] && typeof fileContents[key] === "object") {
                            Object.assign(structureData, fileContents[key]);
                        }
                    });
                }

                if (addKeys) {
                    Object.assign(structureData, addKeys);
                }

                if (rearrangeKeys) {
                    (rearrangeKeys as { from: string, to: string }[]).forEach(({ from, to }) => {
                        const fromParts = from.split(".");
                        const toParts = to.split(".");

                        let value = fileContents;
                        for (const part of fromParts) {
                            value = value ? value[part] : null;
                        }

                        if (value) {
                            let current = structureData;

                            for (let i = 0; i < toParts.length; i++) {
                                const part = toParts[i];

                                if (i === toParts.length - 1) {
                                    current[part] = value;
                                } else {
                                    current = current[part] = current[part] || {};
                                }
                            }
                        }
                    });
                }

                if (!manualStructure) {
                    if (root && key) {
                        structureData[key] = fileContents;
                    } else if (!root) {
                        structureData = {
                            ...structureData,
                            ...fileContents
                        };
                    }
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

const syncConnectionDefinition = async (platformPath: string) => {
    try {
        const data = await getPushStructureData(platformPath, settings.pushStructures.platform.connectionDefinition);

        let connectionDefinitionId = data._id;

        const createNewConnectionDefinition = async () => {
            const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/connection-definitions`, data, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (await isSuccessful(response.status)) {
                const configFilePath = path.join(platformPath, "configs", "connection-definition.json");

                const obj = JSON.parse(await readFile(configFilePath) as string);
                obj._id = response.data._id;
                data._id = response.data._id;

                await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));

                return {
                    success: true,
                    message: null,
                    data: null,
                };
            } else {
                logger.log("error", `Connection Definition: Create: ${connectionDefinitionId}: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: response.data?.error ?? response.data?.message ?? response.data,
                    data: null,
                };
            }
        };

        if (connectionDefinitionId) {
            const response = await axios.patch(`${(await getStoredCredentials())?.url}/v1/connection-definitions/${connectionDefinitionId}`, data, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (response.status === 404) {
                const newConnectionDefinitionResponse = await createNewConnectionDefinition();

                if (!newConnectionDefinitionResponse.success) {
                    return newConnectionDefinitionResponse;
                }
            } else if (!await isSuccessful(response.status)) {
                logger.log("error", `Connection Definition: Patch: ${connectionDefinitionId}: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: response.data?.error ?? response.data?.message ?? response.data,
                    data: null,
                };
            }
        } else {
            return await createNewConnectionDefinition();
        }

        return {
            success: true,
            data,
            message: null,
        };
    } catch (error) {
        logger.log("error", `Connection Definition: Fail: ${axios.isAxiosError(error) ? `API Error: ${error.message}` : error}`);

        return {
            success: false,
            message: axios.isAxiosError(error) ? `API Error: ${error.message}` : error,
            data: null,
        };
    }
};

const syncConnectionPlatform = async (platformPath: string, connectionDefinitionId: string) => {
    try {
        const data = await getPushStructureData(platformPath, settings.pushStructures.platform.platform);
        const configFilePath = path.join(platformPath, "configs", "connection-platform.json");

        if (!data.connectionDefinitionId) {
            data.connectionDefinitionId = connectionDefinitionId;

            const obj = JSON.parse(await readFile(configFilePath) as string);
            obj.connectionDefinitionId = connectionDefinitionId;
            await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));
        }

        let platformId = data._id;

        const createNewPlatform = async () => {
            const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/platforms`, data, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (await isSuccessful(response.status)) {
                const obj = JSON.parse(await readFile(configFilePath) as string);
                obj._id = response.data._id;
                platformId = response.data._id;

                await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));

                return {
                    success: true,
                    message: null,
                    data: null,
                };
            } else {
                logger.log("error", `Platform: Create: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                    data: null,
                };
            }
        };

        if (platformId) {
            const response = await axios.patch(`${(await getStoredCredentials())?.url}/v1/platforms/${platformId}`, data, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (response.status === 404) {
                const newPlatformResponse = await createNewPlatform();

                if (!newPlatformResponse.success) {
                    return newPlatformResponse;
                }
            } else if (!await isSuccessful(response.status)) {
                logger.log("error", `Platform: Patch: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                    data: null,
                };
            }
        } else {
            return await createNewPlatform();
        }

        return {
            success: true,
            data: { platformId },
            message: null,
        };
    } catch (error) {
        logger.log("error", `Platform: Fail: ${axios.isAxiosError(error) ? `API Error: ${error.message}` : error}`);

        return {
            success: false,
            message: axios.isAxiosError(error) ? `API Error: ${error.message}` : error,
            data: null,
        };
    }
};

const syncOauthConnectionDefinition = async (platformPath: string) => {
    try {
        const data = await getPushStructureData(platformPath, settings.pushStructures.platform.oauthConnectionDefinition);
        const configFilePath = path.join(platformPath, "configs", "oauth.json");

        let oauthConnectionDefinitionId = data._id;

        const createNewOauthConnectionDefinition = async () => {
            const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/connection-oauth-definitions`, data, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (await isSuccessful(response.status)) {
                const obj = JSON.parse(await readFile(configFilePath) as string);
                obj._id = response.data._id;
                oauthConnectionDefinitionId = response.data._id;

                await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));

                return {
                    success: true,
                    message: null,
                    data: null,
                };
            } else {
                logger.log("error", `OAuth Connection Definition: Create: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                    data: null,
                };
            }
        };

        if (oauthConnectionDefinitionId) {
            const response = await axios.patch(`${(await getStoredCredentials())?.url}/v1/connection-oauth-definitions/${oauthConnectionDefinitionId}`, data, {
                headers: await apiHeaders(),
                validateStatus: () => true,
            });

            if (response.status === 404) {
                const newOauthConnectionResponse = await createNewOauthConnectionDefinition();

                if (!newOauthConnectionResponse.success) {
                    return newOauthConnectionResponse;
                }
            } else if (!await isSuccessful(response.status)) {
                logger.log("error", `OAuth Connection Definition: Patch: API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

                return {
                    success: false,
                    message: `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`,
                    data: null,
                };
            }
        } else {
            return await createNewOauthConnectionDefinition();
        }

        return {
            success: true,
            message: null,
        };
    } catch (error) {
        logger.log("error", `OAuth Connection Definition: Fail: ${axios.isAxiosError(error) ? `API Error: ${error.message}` : error}`);

        return {
            success: false,
            message: axios.isAxiosError(error) ? `API Error: ${error.message}` : error,
            data: null,
        };
    }
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

const syncPlatformAction = async (platformName: string, actionName: string, platformModelActionPath: string, connectionDefinition: DataObject, setActive: boolean, platformId: string, connectionModelSchemaId: string) => {
    try {
        const data = await getPushStructureData(platformModelActionPath, settings.pushStructures.platform.actions);
        const configFilePath = path.join(platformModelActionPath, "definition", "config.json");

        let definitionName = await getActionName(data.name.replaceAll(":", "-").replaceAll("/", "-"), data._id),
            definitionId = data._id;

        if (!data.connectionDefinitionId) {
            data.connectionDefinitionId = connectionDefinition._id;

            const obj = JSON.parse(await readFile(configFilePath) as string);
            obj.connectionDefinitionId = connectionDefinition._id;
            await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));
        }

        if (!data.authMethod) {
            data.authMethod = connectionDefinition.authMethod;

            const obj = JSON.parse(await readFile(configFilePath) as string);
            obj.authMethod = connectionDefinition.authMethod;
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
                connectionDefinitionId: connectionDefinition._id,
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

const countActions = async (actionsPath: string) => {
    if (await checkExistence(actionsPath)) {
        return (await listSubDirectories(actionsPath)).length;
    } else {
        return 0;
    }
};

const syncPlatform = async (platformPath: string, platform: string, setConnectionDefinitionAsActive = false) => {
    try {
        console.log(pc.green(`${platform}`));

        const connectionDefinition = await syncConnectionDefinition(platformPath);

        if (connectionDefinition.success && connectionDefinition.data) {
            console.log("Connection Definition: Pushed");

            const platformData = await syncConnectionPlatform(platformPath, connectionDefinition.data._id);

            if (platformData.success && platformData.data) {
                console.log("Connection Platform: Pushed");

                await syncOauthConnectionDefinition(platformPath);

                const modelsPath = path.join(platformPath, "models");

                if (await checkExistence(modelsPath)) {
                    const platformModels = await listSubDirectories(path.join(platformPath, "models"));
                    const totalModelsCount = platformModels.length;
                    let modelsSuccessCount = 0, actionsSuccessCount = 0;

                    console.log(`Total Models: ${totalModelsCount}`);

                    for (const platformModel of platformModels) {
                        console.log(`${platformModel.name}:`);

                        const schemaResponse = await syncPlatformSchema(platform, path.join(platformModel.path, platformModel.name), connectionDefinition.data._id, platformData.data.platformId, platformModel.name);
                        const actionsPath = path.join(platformModel.path, platformModel.name, "actions");

                        if (schemaResponse.success) {
                            modelsSuccessCount++;

                            console.log("\tSchema: Pushed");

                            let actionsCount = 0;

                            if (await checkExistence(actionsPath)) {
                                const platformModelActions = await listSubDirectories(actionsPath);
                                actionsCount = platformModelActions.length;
                                let currentModelActionsSuccess = 0;

                                for (const modelAction of platformModelActions) {
                                    const actionResponse = await syncPlatformAction(platform, modelAction.name, path.join(modelAction.path, modelAction.name), connectionDefinition.data, setConnectionDefinitionAsActive, platformData.data.platformId, schemaResponse.data?.id);

                                    if (actionResponse.success) {
                                        actionsSuccessCount++;
                                        currentModelActionsSuccess++;
                                    } else {
                                        console.log(`\tAction ${modelAction.name}: ${pc.red(actionResponse.message as string)}`);
                                    }
                                }

                                console.log(`\tActions: ${currentModelActionsSuccess}/${actionsCount} Pushed`);
                            }
                        } else {
                            const actionsCount = await countActions(actionsPath);

                            logger.log("error", `Schema: ${platformModel.name}: Skipped!`);
                            logger.log("warn", `Actions: ${platformModel.name}: ${actionsCount} actions skipped!`);

                            console.log(`\tSchema: ${pc.red(schemaResponse.message as string)}`);
                            console.log(`\tActions: ${pc.red(`${actionsCount} actions skipped`)}`);
                        }
                    }

                    console.log(`Pushed ${modelsSuccessCount} schemas and ${actionsSuccessCount} actions.`);
                } else {
                    logger.log("error", `${platform} does not have any model data!`);

                    console.error(`${platform} does not have any model data!`);
                }

                console.log("\r\n");

                return true;
            } else {
                logger.log("error", `Connection Platform: ${platformData?.message}}`);

                console.log(`Connection Platform: ${pc.red(`${platformData?.message}`)}`);
                console.log("\r\n");

                return false;
            }
        } else {
            logger.log("error", `Connection Definition: ${connectionDefinition?.message}`);

            console.log(`Connection Definition: ${pc.red(`${connectionDefinition?.message}`)}`);
            console.log("\r\n");

            return false;
        }
    } catch (error) {
        logger.log("error", `${platform}: Fail: ${error}!`);

        console.error(`Error: ${error}`);

        return false;
    }
};