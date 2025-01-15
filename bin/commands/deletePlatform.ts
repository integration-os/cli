#!/usr/bin/env node

import path from "path";
import {
    apiHeaders,
    checkExistence,
    getAllRows,
    getCurrentPath,
    getStoredCredentials,
    logApiError,
    readLineInterface,
    removeFileOrFolder,
    splitNames,
    toPascalCase
} from "../helpers";
import settings from "../settings.json";
import axios from "axios";

interface DeletePlatformsArguments {
    platforms?: string[];
}

const initialise = async (): Promise<DeletePlatformsArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the names of platforms: ", async (platforms) => {
            const platformNames = (await splitNames(platforms)).filter((platform: string) => platform !== null && platform !== "");

            if (!platformNames.length) {
                return resolve(await initialise());
            }

            readLineInterface.close();

            resolve({
                platforms: platformNames,
            });
        });
    });
};

export const deletePlatform = async () => {
    try {
        const { platforms } = await initialise();
        console.log("\r\n");

        const platformsPath = path.join(await getCurrentPath(), ...settings.paths.platforms.split("/"));
        let totalPlatformsCount = 0;
        let successCount = 0;

        if (Array.isArray(platforms)) {
            totalPlatformsCount = platforms.length;
            console.log(`Total: ${totalPlatformsCount}`);
            console.log("\r\n");

            for (const platform of platforms) {
                const platformName = await toPascalCase(platform);

                console.log(`Platform to be deleted: ${platform}`);

                const platformPath = path.join(platformsPath, platformName);

                if (await checkExistence(platformPath)) {
                    const response = await axios.get(`${(await getStoredCredentials())?.url}/v1/public/connection-definitions?name=${platform}`, {
                        headers: await apiHeaders(),
                        validateStatus: () => true,
                    });

                    await logApiError(response.data?.error);

                    if (response.data.rows?.length) {
                        const platformId = response.data.rows[0]._id;

                        // Deleting actions
                        const actions = await getAllRows(`${(await getStoredCredentials())?.url}/v1/connection-model-definitions`, {
                            connectionDefinitionId: platformId
                        });

                        console.log(`Total actions to be deleted: ${actions.length}`);

                        let actionsDeleted = 0;
                        let actionsNotDeleted = 0;

                        for (const action of actions) {
                            const response = await axios.delete(`${(await getStoredCredentials())?.url}/v1/connection-model-definitions/${action._id}`, {
                                headers: await apiHeaders(),
                                validateStatus: () => true,
                            });

                            await logApiError(response.data?.error);

                            response.data?._id ? actionsDeleted++ : actionsNotDeleted++;
                        }

                        console.log(`${actionsDeleted}/${actions.length} actions deleted successfully!`);

                        // Deleting schemas
                        const schemas = await getAllRows(`${(await getStoredCredentials())?.url}/v1/connection-model-schemas`, {
                            connectionDefinitionId: platformId
                        });

                        console.log(`Total schemas to be deleted: ${schemas.length}`);

                        let schemasDeleted = 0;
                        let schemasNotDeleted = 0;

                        for (const schema of schemas) {
                            const response = await axios.delete(`${(await getStoredCredentials())?.url}/v1/connection-model-schemas/${schema._id}`, {
                                headers: await apiHeaders(),
                                validateStatus: () => true,
                            });

                            await logApiError(response.data?.error);

                            response.data?._id ? schemasDeleted++ : schemasNotDeleted++;
                        }

                        console.log(`${schemasDeleted}/${schemas.length} schemas deleted successfully!`);

                        // Deleting definition
                        const deleteResponse = await axios.delete(`${(await getStoredCredentials())?.url}/v1/connection-definitions/${platformId}`, {
                            headers: await apiHeaders(),
                            validateStatus: () => true,
                        });

                        await logApiError(deleteResponse.data?.error);

                        if (deleteResponse.data?.rows?.length) {
                            console.log(`Connection deleted successfully!`);
                        }
                    }

                    await removeFileOrFolder(platformPath);

                    console.log(`${platform} deleted successfully!`);
                    successCount++;
                } else {
                    console.error(`${platform} does not exist!`);
                }
            }

            console.log("\r\n");
            console.log(`Successfully deleted: ${successCount}`);
            console.log(`Failed: ${totalPlatformsCount - successCount}`);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};