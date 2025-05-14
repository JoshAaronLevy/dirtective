#!/usr/bin/env node
/* eslint-disable indent */
import inquirer from "inquirer";
import inquirerFileTreeSelection from "inquirer-file-tree-selection-prompt";
import { constants } from "../helpers/constants";
import { createSummaryFile, findDivergentDirectories } from "../helpers/utils";
inquirer.registerPrompt("file-tree-selection", inquirerFileTreeSelection);
let rootPath;
let cwdPath;
let duplicateQueue = [];
let currentSelectedNumber = 1;
let totalDuplicateFiles = 0;
export const prompts = async (opts) => {
    // Check if the user has provided a branch flag
    if (opts.branch || opts.b) {
        console.log('Branch flag is set.');
        // Add your logic for handling the branch flag here
    }
    else {
        console.log('No branch flag provided.');
        // Add your logic for handling the absence of the branch flag here
    }
    // Check if the user has provided a version flag
    if (opts.version) {
        console.log('Version flag is set.');
        // Add your logic for handling the version flag here
    }
    else {
        console.log('No version flag provided.');
        // Add your logic for handling the absence of the version flag here
    }
    return;
};
export const selectDirectory = async (targetDirectory) => {
    try {
        const dirName = targetDirectory === "primaryDirectory" ? "Primary Directory" : "Secondary Directory";
        inquirer
            .prompt([
            {
                type: "file-tree-selection",
                onlyShowDir: true,
                enableGoUpperDirectory: true,
                root: rootPath,
                name: dirName
            }
        ])
            .then(async (answer) => {
            if (answer[dirName]) {
                return answer[dirName];
            }
            else {
                return "";
            }
        }).catch(error => {
            console.log(error);
        });
    }
    catch (error) {
        console.log(error);
    }
};
export const chooseAllDupeAction = async () => {
    try {
        inquirer
            .prompt([
            {
                type: "list",
                name: "allDupeAction",
                message: `${duplicateQueue.length} duplicate files found. What would you like to do?\n`,
                choices: [
                    "01/15: Choose for each duplicate individually",
                    "02/15: Copy from primary to secondary directory (overwrites all in secondary, keeps all in primary)",
                    "03/15: Move from primary to secondary directory (overwrites all in secondary)",
                    "04/15: Copy from secondary to primary directory (overwrites all in primary, keeps all in secondary)",
                    "05/15: Move from secondary to primary directory (overwrites all in primary)",
                    "06/15: Delete all duplicates from primary directory",
                    "07/15: Delete all duplicates from secondary directory",
                    "08/15: Delete all duplicates from both directories",
                    "09/15: Delete older file for each duplicate",
                    "10/15: Delete newer file for each duplicate",
                    "11/15: Delete larger file for each duplicate",
                    "12/15: Delete smaller file for each duplicate",
                    "13/15: Create a JSON file with all duplicates",
                    "14/15: Create a .csv file with all duplicates",
                    "15/15: Cancel"
                ],
                default: "1/15: Choose for each duplicate individually"
            }
        ])
            .then(answer => {
            const action = answer["allDupeAction"];
            if (action === "15/15: Cancel") {
                console.log("Cancelled");
                return null;
            }
            else if (answer === "13/15: Create a JSON file with all duplicates") {
                return chooseNewFileLocation("json");
            }
            else if (answer === "14/15: Create a .csv file with all duplicates") {
                return chooseNewFileLocation("csv");
            }
            else if (answer === "1/15: Choose for each duplicate individually") {
                return "processDuplicates";
            }
            switch (action) {
                case "13/15: Create a JSON file with all duplicates":
                    return chooseNewFileLocation("json");
                case "14/15: Create a .csv file with all duplicates":
                    return chooseNewFileLocation("csv");
                case "15/15: Cancel":
                    console.log("Cancelled");
                    return;
                case "1/15: Choose for each duplicate individually":
                    return "processDuplicates";
                default:
                    console.log(answer);
                    return answer;
            }
        }).catch(error => {
            console.log(error);
        });
    }
    catch (error) {
        console.log(error);
    }
};
export const postDupeAction = () => {
    inquirer
        .prompt([
        {
            type: "list",
            name: "postDupeAction",
            message: "Would you like to merge the unique files when done from both directories into one directory?\n",
            choices: [
                "Yes",
                "No"
            ],
            default: "Yes"
        }
    ])
        .then(answer => {
        const action = answer["postDupeAction"];
        if (action === "Yes") {
            return chooseNewDirectoryLocation("merge");
        }
        else {
            console.log("Cancelled");
            return;
        }
    }).catch(error => {
        console.log(error);
    });
};
export const chooseNewFileLocation = (type) => {
    inquirer
        .prompt([
        {
            type: "file-tree-selection",
            name: "newFileLocation",
            onlyShowDir: true,
            enableGoUpperDirectory: true,
            root: cwdPath,
        }
    ])
        .then(answer => {
        return chooseNewFileName(answer["newFileLocation"], type);
    }).catch(error => {
        console.log(error);
    });
};
export const chooseNewDirectoryLocation = (type) => {
    inquirer
        .prompt([
        {
            type: "file-tree-selection",
            name: "newDirectoryLocation",
            onlyShowDir: true,
            enableGoUpperDirectory: true,
            root: cwdPath,
        }
    ])
        .then(answer => {
        return chooseNewFileName(answer["newFileLocation"], type);
    }).catch(error => {
        console.log(error);
    });
};
export const chooseNewFileName = (targetPath, fileType) => {
    const path1 = constants.primaryDirectory.path;
    const path2 = constants.secondaryDirectory.path;
    const divergentDirs = findDivergentDirectories([path1, path2]);
    const defaultName = `duplicate-summary (1)-${divergentDirs[0]} to (2)-${divergentDirs[1]}`;
    inquirer
        .prompt([
        {
            type: "input",
            name: "newFileName",
            message: `What would you like to name the ${fileType} file?`,
            default: defaultName
        }
    ])
        .then(async (answer) => {
        await createSummaryFile(targetPath, answer["newFileName"], fileType, duplicateQueue);
    }).catch(error => {
        console.log(error);
    });
};
export const chooseFileAction = async (duplicates, table, choices) => {
    try {
        await inquirer.prompt([
            {
                type: "list",
                name: "chooseFileAction",
                message: `Duplicate ${currentSelectedNumber} of ${totalDuplicateFiles}. What would you like to do?\n\n` +
                    table.toString() + "\n",
                choices: choices,
                default: "Keep both"
            }
        ]).then(async (answer) => {
            currentSelectedNumber++;
            return answer["chooseFileAction"];
        }).catch(error => {
            console.log(error);
        });
    }
    catch (error) {
        console.log(error);
    }
};
