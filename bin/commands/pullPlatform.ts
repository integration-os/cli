#!/usr/bin/env node

import {
    apiHeaders,
    checkExistence,
    createFile,
    createFolder,
    extractProperties,
    getActionName,
    getAllRows,
    getCurrentPath,
    getStoredCredentials,
    isSuccessful,
    logger,
    moveKeyToRoot,
    nestByDotNotation,
    readLineInterface,
    redCross,
    removeFileOrFolder,
    splitNames,
    toPascalCase,
    yellowDash
} from "../helpers";
import path from "path";
import settings from "../settings.json";
import { DataObject } from "../interfaces";
import axios from "axios";
import pc from "picocolors";
import Table from "cli-table3";

interface PullPlatformArguments {
    platforms?: string[];
    all?: boolean;
    validate: boolean;
}

const initialise = async (): Promise<PullPlatformArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to pull all platforms? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                const validate = await askIfShouldValidate();

                readLineInterface.close();

                resolve({
                    all: true,
                    platforms: [],
                    validate,
                });
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                const platforms = await askForPlatformNames();
                const validate = await askIfShouldValidate();

                readLineInterface.close();

                resolve({
                    all: false,
                    platforms,
                    validate,
                });
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await initialise());
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

const askIfShouldValidate = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to validate each platform after pulling? (Y/N) ", async (answer) => {
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

export const pullPlatform = async () => {
    try {
        const { platforms, all, validate } = await initialise();
        console.log("\r\n");

        const platformsPath = path.join(await getCurrentPath(), ...settings.paths.platforms.split("/"));
        let successCount = 0;
        let failCount = 0;
        let totalPlatformsCount = 0;

        logger.log("info", "Starting Platform Pull....");

        if (all) {
            const platforms = await getAllRows(`${(await getStoredCredentials())?.url}/v1/public/connection-definitions`);

            totalPlatformsCount = platforms.length;

            console.log(`Total: ${totalPlatformsCount}`);
            console.log("\r\n");

            for (const platform of platforms) {
                const platformName = await toPascalCase(platform.platform);
                const platformId = platform._id;

                console.log(`Pulling: ${platformName}`);
                logger.log("info", `Pulling: ${platformName}`);

                const platformPath = path.join(platformsPath, platformName);

                const platformUrl = `${(await getStoredCredentials())?.url}/v1/public/connection-definitions?_id=${platformId}`;

                const success = await storePlatformData(platformUrl, platformPath, platformName, validate);

                success ? successCount++ : failCount++;

                console.log("\r\n");
            }
        } else if (Array.isArray(platforms)) {
            totalPlatformsCount = platforms.length;

            console.log(`Total: ${totalPlatformsCount}`);
            console.log("\r\n");

            for (const platform of platforms) {
                console.log(`Pulling: ${platform}`);
                logger.log("info", `Pulling: ${platform}`);

                const formattedName = await toPascalCase(platform);

                const platformPath = path.join(platformsPath, formattedName);

                const platformUrl = `${(await getStoredCredentials())?.url}/v1/public/connection-definitions?name=${platform}`;

                const success = await storePlatformData(platformUrl, platformPath, formattedName, validate);

                success ? successCount++ : failCount++;
            }
        }

        console.log("\r\n");
        console.log(`Successfully pulled: ${successCount}`);
        console.log(`Failed: ${totalPlatformsCount - successCount}`);
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const storeConnectionDefinitionData = async (configPath: string, connectionDefinitionData: DataObject) => {
    try {
        if (!await checkExistence(configPath)) {
            await createFolder(configPath);
        }

        const connectionDefinitionKeyStructure = settings.extractKeys.platformConnectionDefinition;

        for (const structure of connectionDefinitionKeyStructure) {
            const filePath = path.join(configPath, structure.path);

            if (await checkExistence(filePath)) {
                await removeFileOrFolder(filePath);
            }

            const parentDirectoryPath = path.dirname(filePath);
            if (!await checkExistence(parentDirectoryPath)) {
                await createFolder(parentDirectoryPath);
            }

            const properties = await extractProperties(connectionDefinitionData, structure.keys);

            let data = (structure.root ? Object.values(properties)[0] : properties) ?? "";

            if (structure.moveToRoot) {
                for (const item of structure.moveToRoot) {
                    data = await moveKeyToRoot(data, item.key, !!item.spread);
                }
            }

            if (typeof data === "object") {
                data = JSON.stringify(await nestByDotNotation(data), null, 4);
            }

            await createFile(filePath, data);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const storeConnectionPlatformData = async (configPath: string, connectionDefinitionData: DataObject) => {
    try {
        if (!await checkExistence(configPath)) {
            await createFolder(configPath);
        }

        const connectionPlatformKeyStructure = settings.extractKeys.platform;

        for (const structure of connectionPlatformKeyStructure) {
            const filePath = path.join(configPath, structure.path);

            if (await checkExistence(filePath)) {
                await removeFileOrFolder(filePath);
            }

            const parentDirectoryPath = path.dirname(filePath);
            if (!await checkExistence(parentDirectoryPath)) {
                await createFolder(parentDirectoryPath);
            }

            const properties = await extractProperties(connectionDefinitionData, structure.keys);

            let data = (structure.root ? Object.values(properties)[0] : properties) ?? "";
            if (typeof data === "object") {
                data = JSON.stringify(await nestByDotNotation(data), null, 4);
            }

            await createFile(filePath, data);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const storePublicConnectionDetails = async (configPath: string, publicConnectionDetails: DataObject) => {
    try {
        if (!await checkExistence(configPath)) {
            await createFolder(configPath);
        }

        const platformDetailKeyStructure = settings.extractKeys.platformDetail;

        for (const structure of platformDetailKeyStructure) {
            const filePath = path.join(configPath, structure.path);

            if (await checkExistence(filePath)) {
                await removeFileOrFolder(filePath);
            }

            const parentDirectoryPath = path.dirname(filePath);
            if (!await checkExistence(parentDirectoryPath)) {
                await createFolder(parentDirectoryPath);
            }

            const properties = await extractProperties(publicConnectionDetails, structure.keys);

            let data = (structure.root ? Object.values(properties)[0] : properties) ?? "";
            if (typeof data === "object") {
                data = JSON.stringify(await nestByDotNotation(data), null, 4);
            }

            await createFile(filePath, data);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const storeOauthConnectionDefinitionDetails = async (configPath: string, oauthConnectionDetails: DataObject) => {
    try {
        if (!await checkExistence(configPath)) {
            await createFolder(configPath);
        }

        const oauthConnectionDefinitionKeyStructure = settings.extractKeys.oauthConnectionDefinition;

        for (const structure of oauthConnectionDefinitionKeyStructure) {
            const filePath = path.join(configPath, structure.path);

            if (await checkExistence(filePath)) {
                await removeFileOrFolder(filePath);
            }

            const parentDirectoryPath = path.dirname(filePath);
            if (!await checkExistence(parentDirectoryPath)) {
                await createFolder(parentDirectoryPath);
            }

            const properties = await extractProperties(oauthConnectionDetails, structure.keys);

            let data = (structure.root ? Object.values(properties)[0] : properties) ?? "";
            if (typeof data === "object") {
                data = JSON.stringify(await nestByDotNotation(data), null, 4);
            }

            await createFile(filePath, data);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const storePlatformPage = async (modelPath: string, page: DataObject, isActionPage = false) => {
    try {
        if (!await checkExistence(modelPath)) {
            await createFolder(modelPath);
        }

        const platformPageKeyStructure = isActionPage ? settings.extractKeys.platformActionPage : settings.extractKeys.platformSchemaPage;

        for (const structure of platformPageKeyStructure) {
            const filePath = path.join(modelPath, structure.path);

            if (await checkExistence(filePath)) {
                await removeFileOrFolder(filePath);
            }

            const parentDirectoryPath = path.dirname(filePath);
            if (!await checkExistence(parentDirectoryPath)) {
                await createFolder(parentDirectoryPath);
            }

            const properties = await extractProperties(page, structure.keys);

            let data = (structure.root ? Object.values(properties)[0] : properties) ?? "";
            if (typeof data === "object") {
                data = JSON.stringify(await nestByDotNotation(data), null, 4);
            }

            await createFile(filePath, data);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const storeModelSchemaData = async (modelPath: string, model: DataObject, page?: DataObject) => {
    try {
        if (!await checkExistence(modelPath)) {
            await createFolder(modelPath);
        }

        const commonModelKeyStructure = settings.extractKeys.platformModelSchema;

        for (const structure of commonModelKeyStructure) {
            const filePath = path.join(modelPath, structure.path);

            if (await checkExistence(filePath)) {
                await removeFileOrFolder(filePath);
            }

            const parentDirectoryPath = path.dirname(filePath);
            if (!await checkExistence(parentDirectoryPath)) {
                await createFolder(parentDirectoryPath);
            }

            const properties = await extractProperties(model, structure.keys);

            let data = (structure.root ? Object.values(properties)[0] : properties) ?? "";
            if (typeof data === "object") {
                data = JSON.stringify(await nestByDotNotation(data), null, 4);
            }

            await createFile(filePath, data);
        }

        if (page) {
            await storePlatformPage(modelPath, page);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const storeModelActionData = async (modelPath: string, action: DataObject, page?: DataObject) => {
    try {
        if (!await checkExistence(modelPath)) {
            await createFolder(modelPath);
        }

        const commonModelKeyStructure = settings.extractKeys.platformModelAction;

        for (const structure of commonModelKeyStructure) {
            const filePath = path.join(modelPath, structure.path);

            if (await checkExistence(filePath)) {
                await removeFileOrFolder(filePath);
            }

            const parentDirectoryPath = path.dirname(filePath);
            if (!await checkExistence(parentDirectoryPath)) {
                await createFolder(parentDirectoryPath);
            }

            const properties = await extractProperties(action, structure.keys);

            let data = (structure.root ? Object.values(properties)[0] : properties) ?? "";
            if (typeof data === "object") {
                data = JSON.stringify(await nestByDotNotation(data), null, 4);
            }

            await createFile(filePath, data);
        }

        if (page) {
            await storePlatformPage(modelPath, page, true);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const validatePull = async (platformPath: string, data: {
    models: DataObject[];
    actions: DataObject[];
    connectionDefinitionData: DataObject;
    platformData: DataObject;
    connectionDetails: DataObject;
}): Promise<{
    success: boolean;
}> => {
    let invalidated = false;
    const {
        models, actions, connectionDefinitionData, platformData, connectionDetails
    } = data;
    const table = new Table({
        style: { head: ["reset"] },
    });

    console.log(`${pc.blue("Validating...")}`);

    if (await checkExistence(platformPath)) {
        table.push([{
            colSpan: 7,
            content: "Platform folder ✔",
        }]);

        const configsFolderPath = path.join(platformPath, "configs");

        if (await checkExistence(configsFolderPath)) {
            const configRow = [];
            configRow.push("Configs folder: ✔");

            const authenticationConfig = path.join(configsFolderPath, "authentication.json");
            const connectionDefinitionConfig = path.join(configsFolderPath, "connection-definition.json");
            const connectionPlatformConfig = path.join(configsFolderPath, "connection-platform.json");
            const publicConfig = path.join(configsFolderPath, "public.json");

            if (authenticationConfig) {
                configRow.push("Authentication: ✔");
            } else {
                if (connectionDefinitionData.frontend.connectionForm.formData) {
                    logger.log("error", "Authentication config missing.");
                    configRow.push(`Authentication: ${redCross}`);

                    invalidated = true;
                } else {
                    logger.log("warn", "Authentication config unavailable.");
                    configRow.push(`Authentication: ${yellowDash}`);
                }
            }

            if (connectionDefinitionConfig) {
                configRow.push("Connection definition: ✔");
            } else {
                if (connectionDefinitionData) {
                    logger.log("error", "Connection definition config missing.");
                    configRow.push(`Connection definition: ${redCross}`);

                    invalidated = true;
                } else {
                    logger.log("warn", "Connection definition config unavailable.");
                    configRow.push(`Connection definition: ${yellowDash}`);
                }
            }

            if (connectionPlatformConfig) {
                configRow.push("Connection platform: ✔");
            } else {
                if (platformData) {
                    logger.log("error", "Connection platform config missing.");
                    configRow.push(`Connection platform: ${redCross}`);

                    invalidated = true;
                } else {
                    logger.log("warn", "Connection platform config unavailable.");
                    configRow.push(`Connection platform: ${yellowDash}`);
                }
            }

            if (publicConfig) {
                configRow.push("Public: ✔");
            } else {
                if (connectionDetails) {
                    logger.log("error", "Public config missing.");
                    configRow.push(`Public: ${redCross}`);

                    invalidated = true;
                } else {
                    logger.log("warn", "Public config unavailable.");
                    configRow.push(`Public: ${yellowDash}`);
                }
            }

            table.push([{
                colSpan: 7,
                content: configRow.join("    ")
            }]);
        } else {
            logger.log("error", "Configs folder missing.");
            table.push([`Configs folder: ${redCross}`]);

            invalidated = true;
        }

        const modelsFolderPath = path.join(platformPath, "models");

        if (await checkExistence(modelsFolderPath)) {
            table.push([{
                colSpan: 7,
                content: "Models folder: ✔",
            }]);

            for (const model of models) {
                const modelRow = [];
                const sanitizedModelName = model.modelName.replace(/[:/]/g, "_");
                modelRow.push(`${model.modelName}`);

                const modelFolderPath = path.join(modelsFolderPath, sanitizedModelName);

                if (await checkExistence(modelFolderPath)) {
                    modelRow.push("Folder: ✔");

                    const modelConfigPath = path.join(modelFolderPath, "config.json");
                    const modelPagePath = path.join(modelFolderPath, "page.json");
                    const modelSamplePath = path.join(modelFolderPath, "sample.json");

                    if (modelConfigPath) {
                        modelRow.push("Config: ✔");
                    } else {
                        logger.log("error", `Model config missing for ${model.modelName}.`);
                        modelRow.push(`Config: ${redCross}`);

                        invalidated = true;
                    }

                    if (modelPagePath) {
                        modelRow.push("Page: ✔");
                    } else {
                        logger.log("error", `Model page missing for ${model.modelName}.`);
                        modelRow.push(`Page: ${redCross}`);

                        invalidated = true;
                    }

                    if (modelSamplePath) {
                        modelRow.push("Sample: ✔");
                    } else {
                        logger.log("error", `Model sample missing for ${model.modelName}.`);
                        modelRow.push(`Sample: ${redCross}`);

                        invalidated = true;
                    }

                    const schemaColumn = [];
                    const modelSchemaFolderPath = path.join(modelFolderPath, "schema");

                    if (await checkExistence(modelSchemaFolderPath)) {
                        schemaColumn.push("Schema folder: ✔");

                        const modelSchemaFromPath = path.join(modelSchemaFolderPath, "fromCommonModel.js");
                        const modelSchemaToPath = path.join(modelSchemaFolderPath, "toCommonModel.js");

                        if (modelSchemaFromPath) {
                            schemaColumn.push("From: ✔");
                        } else {
                            logger.log("error", `Model schema from missing for ${model.modelName}.`);
                            schemaColumn.push(`From: ${redCross}`);

                            invalidated = true;
                        }

                        if (modelSchemaToPath) {
                            schemaColumn.push("To: ✔");
                        } else {
                            logger.log("error", `Model schema to missing for ${model.modelName}.`);
                            schemaColumn.push(`To: ${redCross}`);

                            invalidated = true;
                        }
                    } else {
                        logger.log("error", `Model schema folder missing for ${model.modelName}.`);
                        schemaColumn.push(`Schema folder: ${redCross}`);

                        invalidated = true;
                    }
                    modelRow.push(schemaColumn.join("\n"));

                    const actionColumn = [];
                    const modelActionsFolderPath = path.join(modelFolderPath, "actions");
                    const modelActions = actions.filter(action => action.modelName === model.modelName);

                    if (await checkExistence(modelActionsFolderPath)) {
                        actionColumn.push("Actions folder: ✔");

                        for (const action of modelActions) {
                            actionColumn.push(`${action.name}: `);
                            const actionFolderPath = path.join(modelActionsFolderPath, await getActionName(action.name.replace(/[:/]/g, "-"), action._id));

                            const actionColumnRow = [];
                            if (await checkExistence(actionFolderPath)) {
                                actionColumnRow.push("Folder: ✔");

                                const actionDefinitionFolderPath = path.join(actionFolderPath, "definition");

                                if (await checkExistence(actionDefinitionFolderPath)) {
                                    actionColumnRow.push("Definition Folder: ✔");

                                    const actionDefinitionConfigPath = path.join(actionDefinitionFolderPath, "config.json");
                                    const actionDefinitionPagePath = path.join(actionDefinitionFolderPath, "page.json");
                                    const actionDefinitionSamplesPath = path.join(actionDefinitionFolderPath, "samples.json");
                                    const actionDefinitionResponsesPath = path.join(actionDefinitionFolderPath, "response.json");

                                    if (actionDefinitionConfigPath) {
                                        actionColumnRow.push("Config: ✔");
                                    } else {
                                        logger.log("error", `Model actions definition config missing for ${model.modelName}:${action.name}.`);
                                        actionColumnRow.push(`Config: ${redCross}`);

                                        invalidated = true;
                                    }

                                    if (actionDefinitionPagePath) {
                                        actionColumnRow.push("Page: ✔");
                                    } else {
                                        logger.log("error", `Model actions definition page missing for ${model.modelName}:${action.name}.`);
                                        actionColumnRow.push(`Page: ${redCross}`);

                                        invalidated = true;
                                    }

                                    if (actionDefinitionSamplesPath) {
                                        actionColumnRow.push("Samples: ✔");
                                    } else {
                                        logger.log("error", `Model actions definition samples missing for ${model.modelName}:${action.name}.`);
                                        actionColumnRow.push(`Samples: ${redCross}`);

                                        invalidated = true;
                                    }

                                    if (actionDefinitionResponsesPath) {
                                        actionColumnRow.push("Responses: ✔");
                                    } else {
                                        logger.log("error", `Model actions definition responses missing for ${model.modelName}:${action.name}.`);
                                        actionColumnRow.push(`Responses: ${redCross}`);

                                        invalidated = true;
                                    }
                                } else {
                                    logger.log("error", `Model actions definition folder missing for ${model.modelName}:${action.name}.`);
                                    actionColumnRow.push(`Definition Folder: ${redCross}`);

                                    invalidated = true;
                                }

                                const actionFromPath = path.join(actionFolderPath, "fromCommonModel.js");
                                const actionToPath = path.join(actionFolderPath, "toCommonModel.js");

                                if (actionFromPath) {
                                    actionColumnRow.push("From: ✔");
                                } else {
                                    logger.log("error", `Model actions from missing for ${model.modelName}:${action.name}.`);
                                    actionColumnRow.push(`From: ${redCross}`);

                                    invalidated = true;
                                }

                                if (actionToPath) {
                                    actionColumnRow.push("To: ✔");
                                } else {
                                    logger.log("error", `Model actions to missing for ${model.modelName}:${action.name}.`);
                                    actionColumnRow.push(`To: ${redCross}`);

                                    invalidated = true;
                                }
                            } else {
                                logger.log("error", `Model actions folder missing for ${model.modelName}:${action.name}.`);
                                actionColumnRow.push(`Folder: ${redCross}`);

                                invalidated = true;
                            }
                            actionColumn.push(actionColumnRow.join("    "));
                        }
                    } else {
                        if (modelActions.length) {
                            logger.log("error", `Model actions folder missing for ${model.modelName}.`);
                            actionColumn.push(`Actions folder: ${redCross}`);

                            invalidated = true;
                        } else {
                            logger.log("warn", `Model actions unavailable for ${model.modelName}.`);
                            actionColumn.push(`Actions folder: ${yellowDash}`);
                        }
                    }
                    modelRow.push(actionColumn.join("\n"));
                } else {
                    logger.log("error", `Model folder missing for ${model.modelName}.`);
                    modelRow.push(`${model.modelName} folder: ${redCross}`);

                    invalidated = true;
                }

                table.push(modelRow);
            }
        } else {
            if (models.length) {
                logger.log("error", "Models folder missing.");
                table.push([`Models folder: ${redCross}`]);

                invalidated = true;
            } else {
                logger.log("warn", "Models unavailable.");
                table.push([`Models folder: ${yellowDash}`]);
            }

        }
    } else {
        logger.log("error", "Platform folder missing.");
        table.push([`Platform Folder: ${redCross}`]);

        invalidated = true;
    }

    console.log(table.toString());

    return {
        success: !invalidated,
    };
};

const storePlatformData = async (platformUrl: string, platformPath: string, platformName: string, validate: boolean) => {
    const headers = await apiHeaders();

    const platformResponse = await axios.get(platformUrl, {
        headers,
        validateStatus: () => true,
    });

    if (await isSuccessful(platformResponse.status)) {
        if (platformResponse.data?.rows?.length) {
            const connectionDefinitionData = platformResponse.data.rows[0];
            const connectionPlatform = connectionDefinitionData.platform;

            const configsPath = path.join(platformPath, "configs");
            await storeConnectionDefinitionData(configsPath, connectionDefinitionData);

            const platformData = await axios.get(`${(await getStoredCredentials())?.url}/v1/platforms`, {
                headers,
                params: {
                    connectionDefinitionId: connectionDefinitionData._id
                }
            });

            await storeConnectionPlatformData(configsPath, platformData.data.rows[0]);

            const publicConnectionDetails = await axios.get(`${(await getStoredCredentials())?.url}/v1/public/connection-data`, {
                headers,
                params: {
                    platform: connectionDefinitionData.platform
                }
            });

            await storePublicConnectionDetails(configsPath, publicConnectionDetails.data?.rows?.[0] ?? {});

            const oauthConnectionDefinitionDetails = await axios.get(`${(await getStoredCredentials())?.url}/v1/connection-oauth-definitions`, {
                headers,
                params: {
                    connectionPlatform,
                }
            });

            await storeOauthConnectionDefinitionDetails(configsPath, oauthConnectionDefinitionDetails.data.rows[0] ?? {});

            const platformPages = await getAllRows(`${(await getStoredCredentials())?.url}/v1/platform-pages`, {
                connectionDefinitionId: connectionDefinitionData._id
            });

            console.log(`Pages: ${platformPages.length}`);

            const models = await getAllRows(`${(await getStoredCredentials())?.url}/v1/connection-model-schemas`, {
                connectionDefinitionId: connectionDefinitionData._id
            });

            console.log(`Models: ${models.length}`);

            if (models.length) {
                for (const model of models) {
                    const modelPath = path.join(platformPath, "models", model.modelName.replaceAll(":", "_").replaceAll("/", "_"));

                    await storeModelSchemaData(modelPath, model, platformPages.find((page) => page.connectionModelSchemaId === model._id && ["schema", "schemaUngenerated"].includes(page.type)));
                }
            }

            const actions = await getAllRows(`${(await getStoredCredentials())?.url}/v1/connection-model-definitions`, {
                connectionDefinitionId: connectionDefinitionData._id
            });

            console.log(`Actions: ${actions.length}`);

            let toBeProcessedActionsCount = 0;

            if (actions.length) {
                for (const action of actions) {
                    const actionPath = path.join(platformPath, "models", action.modelName.replaceAll(":", "_").replaceAll("/", "_"), "actions", await getActionName(action.name.replaceAll(":", "-").replaceAll("/", "-"), action._id));

                    await storeModelActionData(actionPath, action, platformPages.find((page) => page.connectionModelDefinitionId === action._id && ["action", "actionUngenerated"].includes(page.type)));

                    toBeProcessedActionsCount++;
                }
            }

            if (validate) {
                const validation = await validatePull(platformPath, {
                    models,
                    actions,
                    connectionDefinitionData,
                    platformData: platformData.data.rows[0],
                    connectionDetails: publicConnectionDetails.data?.rows?.[0] ?? {}
                });

                if (validation.success) {
                    console.log(`${pc.green("Pull Validated!")}`);

                    return true;
                } else {
                    console.error(`${pc.red("Pull Validation Failed!")}`);

                    return false;
                }
            }
        } else {
            console.error(`${platformName} does not exist!`);
            logger.log("error", `${platformName} does not exist!`);

            return false;
        }
    } else {
        console.error(`${platformName}: pull failed!`);
        logger.log("error", `${platformName}: pull failed!`);

        return false;
    }
};