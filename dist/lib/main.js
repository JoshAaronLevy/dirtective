#!/usr/bin/env node
/* eslint-disable indent */
import path from "path";
import { promises as fs } from "fs";
const directory = process.cwd();
import shell from "shelljs";
import { createSpinner } from "nanospinner";
import { red, white, yellow, green, bold } from "colorette";
import Table from "cli-table3";
// import moment from "moment";
import inquirer from "inquirer";
import inquirerFileTreeSelection from "inquirer-file-tree-selection-prompt";
import { constants } from "../helpers/constants";
import { bytesToSize, convertDuplicates, findDuplicates } from "../helpers/utils";
import { chooseAllDupeAction, chooseFileAction, postDupeAction, selectDirectory } from "./prompts";
inquirer.registerPrompt("file-tree-selection", inquirerFileTreeSelection);
let rootPath;
let cwdPath;
let uniqueQueue = [];
let duplicateQueue = []; // Initialize or populate elsewhere
const summary = {
    total: duplicateQueue.length,
    success: 0,
    failed: 0,
    actions: [],
};
export default async (command) => {
    if (command && command.args.length > 0) {
        console.log("command args:\n", command.args);
    }
    try {
        rootPath = await getRootPath();
        cwdPath = await getCwdPath();
        if (rootPath) {
            const selectedDir = await selectDirectory("primaryDirectory");
            if (selectedDir) {
                await setDirectory("primaryDirectory", selectedDir);
            }
        }
    }
    catch (error) {
        console.log(error);
    }
};
const getRootPath = async () => {
    try {
        const arrPath = directory.split(path.sep);
        if (arrPath.length >= 2) {
            return arrPath.slice(0, arrPath.length - 1).join(path.sep);
        }
        else {
            return directory;
        }
    }
    catch (error) {
        console.log(error);
        return "";
    }
};
const getCwdPath = async () => {
    try {
        const arrPath = directory.split(path.sep);
        if (arrPath.length > 2) {
            return arrPath.slice(0, arrPath.length - 2).join(path.sep);
        }
        else if (arrPath.length === 2) {
            return arrPath.slice(0, arrPath.length - 1).join(path.sep);
        }
        else {
            return directory;
        }
    }
    catch (error) {
        console.log(error);
        return "";
    }
};
const setDirectory = async (targetDirectory, answer) => {
    try {
        const targetDir = constants[targetDirectory];
        targetDir.path = answer;
        targetDir.name = path.basename(answer);
        targetDir.files = await getFileList(targetDir);
        targetDir.fileCount = targetDir.files.length;
        const friendlySize = bytesToSize(targetDir.size.bytes);
        targetDir.size.calculated = `${friendlySize.size} ${friendlySize.unit}`;
        if (targetDirectory === 'primaryDirectory') {
            return selectDirectory('secondaryDirectory');
        }
        else if (targetDirectory === 'secondaryDirectory') {
            if (constants.primaryDirectory.path === constants.secondaryDirectory.path) {
                console.log(red(`You cannot compare the same directory. Please select a different directory than ${answer}.\n`));
                return selectDirectory('secondaryDirectory');
            }
            return findDupes();
        }
        else {
            return constants[targetDirectory];
        }
    }
    catch (error) {
        console.error('Error setting directory:', error instanceof Error ? error.message : error);
        throw error;
    }
};
const getFileList = async (selectedDir) => {
    const spinner = createSpinner("Reticulating splines...").start();
    try {
        const asyncFileList = await fs.readdir(selectedDir.path);
        const fileList = asyncFileList?.filter(file => !file.includes("$") && !file.includes(".ini") && file[0] !== ".");
        if ((!asyncFileList || asyncFileList.length === 0) || (!fileList || fileList.length === 0)) {
            return spinner.warn({
                text: yellow(bold("ALERT! ")) +
                    white(`No files found in ${selectedDir.path}. Please select a different directory.\n`)
            });
        }
        else {
            const fileDataPromises = fileList.map(async (file) => {
                const filePath = `${selectedDir.path}${path.sep}${file}`;
                const fileStats = await fs.stat(filePath);
                const fileSize = fileStats.size;
                const rawCreatedDate = fileStats.birthtime;
                selectedDir.size.bytes += fileSize;
                return {
                    full: filePath,
                    name: path.parse(file).name,
                    base: path.basename(file),
                    path: selectedDir.path,
                    extension: path.extname(file) || null,
                    date: {
                        raw: rawCreatedDate
                    },
                    size: {
                        bytes: fileSize
                    }
                };
            });
            const fileData = await Promise.all(fileDataPromises);
            selectedDir.files = fileData;
            spinner.success({
                text: white(`Found ${selectedDir.files.length} files.\n`)
            });
            return fileData;
        }
    }
    catch (error) {
        console.log(error);
    }
};
const identifyUniqueFiles = async () => {
    const primaryDirFiles = constants.primaryDirectory.files;
    const secondaryDirFiles = constants.secondaryDirectory.files;
    let uniqueFiles = [];
    function fileExists(array, name) {
        return array.some((file) => file.name === name);
    }
    primaryDirFiles.forEach((file) => {
        if (!fileExists(secondaryDirFiles, file.name)) {
            if (file.base.includes(".")) {
                uniqueFiles.push(file);
            }
        }
    });
    secondaryDirFiles.forEach((file) => {
        if (!fileExists(primaryDirFiles, file.name)) {
            if (file.base.includes(".")) {
                uniqueFiles.push(file);
            }
        }
    });
    uniqueQueue = uniqueFiles;
    return uniqueQueue;
};
const findDupes = async () => {
    const spinner = createSpinner("Looking for duplicates...\n").start();
    const primaryPath = constants.primaryDirectory.path;
    const secondaryPath = constants.secondaryDirectory.path;
    await findDuplicates(primaryPath, secondaryPath)
        .then(async (duplicates) => {
        duplicateQueue = duplicates;
        if (duplicates.length === 0) {
            spinner.success({ text: green("\nNo duplicates found.\n") });
        }
        else {
            spinner.success({ text: `${duplicateQueue.length} duplicates found.\n` });
        }
        await identifyUniqueFiles();
        const chosenDupeAction = await chooseAllDupeAction();
        if (chosenDupeAction === "processDuplicates") {
            await processDuplicates();
        }
    })
        .catch(error => {
        spinner.error({ text: "An error occurred during the search" });
        console.error(error);
    });
};
const constructTable = async (duplicateFiles) => {
    const file1 = duplicateFiles[0];
    const file2 = duplicateFiles[1];
    const table = new Table({
        head: ["", `(1) ${file1.path}`, `(2) ${file2.path}`],
        chars: {
            "top": "═", "top-mid": "╤", "top-left": "╔", "top-right": "╗",
            "bottom": "═", "bottom-mid": "╧", "bottom-left": "╚", "bottom-right": "╝",
            "left": "║", "left-mid": "╟", "mid": "─", "mid-mid": "┼",
            "right": "║", "right-mid": "╢", "middle": "│"
        },
        wordWrap: true
    });
    table.push({ "Name": [file1.name, file2.name] }, { "Created": [file1.date.formatted, file2.date.formatted] }, { "Size": [file1.size.calculated, file2.size.calculated] }, { "Type": [file1.type, file2.type] });
    return table;
};
const setChoices = async (fileMatches) => {
    const firstMatch = fileMatches[0];
    const secondMatch = fileMatches[1];
    let choices = [
        "Keep both",
        "Delete both",
        "Delete from (1)",
        "Delete from (2)"
    ];
    if (firstMatch.size !== secondMatch.size) {
        if (firstMatch.size > secondMatch.size) {
            choices.push("Delete larger file (1)");
            choices.push("Delete smaller file (2)");
        }
        else {
            choices.push("Delete larger file (2)");
            choices.push("Delete smaller file (1)");
        }
    }
    if (firstMatch.date.raw !== secondMatch.date.raw) {
        if (firstMatch.date.raw > secondMatch.date.raw) {
            choices.push("Delete newer file (1)");
            choices.push("Delete older file (2)");
        }
        else {
            choices.push("Delete newer file (2)");
            choices.push("Delete older file (1)");
        }
    }
    return choices;
};
const performAction = async (answer, file1, file2) => {
    try {
        let actionResult = {
            file1: file1.full,
            file2: file2.full,
            decision: answer,
            success: false
        };
        if (answer === "Keep both") {
            return actionResult;
        }
        else if (answer === "Delete both") {
            await fs.unlink(file1.full);
            await fs.unlink(file2.full);
            actionResult.success = true;
            return actionResult;
        }
        else if (answer === "Delete from (1)") {
            if (shell.rm("-rf", `${file1.full}`).code !== 0) {
                actionResult.success = false;
                shell.echo("Error: failed to delete file");
                shell.exit(1);
            }
            else {
                actionResult.success = true;
            }
            return actionResult;
        }
        else if (answer === "Delete from (2)") {
            await fs.unlink(file2.full);
            actionResult.success = true;
            return actionResult;
        }
        else if (answer === "Delete larger file (1)") {
            await fs.unlink(file1.full);
            actionResult.success = true;
            return actionResult;
        }
        else if (answer === "Delete larger file (2)") {
            await fs.unlink(file2.full);
            actionResult.success = true;
            return actionResult;
        }
        else if (answer === "Delete smaller file (1)") {
            await fs.unlink(file1.full);
            actionResult.success = true;
            return actionResult;
        }
        else if (answer === "Delete smaller file (2)") {
            await fs.unlink(file2.full);
            actionResult.success = true;
            return actionResult;
        }
        else if (answer === "Delete newer file (1)") {
            await fs.unlink(file1.full);
            actionResult.success = true;
            return actionResult;
        }
        else if (answer === "Delete newer file (2)") {
            await fs.unlink(file2.full);
            actionResult.success = true;
            return actionResult;
        }
        else if (answer === "Delete older file (1)") {
            await fs.unlink(file1.full);
            actionResult.success = true;
            return actionResult;
        }
        else if (answer === "Delete older file (2)") {
            await fs.unlink(file2.full);
            actionResult.success = true;
            return actionResult;
        }
        else {
            actionResult.success = true;
            return actionResult;
        }
    }
    catch (error) {
        console.error(`Error performing action: ${error.message}`);
        return { success: false, action: answer, error: error.message };
    }
};
const processDuplicates = async () => {
    try {
        for (const duplicatePair of duplicateQueue) {
            const convertedDuplicates = await convertDuplicates(duplicatePair.fileMatches);
            const table = await constructTable(convertedDuplicates);
            const choices = await setChoices(duplicatePair.fileMatches);
            const dupeResult = await chooseFileAction(convertedDuplicates, table, choices);
            await performAction(dupeResult.decision, convertedDuplicates[0], convertedDuplicates[1]);
            console.log('dupeResult: ', JSON.stringify(dupeResult, null, 2));
            const postFileAction = await postDupeAction();
            console.log('postFileAction: ', JSON.stringify(postFileAction, null, 2));
            summary.actions.push(dupeResult);
            if (dupeResult.success) {
                summary.success++;
            }
            else {
                summary.failed++;
            }
        }
        console.log('Summary:\n', summary);
    }
    catch (error) {
        console.error('Error processing duplicates:', error instanceof Error ? error.message : error);
    }
};
