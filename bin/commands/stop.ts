#!/usr/bin/env node

import os from "node:os";
import settings from "../settings.json";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { downloadFile } from "../helpers";

export const stop = async () => {
	try {
		const platform = os.platform();

		if (platform === "win32") {
			await windowsStop();
		} else if (["linux", "darwin"].includes(platform)) {
			await unixStop();
		} else {
			console.error("Platform not supported! Please contact the developer!");
			process.exit(1);
		}
	} catch (error) {
		console.error(`Error: ${error}`);
	}
};

const windowsStop = async () => {
	const stopDocker = () => {
		return new Promise<void>(async (resolve, reject) => {
			try {
				const data = await downloadFile(settings.dockerComposeFileUrl);

				const dockerCompose = spawn("docker-compose", ["-f", "-", "down"], {
					stdio: ["pipe", "inherit", "inherit"]
				});
				dockerCompose.stdin.write(data);
				dockerCompose.stdin.end();
				dockerCompose.on("close", () => resolve());
			} catch (error) {
				reject(error);
			}
		});
	};

	try {
		await stopDocker();
	} catch (error) {
		console.error(`Error: ${error}`);
	}
};

const unixStop = async () => {
	const execute = promisify(exec);

	const stopDocker = async () => {
		try {
			const {
				stdout,
				stderr
			} = await execute(`curl -L ${settings.dockerComposeFileUrl} | docker-compose -f - down`);

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
		await stopDocker();
	} catch (error) {
		console.error(`Error: ${error}`);
	}
};