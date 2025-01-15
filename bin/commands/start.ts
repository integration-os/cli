#!/usr/bin/env node

import {
    downloadFile,
    getCurrentPath,
    getUserConfiguration,
    joinKeyValuePairs,
    platformIsSupported,
    readLineInterface
} from "../helpers";
import { exec, execSync, spawn } from "node:child_process";
import settings from "../settings.json";
import * as os from "node:os";
import path from "path";
import * as fs from "node:fs";
import { promisify } from "node:util";
import { DockerVariables } from "../interfaces";

interface StartArguments {
	iosCryptoSecret: string;
	seed?: boolean;
}

const initialise = async (): Promise<StartArguments> => {
	return new Promise(async (resolve) => {
		const iosCryptoSecret = await askForValue("IOS Crypto Secret (32 characters long)", 32);
		const seed = await askIfSeedingIsRequired();

		readLineInterface.close();

		resolve({
			iosCryptoSecret,
			seed,
		});
	});
};

const askForValue = async (variableName: string, length?: number): Promise<string> => {
	return new Promise((resolve) => {
		readLineInterface.question(`Enter the ${variableName}: `, async (value) => {
			if (!value?.length || value === "") {
				resolve(await askForValue(variableName));
			}

			if (length && value.length !== length) {
				resolve(await askForValue(variableName));
			}

			resolve(value);
		});
	});
};

const askIfSeedingIsRequired = async (): Promise<boolean> => {
	return new Promise((resolve) => {
		readLineInterface.question("Do you want to seed? (Y/N) ", async (answer) => {
			if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
				resolve(true);
			} else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
				resolve(false);
			} else {
				console.log("Invalid input. Please enter 'Y' for Yes or 'N' for No.");

				resolve(await askIfSeedingIsRequired());
			}
		});
	});
};

export const start = async () => {
	try {
		if (!(await platformIsSupported())) {
			console.error("Platform not supported! Please contact the developer!");

			return;
		}

		const options: StartArguments = await initialise();

		const platform = os.platform();

		if (platform === "win32") {
			await windowsStart(options);
		} else if (["linux", "darwin"].includes(platform)) {
			await unixStart(options);
		} else {
			console.error("Platform not supported! Please contact the developer!");
			process.exit(1);
		}
	} catch (error) {
		console.error(`Error: ${error}`);
	}
};

const unixStart = async (options: StartArguments) => {
	const { iosCryptoSecret, seed } = options;

	const userConfig = await getUserConfiguration();

	const env = await joinKeyValuePairs({
		...(userConfig?.variables ?? settings.variables),
		IOS_CRYPTO_SECRET: iosCryptoSecret,
	});

	const execute = promisify(exec);

	const startDocker = async () => {
		try {
			const {
				stdout,
				stderr
			} = await execute(`curl -L ${settings.dockerComposeFileUrl} | ${env} docker-compose -f - up -d`);

			if (stderr) {
				console.log(stderr);
				return;
			}

			console.log(stdout);
		} catch (error) {
			console.error(`Error: ${error}`);
		}
	};

	const executeMigrationAction = async (action: string) => {
		try {
			const {
				stdout,
				stderr
			} = await execute(`curl -L ${settings.dockerComposeDataFileUrl} | ${env} docker-compose -f - run -d --rm ${action}`);

			if (stderr) {
				console.log(stderr);
				return;
			}

			console.log(stdout);
		} catch (error) {
			console.error(`Error: ${error}`);
		}
	};

	try {
		await startDocker();

		if (seed) {
			const migrationActions = ["migrate-before", "migrate-after", "seed-data"];

			for (const migrationAction of migrationActions) {
				await executeMigrationAction(migrationAction);
			}
		}
	} catch (error) {
		console.error(`Error: ${error}`);
	}
};

const windowsStart = async (options: StartArguments) => {
	const { iosCryptoSecret, seed } = options;

	const userConfig = await getUserConfiguration();

	const replacements: DockerVariables = {
		...(userConfig?.variables ?? settings.variables),
		IOS_CRYPTO_SECRET: iosCryptoSecret,
	};

	const escapeRegex = (string: string): string => {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
	};

	const modifyContent = async (content: string): Promise<string> => {
		let modifiedContent = content;
		for (const [key, value] of Object.entries(replacements)) {
			const escapedKey = escapeRegex(`\$\{${key}\}`);
			const regex = new RegExp(escapedKey, "g");
			modifiedContent = modifiedContent.replace(regex, value.toString());
		}
		return modifiedContent;
	};

	const startDocker = () => {
		return new Promise<void>(async (resolve, reject) => {
			try {
				const data = await downloadFile(settings.dockerComposeFileUrl);
				const modifiedData = await modifyContent(data);
				const dockerCompose = spawn("docker-compose", ["-f", "-", "up", "-d"], {
					stdio: ["pipe", "inherit", "inherit"]
				});
				dockerCompose.stdin.write(modifiedData);
				dockerCompose.stdin.end();
				dockerCompose.on("close", () => resolve());
			} catch (error) {
				reject(error);
			}
		});
	};

	const executeMigrationAction = (action: string) => {
		return new Promise<void>(async (resolve, reject) => {
			try {
				const data = await downloadFile(settings.dockerComposeDataFileUrl);
				const modifiedData = await modifyContent(data);

				const tempFilePath = path.join(await getCurrentPath(), settings.tempFileName);
				fs.writeFileSync(tempFilePath, modifiedData);

				const command = `docker-compose -f ${tempFilePath} run -d --rm ${action}`;

				try {
					execSync(command, { stdio: "inherit" });
					fs.unlinkSync(tempFilePath);
					resolve();
				} catch (error) {
					fs.unlinkSync(tempFilePath);
					console.error(`Error: ${error}`);
					reject(error);
				}
			} catch (error) {
				reject(error);
			}
		});
	};

	try {
		await startDocker();

		if (seed) {
			const migrationActions = ["migrate-before", "migrate-after", "seed-data"];

			for (const migrationAction of migrationActions) {
				await executeMigrationAction(migrationAction);
			}
		}
	} catch (error) {
		console.error(`Error: ${error}`);
	}
};