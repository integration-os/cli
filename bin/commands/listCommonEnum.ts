#!/usr/bin/env node

import { getAllRows, getStoredCredentials, sortByNameKey } from "../helpers";
import Table from "cli-table3";

export const listCommonEnum = async () => {
    try {
        const allEnums = await getAllRows(`${(await getStoredCredentials())?.url}/v1/public/sdk/common-enums`);

        const table = new Table({
            style: { head: ["reset"] },
            head: ["ID", "Name"]
        });

        const enums = (await sortByNameKey(allEnums)).map((enumItem) => [enumItem._id, enumItem.name]);

        table.push(...enums);

        console.log(table.toString());
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};