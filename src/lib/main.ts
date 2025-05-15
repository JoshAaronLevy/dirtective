#!/usr/bin/env node
/* eslint-disable */
import * as path from "path";
import { promises as fs } from "fs";
const directory = process.cwd();
import shell from "shelljs";
import { createSpinner } from "nanospinner";
import { red, white, yellow, green, bold } from "colorette";
import Table from "cli-table3";
import inquirer from "inquirer";
import inquirerFileTreeSelection from "inquirer-file-tree-selection-prompt";
import { constants } from "../helpers/constants";
import { bytesToSize, convertDuplicates, findDuplicates } from "../helpers/utils";
import { chooseAllDupeAction, chooseFileAction, postDupeAction, selectDirectory } from "./prompts";
import type { FileInfo, ActionResult, State, DirectoryWithNullables, ConstantsType } from "../helpers/models";

inquirer.registerPrompt("file-tree-selection", inquirerFileTreeSelection);

const state: State = {
  rootPath: "",
  uniqueQueue: [],
  duplicateQueue: [],
  summary: {
    total: 0,
    success: 0,
    failed: 0,
    actions: [],
  }
};

// Path utilities
const getPathSegments = (dir: string): string[] => dir.split(path.sep);

const getRootPath = async (): Promise<string> => {
  try {
    const segments = getPathSegments(directory);
    return segments.length >= 2 
      ? segments.slice(0, segments.length - 1).join(path.sep)
      : directory;
  } catch (error) {
    console.error("Error getting root path:", error instanceof Error ? error.message : error);
    return "";
  }
};

const getCwdPath = async (): Promise<string> => {
  try {
    const segments = getPathSegments(directory);
    if (segments.length > 2) {
      return segments.slice(0, segments.length - 2).join(path.sep);
    }
    return segments.length === 2 
      ? segments.slice(0, segments.length - 1).join(path.sep)
      : directory;
  } catch (error) {
    console.error("Error getting CWD path:", error instanceof Error ? error.message : error);
    return "";
  }
};

// File processing utilities
const isValidFile = (file: string): boolean => 
  !file.includes("$") && !file.includes(".ini") && file[0] !== ".";

const processFileStats = async (
  file: string, 
  selectedDir: { path: string; size: { bytes: number } }
): Promise<FileInfo> => {
  const filePath = path.join(selectedDir.path, file);
  const fileStats = await fs.stat(filePath);
  
  selectedDir.size.bytes += fileStats.size;

  return {
    full: filePath,
    name: path.parse(file).name,
    base: path.basename(file),
    path: selectedDir.path,
    extension: path.extname(file) || null,
    date: {
      raw: fileStats.birthtime
    },
    size: {
      bytes: fileStats.size
    }
  };
};

const getFileList = async (selectedDir: DirectoryWithNullables): Promise<FileInfo[] | undefined> => {
  const spinner = createSpinner("Reticulating splines...").start();
  
  try {
    if (!selectedDir.path) {
      throw new Error("Directory path is not defined");
    }

    const files = await fs.readdir(selectedDir.path);
    const validFiles = files.filter(isValidFile);

    if (!validFiles.length) {
      spinner.warn({
        text: yellow(bold("ALERT! ")) + 
          white(`No files found in ${selectedDir.path}. Please select a different directory.\n`)
      });
      return [];
    }

    const fileData = await Promise.all(
      validFiles.map(file => processFileStats(file, { path: selectedDir.path!, size: selectedDir.size }))
    );

    spinner.success({ text: white(`Found ${fileData.length} files.\n`) });
    return fileData;
  } catch (error) {
    console.error("Error getting file list:", error instanceof Error ? error.message : error);
    spinner.error({ text: "Failed to get file list" });
    return undefined;
  }
};

// Directory management
const setDirectory = async (
  targetDirectory: "primaryDirectory" | "secondaryDirectory",
  answer: string
): Promise<unknown> => {
  try {
    const targetDir = (constants as ConstantsType)[targetDirectory];
    targetDir.path = answer;
    targetDir.name = path.basename(answer);
    
    const files = await getFileList(targetDir);
    if (files) {
      targetDir.files = files;
      targetDir.fileCount = files.length;
    }

    const friendlySize = bytesToSize(targetDir.size.bytes);
    if (typeof friendlySize !== 'string') {
      targetDir.size.calculated = `${friendlySize.size} ${friendlySize.unit}`;
    }

    if (targetDirectory === "primaryDirectory") {
      return selectDirectory("secondaryDirectory");
    }

    if (targetDirectory === "secondaryDirectory") {
      const primaryDir = (constants as ConstantsType).primaryDirectory;
      if (primaryDir.path === targetDir.path) {
        console.log(red(`You cannot compare the same directory. Please select a different directory than ${answer}.\n`));
        return selectDirectory("secondaryDirectory");
      }
      return findDupes();
    }

    return targetDir;
  } catch (error) {
    console.error("Error setting directory:", error instanceof Error ? error.message : error);
    throw error;
  }
};

// File comparison utilities
const fileExists = (array: FileInfo[], name: string): boolean =>
  array.some(file => file.name === name);

const identifyUniqueFiles = async (): Promise<FileInfo[]> => {
  const typedConstants = constants as ConstantsType;
  const primaryFiles = typedConstants.primaryDirectory.files;
  const secondaryFiles = typedConstants.secondaryDirectory.files;
  
  const uniqueFiles = [
    ...primaryFiles.filter(file => !fileExists(secondaryFiles, file.name) && file.base.includes(".")),
    ...secondaryFiles.filter(file => !fileExists(primaryFiles, file.name) && file.base.includes("."))
  ];

  state.uniqueQueue = uniqueFiles;
  return uniqueFiles;
};

// Table construction
const constructTable = async (duplicateFiles: FileInfo[]): Promise<Table.Table> => {
  const [file1, file2] = duplicateFiles;
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

  table.push(
    { "Name": [file1.name, file2.name] },
    { "Created": [file1.date.formatted, file2.date.formatted] },
    { "Size": [file1.size.calculated, file2.size.calculated] },
    { "Type": [file1.type, file2.type] }
  );

  return table;
};

// Choice management
const setChoices = async (fileMatches: FileInfo[]): Promise<string[]> => {
  const [firstMatch, secondMatch] = fileMatches;
  const choices = [
    "Keep both",
    "Delete both",
    "Delete from (1)",
    "Delete from (2)"
  ];

  if (firstMatch.size.bytes !== secondMatch.size.bytes) {
    const [larger, smaller] = firstMatch.size.bytes > secondMatch.size.bytes 
      ? ["(1)", "(2)"] 
      : ["(2)", "(1)"];
    choices.push(`Delete larger file ${larger}`, `Delete smaller file ${smaller}`);
  }

  if (firstMatch.date.raw !== secondMatch.date.raw) {
    const [newer, older] = firstMatch.date.raw > secondMatch.date.raw 
      ? ["(1)", "(2)"] 
      : ["(2)", "(1)"];
    choices.push(`Delete newer file ${newer}`, `Delete older file ${older}`);
  }

  return choices;
};

// File operations
const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error instanceof Error ? error.message : error);
    return false;
  }
};

const performAction = async (
  answer: string, 
  file1: FileInfo, 
  file2: FileInfo
): Promise<ActionResult> => {
  const actionResult: ActionResult = {
    file1: file1.full,
    file2: file2.full,
    decision: answer,
    success: false
  };

  try {
    switch (answer) {
      case "Keep both":
        return actionResult;
      
      case "Delete both":
        actionResult.success = await deleteFile(file1.full) && await deleteFile(file2.full);
        break;
      
      case "Delete from (1)":
        if (shell.rm("-rf", file1.full).code !== 0) {
          shell.echo("Error: failed to delete file");
          shell.exit(1);
        }
        actionResult.success = true;
        break;
      
      default:
        if (answer.includes("Delete")) {
          const targetFile = answer.includes("(1)") ? file1 : file2;
          actionResult.success = await deleteFile(targetFile.full);
        }
    }

    return actionResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { ...actionResult, success: false, error: errorMessage };
  }
};

// Main processing functions
const findDupes = async (): Promise<void> => {
  const spinner = createSpinner("Looking for duplicates...\n").start();
  
  try {
    const typedConstants = constants as ConstantsType;
    const primaryPath = typedConstants.primaryDirectory.path;
    const secondaryPath = typedConstants.secondaryDirectory.path;
    
    if (!primaryPath || !secondaryPath) {
      throw new Error("Directory paths not properly set");
    }

    const duplicates = await findDuplicates(primaryPath, secondaryPath);
    state.duplicateQueue = duplicates;
    
    spinner.success({ 
      text: duplicates.length === 0 
        ? green("\nNo duplicates found.\n")
        : `${duplicates.length} duplicates found.\n`
    });

    await identifyUniqueFiles();
    const chosenDupeAction = await chooseAllDupeAction();
    
    if (chosenDupeAction === "processDuplicates") {
      await processDuplicates();
    }
  } catch (error) {
    spinner.error({ text: "An error occurred during the search" });
    console.error("Error finding duplicates:", error instanceof Error ? error.message : error);
  }
};

const processDuplicates = async (): Promise<void> => {
  try {
    for (const duplicatePair of state.duplicateQueue) {
      const convertedDuplicates = await convertDuplicates(duplicatePair.fileMatches);
      const table = await constructTable(convertedDuplicates);
      const choices = await setChoices(duplicatePair.fileMatches);
      
      const dupeResult = await chooseFileAction(convertedDuplicates, table, choices);
      const actionResult = await performAction(dupeResult.decision, convertedDuplicates[0], convertedDuplicates[1]);
      
      console.log("dupeResult:", JSON.stringify(actionResult, null, 2));
      
      const postFileAction = await postDupeAction();
      console.log("postFileAction:", JSON.stringify(postFileAction, null, 2));

      state.summary.actions.push(actionResult);
      actionResult.success ? state.summary.success++ : state.summary.failed++;
    }

    console.log("Summary:\n", state.summary);
  } catch (error) {
    console.error("Error processing duplicates:", error instanceof Error ? error.message : error);
  }
};

// Main entry point
export const main = async (command: any): Promise<void> => {
  if (command?.args.length > 0) {
    console.log("command args:\n", command.args);
  }

  try {
    state.rootPath = await getRootPath();
    await getCwdPath();
    
    if (state.rootPath) {
      const selectedDir = await selectDirectory("primaryDirectory");
      if (selectedDir) {
        await setDirectory("primaryDirectory", selectedDir);
      }
    }
  } catch (error) {
    console.error("Error in main:", error instanceof Error ? error.message : error);
  }
};