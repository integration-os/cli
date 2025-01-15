#!/usr/bin/env node

import path from "path";
import {
    apiHeaders,
    checkExistence,
    getCurrentPath,
    getStoredCredentials,
    logApiError,
    readFile,
    readLineInterface,
    removeFileOrFolder,
    splitNames
} from "../helpers";
import settings from "../settings.json";
import axios from "axios";

interface DeleteCommonEnumsArguments {
    enums?: string[];
}

const initialise = async (): Promise<DeleteCommonEnumsArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the names of enums: ", async (enums) => {
            const enumNames = (await splitNames(enums)).filter((enumItem: string) => enumItem !== null && enumItem !== "");

            if (!enumNames.length) {
                return resolve(await initialise());
            }

            readLineInterface.close();

            resolve({
                enums: enumNames,
            });
        });
    });
};

export const deleteCommonEnum = async () => {
    try {
        const { enums } = await initialise();
        console.log("\r\n");

        const commonEnumsPath = path.join(await getCurrentPath(), ...settings.paths.commonEnums.split("/"));
        let totalEnumsCount = 0;
        let successCount = 0;

        if (Array.isArray(enums)) {
            totalEnumsCount = enums.length;
            console.log(`Total: ${totalEnumsCount}`);
            console.log("\r\n");

            for (const enumName of enums) {
                const enumPath = path.join(commonEnumsPath, enumName);

                if (await checkExistence(enumPath)) {
                    const configFilePath = path.join(enumPath, "config.json");
                    const configFileContent = JSON.parse(await readFile(configFilePath) as string);
                    const id = configFileContent?._id;

                    if (id) {
                        const response = await axios.delete(`${(await getStoredCredentials())?.url}/v1/common-enums/${id}`, {
                            headers: await apiHeaders(),
                            validateStatus: () => true,
                        });

                        await logApiError(response?.data?.error);
                    }

                    await removeFileOrFolder(enumPath);

                    successCount++;
                } else {
                    console.error(`${enumName} does not exist!`);
                }
            }
        }

        console.log("\r\n");
        console.log(`Successfully deleted: ${successCount}`);
        console.log(`Failed: ${totalEnumsCount - successCount}`);
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};