#!/usr/bin/env node

import yargs from "yargs";
import { verifyServerConnection } from "./helpers";
import { listCommonModel } from "./commands/listCommonModel";
import { listCommonEnum } from "./commands/listCommonEnum";
import { listPlatform } from "./commands/listPlatform";
import { pushCommonModel } from "./commands/pushCommonModel";
import { pushCommonEnum } from "./commands/pushCommonEnum";
import { pushPlatform } from "./commands/pushPlatform";
import { deleteCommonModel } from "./commands/deleteCommonModel";
import { deleteCommonEnum } from "./commands/deleteCommonEnum";
import { deletePlatform } from "./commands/deletePlatform";
import { addCommonModel } from "./commands/addCommonModel";
import { addCommonEnum } from "./commands/addCommonEnum";
import { addPlatform } from "./commands/addPlatform";
import { addPlatformModel } from "./commands/addPlatformModel";
import { addPlatformOAuth } from "./commands/addPlatformOAuth";
import { init } from "./commands/init";
import { start } from "./commands/start";
import { stop } from "./commands/stop";
import { pullCommonModel } from "./commands/pullCommonModel";
import { pullCommonEnum } from "./commands/pullCommonEnum";
import { pullPlatform } from "./commands/pullPlatform";
import { pushPlatformModel } from "./commands/pushPlatformModel";
import { pushPlatformAction } from "./commands/pushPlatformAction";

const pullCommands: Record<string, () => Promise<void>> = {
    "model": pullCommonModel,
    "enum": pullCommonEnum,
    "platform": pullPlatform,
};

const pushCommands: Record<string, () => Promise<void>> = {
    "model": pushCommonModel,
    "enum": pushCommonEnum,
    "platform": pushPlatform,
    "platformModel": pushPlatformModel,
    "platformAction": pushPlatformAction
};

const listCommands: Record<string, () => Promise<void>> = {
    "model": listCommonModel,
    "enum": listCommonEnum,
    "platform": listPlatform,
};

const deleteCommands: Record<string, () => Promise<void>> = {
    "model": deleteCommonModel,
    "enum": deleteCommonEnum,
    "platform": deletePlatform,
};

const addCommands: Record<string, () => Promise<void>> = {
    "model": addCommonModel,
    "enum": addCommonEnum,
    "platform": addPlatform,
    "platformModel": addPlatformModel,
    "platformOAuth": addPlatformOAuth,
};

const executeCommand = async (commands: Record<string, () => Promise<void>>, entity: string) => {
    const command = commands[entity];

    if (command) {
        await command();

        process.exit(0);
    } else {
        yargs.showHelp();

        console.error("\r\nPlease choose a entity!");

        process.exit(1);
    }
};

((): void => {
    yargs
        .command("start", "Start", async () => {
            try {
                await start();

                process.exit(0);
            } catch (error) {
                console.error(`${error}\r\n`);

                process.exit(1);
            }
        })
        .command("stop", "Stop", async () => {
            try {
                await stop();

                process.exit(0);
            } catch (error) {
                console.error(`${error}\r\n`);

                process.exit(1);
            }
        })
        .command("init", "Init", async () => {
            try {
                await init();

                process.exit(0);
            } catch (error) {
                console.error(`${error}\r\n`);

                process.exit(1);
            }
        })
        .command("pull [entity]", "Pull model/enum/platform", (yargs) => yargs.positional("entity", {
            describe: "Entity To Pull: model/enum/platform",
        }), async (argv) => await executeCommand(pullCommands, argv.entity as string))
        .command("list [entity]", "List model/enum/platform", (yargs) => yargs.positional("entity", {
            describe: "Entity To List: model/enum/platform",
        }), async (argv) => await executeCommand(listCommands, argv.entity as string))
        .command("push [entity]", "Push model/enum/platform/platformModel/platformAction", (yargs) => yargs.positional("entity", {
            describe: "Entity To Push: model/enum/platform/platformModel/platformAction",
        }), async (argv) => await executeCommand(pushCommands, argv.entity as string))
        .command("delete [entity]", "Delete model/enum/platform", (yargs) => yargs.positional("entity", {
            describe: "Entity To Delete: model/enum/platform",
        }), async (argv) => await executeCommand(deleteCommands, argv.entity as string))
        .command("add [entity]", "Add model/enum/platform/platformModel/platformOAuth", (yargs) => yargs.positional("entity", {
            describe: "Entity To Add: model/enum/platform/platformModel/platformOAuth",
        }), async (argv) => await executeCommand(addCommands, argv.entity as string))
        .check(async () => verifyServerConnection())
        .fail((message, error, yargs) => {
            if (error) {
                throw error;
            }

            console.error(`${message}\r\n`);
            yargs.showHelp();
            console.error("\r\nYou have entered an invalid command!");
            process.exit(1);
        })
        .strict()
        .demandCommand(1, "Please use a command!")
        .recommendCommands().argv;
})();