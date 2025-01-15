#!/usr/bin/env node

import {
    checkExistence,
    cloneObject,
    createFolderStructure,
    getCurrentPath,
    readLineInterface,
    replaceStructureValues,
    toPascalCase
} from "../helpers";
import path from "path";
import settings from "../settings.json";

interface AddPlatformOAuthArguments {
    platform: string,
}

const initialise = async (): Promise<AddPlatformOAuthArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the name of the platform: ", async (platform) => {
            if (!platform.length || platform === "") {
                return resolve(await initialise());
            }

            readLineInterface.close();

            resolve({ platform });
        });
    });
};

export const addPlatformOAuth = async () => {
    try {
        const { platform } = await initialise();

        const formattedPlatformName = await toPascalCase(platform);

        const platformPath = path.join(await getCurrentPath(), ...settings.paths.serverOAuth.split("/"), formattedPlatformName);

        if (!await checkExistence(platformPath)) {
            console.error(`${platform} does not exist!`);
        } else {
            const platformOAuthFolderStructure = settings.structures.platformOAuth;

            await createFolderStructure(platformPath, {
                ...await replaceStructureValues(cloneObject({
                    ...platformOAuthFolderStructure,
                    name: platform
                }), {
                    platformName: formattedPlatformName
                }),
                name: platform
            }, true);

            console.log(`OAuth folder for ${platform} added!`);
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};