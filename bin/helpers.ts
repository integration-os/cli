#!/usr/bin/env node

import fs, { Dirent, promises } from "node:fs";
import path from "path";
import settings from "./settings.json";
import ts from "typescript";
import axios from "axios";
import { DataObject } from "./interfaces";
import * as os from "node:os";
import readline from "node:readline";
import winston, { transports } from "winston";
import pc from "picocolors";
import https from "https";

export const checkExistence = async (path: string) => {
	try {
		await promises.access(path);

		return true;
	} catch (error) {
		return false;
	}
};

export const copyFile = async (destinationPath: string, templatePath: string, replace: DataObject[]) => {
	try {
		if (replace) {
			let templateText = await readFile(templatePath) as string;

			for (const replaceItem of replace) {
				templateText = templateText.replace(replaceItem.from, replaceItem.to);
			}

			await createFile(destinationPath, templateText);
		} else {
			await promises.copyFile(templatePath, destinationPath);
		}

		return true;
	} catch (error) {
		return error;
	}
};

export const createFile = async (filePath: string, content: any) => {
	try {
		await promises.appendFile(filePath, content);

		return true;
	} catch (error) {
		return error;
	}
};

export const createFolder = async (folderPath: string, recursive = true) => {
	try {
		await promises.mkdir(folderPath, { recursive });

		return true;
	} catch (error) {
		return error;
	}
};

export const renameFileOrFolder = async (oldPath: string, newPath: string) => {
	try {
		await promises.rename(oldPath, newPath);

		return true;
	} catch (error) {
		return error;
	}
};

export const createFolderStructure = async (directoryPath: string, { folders, files }: any, overWriteFiles = false) => {
	if (folders) {
		for (let folder of folders) {
			const folderPath = path.join(directoryPath, folder.name);
			if (!await checkExistence(folderPath)) {
				await createFolder(folderPath);
			}

			const { folders: subFolders, files: subFiles } = folder;

			if (subFolders || subFiles) {
				await createFolderStructure(folderPath, { folders: subFolders, files: subFiles }, overWriteFiles);
			}
		}
	}

	if (files) {
		for (let file of files) {
			const { name, template, replace } = file;
			const filePath = path.join(directoryPath, name);

			if (!await checkExistence(filePath) || overWriteFiles) {
				await copyFile(filePath, path.join(await getProjectPath(), ...settings.paths.templates.split("/"), ...template.split("/")), replace);
			}
		}
	}
};

export const readDirectory = async (directoryPath: string) => {
	try {
		return await promises.readdir(directoryPath, { withFileTypes: true });
	} catch (error) {
		return error;
	}
};

export const readFile = async (filePath: string) => {
	try {
		return await promises.readFile(filePath, { encoding: "utf8" });
	} catch (error) {
		return error;
	}
};

export const listSubDirectories = async (directoryPath: string) => {
	const content: Dirent[] = await readDirectory(directoryPath) as Dirent[];

	return content.filter((item) => item.isDirectory()).map((item) => ({
		name: item.name,
		path: item.parentPath
	}));
};

export const listDirectoryFiles = async (directoryPath: string) => {
	const content: Dirent[] = await readDirectory(directoryPath) as Dirent[];

	return content.filter((item) => item.isFile()).map((item) => ({
		name: item.name,
		path: item.parentPath
	}));
};

export const getProjectPath = async () => path.join(__dirname, "..");

export const overwriteFile = async (filePath: string, content: any) => {
	try {
		await promises.writeFile(filePath, content);

		return true;
	} catch (error) {
		return error;
	}
};

export const removeFileOrFolder = async (fileOrFolderPath: string) => {
	try {
		await promises.rm(fileOrFolderPath, {
			recursive: true
		});

		return true;
	} catch (error) {
		return error;
	}
};

export const toCamelCase = async (input: string) => {
	let words = input.split(/[^a-zA-Z0-9]+/).filter((word) => word.length);

	for (let i = 1; i < words.length; i++) {
		words[i] = words[i][0].toUpperCase() + words[i].substring(1).toLowerCase();
	}

	const result = words.join("");

	return result[0].toLowerCase() + result.substring(1);
};

export const commonModelNameFormatter = async (input: string) => input.replace(/::/g, "DOUBLECOLON").replace(/[^a-zA-Z0-9]/g, "").replace(/DOUBLECOLON/g, "_");

export const extractProperties = async (data: DataObject, keys: string[]): Promise<DataObject> => {
	if (!data) {
		return {};
	}

	let result: DataObject = {};

	for (const key of keys) {
		let parts = key.split(".");
		let value: any = await cloneObject(data);

		for (let part of parts) {
			if (value && part in value) {
				value = value[part];
			} else {
				value = undefined;
				break;
			}
		}

		if (value !== undefined) {
			result[key] = value;
		}
	}

	return result;
};

export const nestByDotNotation = async (data: DataObject) => {
	const isNumber = (str: string | number | undefined) => !isNaN(Number(str));

	const response: DataObject = Array.isArray(data) ? [] : {};

	for (const [key, value] of Object.entries(data)) {
		const parts = key.split(".");
		let subObject: DataObject = response;

		const firstPart = parts[0];
		if (parts.length === 1 && (!isNumber(firstPart) || firstPart.includes("."))) {
			response[key] = value;
			continue;
		}

		while (parts.length > 1) {
			const part = parts.shift();
			if (part) {
				subObject = subObject[part] || (subObject[part] = isNumber(part) ? [] : {});
			}
		}

		subObject[parts[0]] = value;
	}

	return response;
};

export const apiHeaders = async () => ({
	"Content-Type": "application/json",
	"x-pica-secret": (await getStoredCredentials()).secret,
	"Authorization": `Bearer ${(await getStoredCredentials()).bearerToken}`
});

export const compileTypeScriptToJavaScript = async (tsCode: string) => {
	const options = {
		target: ts.ScriptTarget.ES2015,
		module: ts.ModuleKind.CommonJS,
	};

	const result = ts.transpileModule(tsCode, { compilerOptions: options });

	return result.outputText;
};

export const getAllRows = async (url: string, params = {}) => {
	const allRows = [];
	let allRowsPaginated = false;
	let skip = 0;

	do {
		const response = await axios.get(url, {
			headers: await apiHeaders(),
			validateStatus: () => true,
			params: {
				limit: 100,
				skip,
				...params
			}
		});

		await logApiError(response.data?.error);

		if (Array.isArray(response.data?.rows)) {
			allRows.push(...response.data.rows);
			skip += 100;

			allRowsPaginated = response.data.total === allRows.length;
		} else {
			allRowsPaginated = true;
		}
	} while (!allRowsPaginated);

	return allRows;
};

export const isNotNullOrUndefined = (data: any) => (data !== null && data !== undefined);

export const cloneObject = (data: DataObject) => JSON.parse(JSON.stringify(data));

export const replaceStructureValues = async (structure: DataObject, replaceValues: DataObject) => {
	if (structure.files) {
		structure.files.forEach((file: DataObject) => {
			if (isNotNullOrUndefined(file.replace)) {
				for (let i = 0; i < file.replace.length; i++) {
					if (isNotNullOrUndefined(replaceValues[file.replace[i].to])) {
						file.replace[i].to = replaceValues[file.replace[i].to];
					}
				}
			}
		});
	}

	if (structure.folders) {
		await Promise.all(structure.folders.map((folder: DataObject) =>
			replaceStructureValues(folder, replaceValues)
		));
	}

	return structure;
};

export const logApiError = async (error?: string) => {
	if (error) {
		console.error(`API Error: ${error}.`);
	}
};

export const getCurrentPath = async () => process.cwd();

export const isSuccessful = async (statusCode: number) => /^2\d{2}$/.test(statusCode as unknown as string);

export const getStoredCredentials = async () => {
	const env = settings.env;
	const userConfig = await getUserConfiguration();

	const url = process.env.API_URL ?? userConfig?.env?.API_URL ?? env?.API_URL;
	const secret = process.env.X_PICA_SECRET ?? userConfig?.env?.X_PICA_SECRET ?? env?.X_PICA_SECRET;
	const bearerToken = process.env.BEARER_TOKEN ?? userConfig?.env?.BEARER_TOKEN ?? env?.BEARER_TOKEN;

	return {
		url,
		secret,
		bearerToken
	};
};

export const joinKeyValuePairs = async (object: DataObject) => {
	const platform: string = os.platform();

	if (platform === "win32") {
		let result = "";

		for (const key in object) {
			if (object.hasOwnProperty(key)) {
				if (result !== "") {
					result += " && ";
				}

				result += `set ${key}=${object[key]}`;
			}
		}

		return result;
	} else if (["linux", "darwin"].includes(platform)) {
		let result = "";

		for (const key in object) {
			if (object.hasOwnProperty(key)) {
				if (result !== "") {
					result += " ";
				}

				result += `${key}=${object[key]}`;
			}
		}

		return result;
	}

	throw new Error("Platform not supported! Please contact the developer!");
};

export const getDockerStopCommand = async () => `curl -L ${settings.dockerComposeFileUrl} | docker-compose -f - down`;

export const platformIsSupported = async () => settings.supportedPlatforms.includes(os.platform());

export const toPascalCase = async (input: string): Promise<string> => input.replace(/[^a-zA-Z0-9]+/g, " ").split(" ").filter(word => !!word.length).map(word => word.slice(0, 1).toUpperCase() + word.slice(1)).join("");

export const getCaseCorrectedPath = async (input: string): Promise<string> => {
	let p = path.resolve(input).split(path.sep);
	return p.reduce((r, a) => {
		if (a === ".") return r;
		const dirs = fs.readdirSync(r);
		const n = dirs.find(d => d.toLowerCase() === a.toLowerCase());
		return n ? path.join(r, n) : r;
	}, "/");
};

export const moveKeyToRoot = async (data: any, keyPath: string, spread: boolean, destinationKey?: string) => {
	const keys = keyPath.split(".");

	let response = { ...data };

	let target = response;
	keys.forEach((key, i) => {
		if (i === keys.length - 1) {
			return;
		}

		target = target[key];
	});

	const movedData = target[keys[keys.length - 1]];

	delete target[keys[keys.length - 1]];

	if (spread) {
		response = { ...response, ...movedData };
	} else if (destinationKey) {
		response[destinationKey] = movedData;
	} else {
		response[keys[keys.length - 1]] = movedData;
	}

	return response;
};

export const getUserConfiguration = async () => {
	let userConfig: DataObject = {};

	const userConfigurationPath = path.join(await getCurrentPath(), settings.paths.userConfig);
	if (await checkExistence(userConfigurationPath)) {
		try {
			userConfig = JSON.parse(await readFile(userConfigurationPath) as string);
		} catch (error) {
			console.error("Config file is invalid!");
			process.exit(1);
		}
	}

	return userConfig;
};

export const sortByNameKey = async (data: DataObject[], descending = false) => data.sort((a, b) => {
	if (a.name < b.name) {
		return descending ? 1 : -1;
	}

	if (a.name > b.name) {
		return descending ? -1 : 1;
	}

	return 0;
});

export const camelToKebab = async (input: string) => input.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

export const getLastNCharacters = async (input: string, characters: number) => input.slice(-characters);

export const getActionName = async (name: string, id: string) => `${await camelToKebab(name)}-${await getLastNCharacters(id, 6)}`;

export const verifyServerConnection = async () => {
	try {
		await axios.get((await getStoredCredentials())?.url);

		return true;
	} catch (error) {
		if (axios.isAxiosError(error)) {
			if (error.code === "ECONNREFUSED") {
				console.error("Connection refused. Please check if the server is running!");
			} else {
				console.error(`Axios Error: ${error.message}`);
			}
		} else {
			console.error(`Error: ${error}`);
		}

		process.exit(1);
	}
};

export const readLineInterface = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

export const logger = winston.createLogger({
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.printf(
			({
				level,
				message,
				timestamp,
			}) => `${timestamp} ${level}: ${message}`
		)),
	transports: [new transports.File({
		filename: "logs.log",
		level: "info"
	})],
});

export const splitNames = async (input: string) => {
	const regex = /["']([^"']+)["']|\S+/g;

	let match;
	const result = [];

	while ((match = regex.exec(input)) !== null) {
		if (match[1]) {
			result.push(match[1]);
		} else {
			result.push(match[0]);
		}
	}

	return result;
};

export const yellowDash = pc.yellow("-");
export const redCross = pc.red("❌");

export const downloadFile = (url: string): Promise<string> => {
	return new Promise<string>((resolve, reject) => {
		https.get(url, (response) => {
			let data = "";
			response.on("data", (chunk) => {
				data += chunk;
			});
			response.on("end", () => {
				resolve(data);
			});
		}).on("error", (err) => {
			reject(err.message);
		});
	});
};