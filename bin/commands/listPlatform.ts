#!/usr/bin/env node

import { checkExistence, getAllRows, getStoredCredentials, sortByNameKey, toPascalCase } from "../helpers";
import Table from "cli-table3";

export const listPlatform = async () => {
    try {
        const allPlatforms = await getAllRows(`${(await getStoredCredentials())?.url}/v1/public/connection-definitions`);

        const table = new Table({
            style: { head: ["reset"] },
            head: ["ID", "Name", "Platform Version", "Pulled"]
        });


        const platforms = await Promise.all(
            (
                await sortByNameKey(allPlatforms))
                .map(async (platform) =>
                    [
                        platform._id, platform.name, platform.platformVersion, await checkExistence(await toPascalCase(platform.name))
                    ]
                )
        );

        table.push(...platforms);

        console.log(table.toString());
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};