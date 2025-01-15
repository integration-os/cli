import path from "path";
import {
    apiHeaders,
    checkExistence,
    getCurrentPath,
    getStoredCredentials,
    isSuccessful,
    listSubDirectories,
    logApiError,
    logger,
    overwriteFile,
    readFile,
    readLineInterface,
    splitNames
} from "../helpers";
import settings from "../settings.json";
import axios from "axios";

interface PushCommonEnumsArguments {
    enums?: string[];
    all?: boolean;
}

const initialise = async (): Promise<PushCommonEnumsArguments> => {
    return new Promise((resolve) => {
        readLineInterface.question("Do you want to push all common enums? (Y/N) ", async (answer) => {
            if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
                readLineInterface.close();

                resolve({
                    all: true,
                    enums: [],
                });
            } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
                const enums = await askForEnumNames();

                readLineInterface.close();

                resolve({
                    all: false,
                    enums,
                });
            } else {
                console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

                resolve(await initialise());
            }
        });
    });
};

const askForEnumNames = async (): Promise<string[]> => {
    return new Promise((resolve) => {
        readLineInterface.question("Enter the names of enums: ", async (enums) => {
            const enumNames = (await splitNames(enums)).filter((enumItem: string) => enumItem !== null && enumItem !== "");

            if (!enumNames.length) {
                return resolve(await askForEnumNames());
            }

            resolve(enumNames);
        });
    });
};

export const pushCommonEnum = async () => {
    try {
        const { all, enums } = await initialise();
        console.log("\r\n");

        const commonEnumsPath = path.join(await getCurrentPath(), ...settings.paths.commonEnums.split("/"));
        let successCount = 0;
        let failCount = 0;
        let totalEnumsCount = 0;

        logger.log("info", "Starting Common Enum Push....");

        if (all) {
            const localEnums = (await listSubDirectories(commonEnumsPath)).map((enumItem) => enumItem.name);

            if (!localEnums.length) {
                console.error("No enums available to push!");
            } else {
                totalEnumsCount = localEnums.length;
                console.log(`Total: ${totalEnumsCount}`);
                console.log("\r\n");

                for (const localEnum of localEnums) {
                    logger.log("info", `Pushing: ${localEnum}`);

                    const enumPath = path.join(commonEnumsPath, localEnum);

                    const success = await syncCommonEnum(localEnum, enumPath);

                    success ? successCount++ : failCount++;
                }
            }
        } else if (Array.isArray(enums)) {
            totalEnumsCount = enums.length;
            console.log(`Total: ${totalEnumsCount}`);
            console.log("\r\n");

            for (const item of enums) {
                logger.log("info", `Pushing: ${item}`);

                const enumPath = path.join(commonEnumsPath, item);

                if (await checkExistence(enumPath)) {
                    const success = await syncCommonEnum(item, enumPath);

                    success ? successCount++ : failCount++;
                } else {
                    console.error(`${item} does not exist!`);
                }
            }
        }

        console.log("\r\n");
        console.log(`Successfully pushed: ${successCount}`);
        console.log(`Failed: ${totalEnumsCount - successCount}`);
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};

const getPushStructureData = async (enumPath: string) => {
    const pushStructure = settings.pushStructures.commonEnums;

    let structureData: {
        [key: string]: any
    } = {};

    for (const { name } of pushStructure.files) {
        if (name.endsWith(".json")) {
            if (await checkExistence(path.join(enumPath, name))) {
                const fileContents: any = JSON.parse(await readFile(path.join(enumPath, name)) as string);

                structureData = {
                    ...structureData,
                    ...fileContents
                };
            }
        } else {
            console.error(`${name} file is not supported.`);
            process.exit(1);
        }
    }

    return structureData;
};

const syncCommonEnum = async (enumItem: string, enumPath: string) => {
    const data = await getPushStructureData(enumPath);

    const enumId = data._id;

    const createNewCommonEnum = async (containsId = false) => {
        const response = await axios.post(`${(await getStoredCredentials())?.url}/v1/common-enums`, data, {
            headers: await apiHeaders(),
            validateStatus: () => true,
        });

        if (await isSuccessful(response.status)) {
            const configFilePath = path.join(enumPath, "config.json");

            const obj = JSON.parse(await readFile(configFilePath) as string);
            obj._id = response.data._id;

            await overwriteFile(configFilePath, JSON.stringify(obj, null, 4));

            containsId
                ? console.log(`${enumItem} added! Config file has been updated.`)
                : console.log(`${enumItem} added! Config file has been updated with the id.`);

            return true;
        } else {
            logger.log("error", `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

            await logApiError(response.data?.error ?? response.data?.message ?? response.data);

            return false;
        }
    };

    if (enumId) {
        const response = await axios.patch(`${(await getStoredCredentials())?.url}/v1/common-enums/${enumId}`, data, {
            headers: await apiHeaders(),
            validateStatus: () => true,
        });

        if (await isSuccessful(response.status)) {
            if (response.data?.success) {
                console.log(`${enumItem} updated!`);

                return true;
            }

            return false;
        } else if (response.status === 404) {
            return await createNewCommonEnum(true);
        } else {
            logger.log("error", `API Error: ${response.data?.error ?? response.data?.message ?? response.data}`);

            await logApiError(response.data?.error ?? response.data?.message ?? response.data);

            return false;
        }
    } else {
        return await createNewCommonEnum();
    }
};