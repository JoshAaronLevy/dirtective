#!/usr/bin/env node

import inquirer from "inquirer";
import inquirerFileTreeSelection from "inquirer-file-tree-selection-prompt";
import { constants } from "../helpers/constants";
import { createSummaryFile, findDivergentDirectories } from "../helpers/utils";
import type { FileInfo } from "../helpers/models";
import type { Table } from "cli-table3";

inquirer.registerPrompt("file-tree-selection", inquirerFileTreeSelection);

let rootPath: string = '';
let cwdPath: string = '';
let duplicateQueue: FileInfo[] = [];
let currentSelectedNumber = 1;
let totalDuplicateFiles = 0;

export const selectDirectory = async (targetDirectory: string): Promise<string> => {
  try {
    const dirName = targetDirectory === "primaryDirectory" ? "Primary Directory" : "Secondary Directory";
    const answer = await inquirer.prompt([
      {
        type: "file-tree-selection",
        onlyShowDir: true,
        enableGoUpperDirectory: true,
        root: rootPath,
        name: dirName
      }
    ]);

    return answer[dirName] || "";
  } catch (error) {
    console.error("Error selecting directory:", error instanceof Error ? error.message : error);
    return "";
  }
};

export const chooseAllDupeAction = async (): Promise<string> => {
  try {
    const answer = await inquirer.prompt([
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
    ]);

    const action = answer["allDupeAction"];

    if (action === "15/15: Cancel") {
      console.log("Cancelled");
      return "";
    } else if (action === "13/15: Create a JSON file with all duplicates") {
      return await chooseNewFileLocation("json");
    } else if (action === "14/15: Create a .csv file with all duplicates") {
      return await chooseNewFileLocation("csv");
    } else if (action === "01/15: Choose for each duplicate individually") {
      return "processDuplicates";
    }

    return action;
  } catch (error) {
    console.error("Error choosing action:", error instanceof Error ? error.message : error);
    return "";
  }
};

export const postDupeAction = async (): Promise<string> => {
  try {
    const answer = await inquirer.prompt([
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
    ]);

    const action = answer["postDupeAction"];
    if (action === "Yes") {
      return await chooseNewDirectoryLocation("merge");
    }
    return "";
  } catch (error) {
    console.error("Error in post dupe action:", error instanceof Error ? error.message : error);
    return "";
  }
};

export const chooseNewFileLocation = async (type: string): Promise<string> => {
  try {
    const answer = await inquirer.prompt([
      {
        type: "file-tree-selection",
        name: "newFileLocation",
        onlyShowDir: true,
        enableGoUpperDirectory: true,
        root: cwdPath,
      }
    ]);

    return await chooseNewFileName(answer["newFileLocation"], type);
  } catch (error) {
    console.error("Error choosing file location:", error instanceof Error ? error.message : error);
    return "";
  }
};

export const chooseNewDirectoryLocation = async (type: string): Promise<string> => {
  try {
    const answer = await inquirer.prompt([
      {
        type: "file-tree-selection",
        name: "newDirectoryLocation",
        onlyShowDir: true,
        enableGoUpperDirectory: true,
        root: cwdPath,
      }
    ]);

    return await chooseNewFileName(answer["newDirectoryLocation"], type);
  } catch (error) {
    console.error("Error choosing directory location:", error instanceof Error ? error.message : error);
    return "";
  }
};

export const chooseNewFileName = async (targetPath: string, fileType: string): Promise<string> => {
  try {
    const path1 = constants.primaryDirectory.path;
    const path2 = constants.secondaryDirectory.path;
    const divergentDirs = findDivergentDirectories([path1, path2]);
    const defaultName = `duplicate-summary (1)-${divergentDirs[0]} to (2)-${divergentDirs[1]}`;

    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "newFileName",
        message: `What would you like to name the ${fileType} file?`,
        default: defaultName
      }
    ]);

    await createSummaryFile(targetPath, answer["newFileName"], fileType, duplicateQueue);
    return answer["newFileName"];
  } catch (error) {
    console.error("Error choosing file name:", error instanceof Error ? error.message : error);
    return "";
  }
};

interface FileActionResult {
  decision: string;
}

export const chooseFileAction = async (
  duplicates: FileInfo[],
  table: Table,
  choices: string[]
): Promise<FileActionResult> => {
  try {
    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "chooseFileAction",
        message: `Duplicate ${currentSelectedNumber} of ${totalDuplicateFiles}. What would you like to do?\n\n` +
          table.toString() + "\n",
        choices: choices,
        default: "Keep both"
      }
    ]);

    currentSelectedNumber++;
    return { decision: answer["chooseFileAction"] };
  } catch (error) {
    console.error("Error choosing file action:", error instanceof Error ? error.message : error);
    return { decision: "Keep both" };
  }
};
