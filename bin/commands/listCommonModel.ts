#!/usr/bin/env node

import { getAllRows, getStoredCredentials, sortByNameKey } from "../helpers";
import Table from "cli-table3";

export const listCommonModel = async () => {
    try {
        const allModels = await getAllRows(`${(await getStoredCredentials())?.url}/v1/common-models`);

        const table = new Table({
            style: { head: ["reset"] },
            head: ["ID", "Name", "Category", "Primary"]
        });

        const models = (await sortByNameKey(allModels)).map((model) => [model._id, model.name, model.category, model.primary]);

        table.push(...models);

        console.log(table.toString());
    } catch (error) {
        console.error(`Error: ${error}`);
    }
};