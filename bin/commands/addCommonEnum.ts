#!/usr/bin/env node

import settings from "../settings.json";
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
    splitNames
} from "../helpers";
import axios from "axios";

interface AddCommonEnumArguments {
    enums: string[];
}

const initialise = async (): Promise<AddCommonEnumArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the names of enums: ", async (enums) => {
            let enumNames = (await splitNames(enums)).filter((enumItem: string) => enumItem !== null && enumItem !== "");

            if (!enumNames.length) {
                return resolve(await initialise());
            }

            for (const enumName of enumNames) {
                if (await checkIfCommonEnumAlreadyExists(enumName)) {
                    console.error(`${enumName} already exists!`);

                    enumNames = enumNames.filter((item) => item !== enumName);
                } else if (await checkIfCommonEnumAlreadyExistsInDataBase(enumName)) {
                    if (!await askIfShouldAddAnyway(enumName)) {
                        enumNames = enumNames.filter((item) => item !== enumName);
                    }
                }
            }

            readLineInterface.close();

            resolve({
                enums: enumNames,
            });
        });
    });
};

const askIfShouldAddAnyway = async (enumName: string): Promise<boolean> => {
    return new Promise((resolve) => {
        readLineInterface.question(`${enumName} already exists in the Database. Do you add it anyway? (Y/N) `, async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                resolve(true);
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                resolve(false);
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await askIfShouldAddAnyway(enumName));
            }
        });
    });
};

const checkIfCommonEnumAlreadyExists = async (enumItem: string): Promise<boolean> => await checkExistence(path.join(await getCurrentPath(), ...settings.paths.commonEnums.split("/"), enumItem));

const checkIfCommonEnumAlreadyExistsInDataBase = async (enumItem: string): Promise<boolean> => {
    const enumResponse = await axios.get(`${(await getStoredCredentials())?.url}/v1/public/sdk/common-enums?name=${enumItem}`, {
        headers: await apiHeaders(),
        validateStatus: () => true,
    });

    return !!enumResponse?.data?.rows?.length;
};

export const addCommonEnum = async () => {
    try {
        const { enums } = await initialise();

        const commonEnumsPath = path.join(await getCurrentPath(), ...settings.paths.commonEnums.split("/"));

        const commonEnumFolderStructure = settings.structures.commonEnum;

        for (const enumItem of enums) {
            const enumPath = path.join(commonEnumsPath, enumItem);

            if (await checkExistence(enumPath)) {
                console.error(`${enumItem} already exists!`);
            } else {
                const modifiedCommonEnumStructure = await replaceStructureValues(cloneObject(commonEnumFolderStructure), {
                    enumName: enumItem
                });

                await createFolder(enumPath);
                await createFolderStructure(enumPath, {
                    ...modifiedCommonEnumStructure,
                    name: enumItem
                });

                console.log(`${enumItem} added!`);
            }
        }
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};