#!/usr/bin/env node

import path from "path";
import {
    apiHeaders,
    checkExistence,
    cloneObject,
    createFolder,
    createFolderStructure,
    getCurrentPath,
    getStoredCredentials,
    readLineInterface,
    replaceStructureValues,
    splitNames,
    toPascalCase
} from "../helpers";
import settings from "../settings.json";
import { DataObject } from "../interfaces";
import axios from "axios";

interface AddPlatformArguments {
    platform: string,
    auth: string,
    models: string[]
}

const initialise = async (): Promise<AddPlatformArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the name of the platform: ", async (platform) => {
            if (!platform.length || platform === "") {
                return resolve(await initialise());
            }

            if (await checkIfPlatformAlreadyExists(platform)) {
                console.error("Platform already exists!");

                return resolve(await initialise());
            }

            if (await checkIfPlatformAlreadyExistsInDataBase(platform)) {
                if (!await askIfShouldAddAnyway()) {
                    return resolve(await initialise());
                }
            }

            const auth = await askForAuthType();

            const models = await askForModelNames();

            readLineInterface.close();

            resolve({
                platform,
                auth,
                models,
            });
        });
    });
};

const askIfShouldAddAnyway = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        readLineInterface.question("The platform already exists in the Database. Do you add it anyway? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                resolve(true);
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                resolve(false);
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await askIfShouldAddAnyway());
            }
        });
    });
};

const askForAuthType = async (): Promise<string> => {
    const getVerifiedAuthType = async (authType: string): Promise<string | null> => {
        const authTypes = ["oauth", "bearer", "basic", "apiKey", "oauthLegacy", "none"];

        for (const item of authTypes) {
            if (item.toLowerCase() === authType.toLowerCase()) {
                return authType;
            }
        }

        return null;
    };

    return new Promise((resolve) => {
        readLineInterface.question("Enter the authentication method (oauth/bearer/basic/apiKey/oauthLegacy/none): (oauth) ", async (authType) => {
            if (!authType.length || authType === "") {
                authType = "oauth";
            } else {
                const verifiedAuthType = await getVerifiedAuthType(authType);

                if (verifiedAuthType === null) {
                    return resolve(askForAuthType());
                } else {
                    authType = verifiedAuthType;
                }
            }

            resolve(authType);
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

const checkIfPlatformAlreadyExists = async (platform: string): Promise<boolean> => await checkExistence(path.join(await getCurrentPath(), ...settings.paths.platforms.split("/"), await toPascalCase(platform)));

const checkIfPlatformAlreadyExistsInDataBase = async (platform: string): Promise<boolean> => {
    const platformResponse = await axios.get(`${(await getStoredCredentials())?.url}/v1/public/connection-definitions?name=${platform}`, {
        headers: await apiHeaders(),
        validateStatus: () => true,
    });

    return !!platformResponse?.data?.rows?.length;
};

export const addPlatform = async (): Promise<void> => {
    try {
        const { platform, auth, models } = await initialise();

        const platformName = await toPascalCase(platform);
        const platformPath = path.join(await getCurrentPath(), ...settings.paths.platforms.split("/"), platformName);

        if (await checkExistence(platformPath)) {
            console.error(`Platform ${platform} already exists!`);
        } else {
            const platformFolderStructure = settings.structures.platformFolder;

            const hasNoAuth = auth === "none";

            const authenticationFolderStructure = hasNoAuth ? [] : platformFolderStructure.folders.find((folder: {
                name: string;
            }) => folder.name === "auth")?.folders?.filter((authFolder: {
                name: any;
            }) => authFolder.name === auth) ?? [];
            const modelFolderStructure: DataObject = platformFolderStructure.folders.find((folder: {
                name: string;
            }) => folder.name === "models")?.folders?.[0] ?? {};

            const modifiedConfig: DataObject = {
                ...await replaceStructureValues({ ...platformFolderStructure }, {
                    platformName,
                    isOauth: auth === "oauth",
                    connectionDefinitionId: "",
                }),
                folders: [
                    ...platformFolderStructure.folders.filter((folder: {
                        name: string;
                    }) => folder.name === "configs"),
                    {
                        ...platformFolderStructure.folders.find((folder: {
                            name: string;
                        }) => folder.name === "models"),
                        folders: await Promise.all(models.map(async (model: any) => ({
                            ...(await replaceStructureValues(cloneObject(modelFolderStructure), {
                                modelName: model,
                                platformVersion: "",
                                platformId: "",
                                connectionPlatform: platformName,
                                connectionDefinitionId: ""
                            })),
                            name: model
                        })))
                    }
                ]
            };

            if (!hasNoAuth) {
                modifiedConfig.folders.push({
                    ...platformFolderStructure.folders.find((folder: {
                        name: string;
                    }) => folder.name === "auth"),
                    folders: authenticationFolderStructure
                });
            }

            await createFolder(platformPath);
            await createFolderStructure(platformPath, modifiedConfig);

            console.log(`${platform} added as ${platformName}!`);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};