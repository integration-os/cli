#!/usr/bin/env node

import settings from "../settings.json";
import { checkExistence, createFile, getCurrentPath, readLineInterface, removeFileOrFolder } from "../helpers";
import path from "path";

interface InitArguments {
    variables: {
        mongoPassword?: string,
        buildableSecret?: string,
        defaultLiveAccessKey?: string
        defaultTestAccessKey?: string
        developerAccountAccessKey?: string
        developerAccountId?: string
        eventAccessPassword?: string
        jwtSecret?: string
        gatewaySecret?: string
    },
    env: {
        apiUrl?: string
        xIosSecret?: string
        bearerToken?: string
    }
}

const initialise = async (): Promise<InitArguments> => {
    return new Promise(async (resolve) => {
        const defaultValues = {
            env: settings.env,
            variables: settings.variables
        };

        const mongoPassword = await askForConfigValue("Mongo Password", defaultValues.variables.MONGO_PASSWORD);
        const buildableSecret = await askForConfigValue("Buildable Secret", defaultValues.variables.BUILDABLE_SECRET);
        const defaultLiveAccessKey = await askForConfigValue("Default Live Access Key", defaultValues.variables.DEFAULT_LIVE_ACCESS_KEY);
        const defaultTestAccessKey = await askForConfigValue("Default Test Access Key", defaultValues.variables.DEFAULT_TEST_ACCESS_KEY);
        const developerAccountAccessKey = await askForConfigValue("Developer Account Access Key", defaultValues.variables.DEVELOPER_ACCOUNT_ACCESS_KEY);
        const developerAccountId = await askForConfigValue("Developer Account ID", defaultValues.variables.DEVELOPER_ACCOUNT_ID);
        const eventAccessPassword = await askForConfigValue("Event Access Password", defaultValues.variables.EVENT_ACCESS_PASSWORD);
        const jwtSecret = await askForConfigValue("JWT Secret", defaultValues.variables.JWT_SECRET);
        const gatewaySecret = await askForConfigValue("Gateway Secret", defaultValues.variables.GATEWAY_SECRET);
        const apiUrl = await askForConfigValue("API URL", defaultValues.env.API_URL);
        const xIosSecret = await askForConfigValue("X IOS Secret", defaultValues.env.X_PICA_SECRET);
        const bearerToken = await askForConfigValue("Bearer Token", defaultValues.env.BEARER_TOKEN);

        readLineInterface.close();

        resolve({
            variables: {
                mongoPassword,
                buildableSecret,
                defaultLiveAccessKey,
                defaultTestAccessKey,
                developerAccountAccessKey,
                developerAccountId,
                eventAccessPassword,
                jwtSecret,
                gatewaySecret,
            },
            env: {
                apiUrl,
                xIosSecret,
                bearerToken,
            },
        });
    });
};

const askForConfigValue = async (variableName: string, defaultValue: string): Promise<string> => {
    return new Promise((resolve) => {
        readLineInterface.question(`Enter the ${variableName}: (system default) `, async (value) => {
            if (!value?.length || value === "") {
                value = defaultValue;
            }

            resolve(value);
        });
    });
};

export const init = async (): Promise<void> => {
    try {
        const values = await initialise();

        const configurationPath = path.join(await getCurrentPath(), settings.paths.userConfig);

        if (await checkExistence(configurationPath)) {
            await removeFileOrFolder(configurationPath);
        }

        const response = await createFile(configurationPath, JSON.stringify(values, null, 4));

        if (response === true) {
            console.log("Configuration initialized!");
        } else {
            if (response instanceof Error) {
                console.error(response.message);
            } else {
                console.error("Something went wrong, please contact the developer!");
            }
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};