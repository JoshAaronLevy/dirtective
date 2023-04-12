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
import { dirtectiveArgs } from "./models/args.mjs";
import { bytesToSize, createPackageJsonFile, writeToCSV, convertDuplicates } from "./helpers/utils.mjs";

inquirer.registerPrompt("file-tree-selection", inquirerFileTreeSelection);

let rootPath;
let cwdPath;
let duplicateQueue = [];
let currentSelectedNumber = 1;
let totalDuplicates = 0;
let summary = {
  total: duplicateQueue.length,
  success: 0,
  failed: 0,
  actions: []
};

export default async (command) => {
  if (command && command.args.length > 0) {
    console.log("command args:\n", command.args);
  }
  try {
    rootPath = await getRootPath();
    cwdPath = await getCwdPath();
    if (rootPath) {
      return selectDirectory("primaryDirectory");
    }
  } catch (error) {
    console.log(error);
  }
};

const getRootPath = async () => {
  try {
    const arrPath = directory.split(path.sep);
    if (arrPath.length >= 2) {
      return arrPath.slice(0, arrPath.length - 1).join(path.sep);
    } else {
      return directory;
    }
  } catch (error) {
    console.log(error);
    return "";
  }
};

const getCwdPath = async () => {
  try {
    const arrPath = directory.split(path.sep);
    if (arrPath.length > 2) {
      return arrPath.slice(0, arrPath.length - 2).join(path.sep);
    } else if (arrPath.length === 2) {
      return arrPath.slice(0, arrPath.length - 1).join(path.sep);
    } else {
      return directory;
    }
  } catch (error) {
    console.log(error);
    return "";
  }
};

const selectDirectory = (targetDirectory) => {
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
    .then(async answer => {
      if (answer[dirName]) {
        return setDirectory(targetDirectory, answer[dirName]);
      } else {
        return;
      }
    }).catch(error => {
      console.log(error);
    });
};

const setDirectory = async (targetDirectory, answer) => {
  try {
    const targetDir = dirtectiveArgs[targetDirectory];
    targetDir.path = answer;
    targetDir.name = path.basename(answer);
    targetDir.files = await getFileList(targetDir);
    targetDir.fileCount = targetDir.files.length;

    const friendlySize = bytesToSize(targetDir.size.bytes);
    targetDir.size.calculated = `${friendlySize.size} ${friendlySize.unit}`;

    if (targetDirectory === "primaryDirectory") {
      return selectDirectory("secondaryDirectory");
    } else if (targetDirectory === "secondaryDirectory") {
      if (dirtectiveArgs.primaryDirectory.path === dirtectiveArgs.secondaryDirectory.path) {
        console.log(red(`You cannot compare the same directory. Please select a different directory than ${answer}.\n`));
        return selectDirectory("secondaryDirectory");
      }
      return identifyDuplicates();
    } else {
      return dirtectiveArgs;
    }
  } catch (error) {
    console.log(error);
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
          white(`No files found in ${selectedDir.path}. Please select a different directory.\n}`)
      });
    } else {
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
          createdDate: rawCreatedDate,
          size: fileSize
        };
      });

      const fileData = await Promise.all(fileDataPromises);
      selectedDir.files = fileData;
      spinner.success({
        text: white(`Found ${selectedDir.files.length} files.\n}`)
      });
      return fileData;
    }
  } catch (error) {
    console.log(error);
  }
};

const identifyDuplicates = () => {
  const spinner = createSpinner("Looking for duplicates...\n").start();
  try {
    const primaryFiles = dirtectiveArgs.primaryDirectory.files;
    const secondaryFiles = dirtectiveArgs.secondaryDirectory.files;
    const newFiles = [];

    for (const primaryFile of primaryFiles) {
      for (const secondaryFile of secondaryFiles) {
        if (secondaryFile.name === primaryFile.name) {
          newFiles.push({ fileMatches: [primaryFile, secondaryFile] });
        }
      }
    }

    if (newFiles.length === 0) {
      spinner.success({ text: green("No duplicates found.\n") });
    } else {
      totalDuplicates = newFiles.length;
      duplicateQueue = newFiles;
      spinner.warn(`${newFiles.length} duplicates found.\n`);
      return chooseAllDupeAction();
    }
  } catch (error) {
    console.log(error);
  }
};

const chooseAllDupeAction = () => {
  inquirer
    .prompt([
      {
        type: "list",
        name: "allDupeAction",
        message: `${totalDuplicates} duplicate files found. What would you like to do?\n`,
        choices: [
          "1/8: Choose for each duplicate individually",
          "2/8: Move from primary to secondary directory (overwrites all in secondary)",
          "3/8: Move from secondary to primary directory (overwrites all in primary)",
          "4/8: Delete all duplicates from primary directory",
          "5/8: Delete all duplicates from secondary directory",
          "6/8: Delete all duplicates from both directories",
          "7/9: Create a JSON file with all duplicates",
          "8/9: Create a .csv file with all duplicates",
          "9/9: Cancel"
        ],
        default: "1/8: Choose for each duplicate individually"
      }
    ])
    .then(answer => {
      const action = answer["allDupeAction"];
      console.log(answer);

      switch (action) {
        case "7/9: Create a JSON file with all duplicates":
          return chooseNewFileLocation("json");
        case "8/9: Create a .csv file with all duplicates":
          return chooseNewFileLocation("csv");
        case "9/9: Cancel":
          console.log("Cancelled");
          return;
        case "1/8: Choose for each duplicate individually":
          return processDuplicates();
        default:
          console.log(answer);
          return;
      }
    }).catch(error => {
      console.log(error);
    });
};

const chooseNewFileLocation = (type) => {
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
      console.log(answer);
      return chooseNewFileName(answer["newFileLocation"], type);
    }).catch(error => {
      console.log(error);
    });
};

function findDivergentDirectories(paths) {
  const divergentDirs = [];

  function splitPath(path) {
    return path.split("/").filter(dir => dir);
  }

  const pathArrays = paths.map(splitPath);

  let divergentIndex = -1;
  for (let i = 0; i < Math.min(...pathArrays.map(arr => arr.length)); i++) {
    if (pathArrays[0][i] !== pathArrays[1][i]) {
      divergentIndex = i;
      break;
    }
  }

  if (divergentIndex === -1) {
    divergentDirs.push(pathArrays[0].join("/"));
    return divergentDirs;
  }

  for (const pathArray of pathArrays) {
    divergentDirs.push(pathArray[divergentIndex - 1] + "/" + pathArray[divergentIndex]);
  }

  return divergentDirs;
}

const chooseNewFileName = (targetPath, fileType) => {
  const path1 = dirtectiveArgs.primaryDirectory.path;
  const path2 = dirtectiveArgs.secondaryDirectory.path;
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
    .then(answer => {
      return createSummaryFile(targetPath, answer["newFileName"], fileType);
    }).catch(error => {
      console.log(error);
    });
};

function sanitizeFileName(fileName) {
  const invalidChars = ["/", "\\"];
  let sanitizedFileName = fileName;

  for (const char of invalidChars) {
    sanitizedFileName = sanitizedFileName.split(char).join("_");
  }

  return sanitizedFileName;
}

const createSummaryFile = async (targetPath, fileName, fileType) => {
  const sanitizedFileName = sanitizeFileName(fileName);
  const targetFile = `${targetPath}${path.sep}${sanitizedFileName}.${fileType}`;
  console.log(`Creating duplicate summary file at: ${targetFile}`);
  if (fileType === "json") {
    return createPackageJsonFile(targetFile, duplicateQueue);
  } else if (fileType === "csv") {
    await writeToCSV(targetFile, duplicateQueue);
  }
  return targetFile;
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

  table.push(
    { "Name": [file1.name, file2.name] },
    { "Created": [file1.createdDate, file2.createdDate] },
    { "Size": [file1.size.calculated, file2.size.calculated] },
    { "Type": [file1.type, file2.type] }
  );

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
    } else {
      choices.push("Delete larger file (2)");
      choices.push("Delete smaller file (1)");
    }
  }

  if (firstMatch.createdDate !== secondMatch.createdDate) {
    if (firstMatch.createdDate > secondMatch.createdDate) {
      choices.push("Delete newer file (1)");
      choices.push("Delete older file (2)");
    } else {
      choices.push("Delete newer file (2)");
      choices.push("Delete older file (1)");
    }
  }

  return choices;
};

const chooseFileAction = async (duplicates, table, choices) => {
  try {
    await inquirer.prompt([
      {
        type: "list",
        name: "chooseFileAction",
        message: `Duplicate ${currentSelectedNumber} of ${totalDuplicates}. What would you like to do?\n\n` +
          table.toString() + "\n",
        choices: choices,
        default: "Keep both"
      }
    ]).then(async answer => {
      const file1 = duplicates[0];
      const file2 = duplicates[1];

      console.log("answer: ", answer["chooseFileAction"]);

      currentSelectedNumber++;
      await performAction(answer["chooseFileAction"], file1, file2);
    }).catch(error => {
      console.log(error);
    });
  } catch (error) {
    console.log(error);
  }
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
      console.log("file1.full: ", file1.full);
      console.log("file2.full: ", file2.full);
      return actionResult;
    } else if (answer === "Delete both") {
      await fs.unlink(file1.full);
      await fs.unlink(file2.full);
      actionResult.success = true;
      return actionResult;
    } else if (answer === "Delete from (1)") {
      if (shell.rm("-rf", `${file1.full}`).code !== 0) {
        actionResult.success = false;
        shell.echo("Error: failed to delete file");
        shell.exit(1);
      } else {
        actionResult.success = true;
      }
      return actionResult;
    } else if (answer === "Delete from (2)") {
      await fs.unlink(file2.full);
      actionResult.success = true;
      return actionResult;
    } else if (answer === "Delete larger file (1)") {
      await fs.unlink(file1.full);
      actionResult.success = true;
      return actionResult;
    } else if (answer === "Delete larger file (2)") {
      await fs.unlink(file2.full);
      actionResult.success = true;
      return actionResult;
    } else if (answer === "Delete smaller file (1)") {
      await fs.unlink(file1.full);
      actionResult.success = true;
      return actionResult;
    } else if (answer === "Delete smaller file (2)") {
      await fs.unlink(file2.full);
      actionResult.success = true;
      return actionResult;
    } else if (answer === "Delete newer file (1)") {
      await fs.unlink(file1.full);
      actionResult.success = true;
      return actionResult;
    } else if (answer === "Delete newer file (2)") {
      await fs.unlink(file2.full);
      actionResult.success = true;
      return actionResult;
    } else if (answer === "Delete older file (1)") {
      await fs.unlink(file1.full);
      actionResult.success = true;
      return actionResult;
    } else if (answer === "Delete older file (2)") {
      await fs.unlink(file2.full);
      actionResult.success = true;
      return actionResult;
    } else {
      actionResult.success = true;
      return actionResult;
    }
  } catch (error) {
    console.error(`Error performing action: ${error.message}`);
    return { success: false, action: answer, error: error.message };
  }
};

const processDuplicates = async () => {
  try {
    // console.log("duplicateQueue: ", JSON.stringify(duplicateQueue, null, 2));

    for (const duplicatePair of duplicateQueue) {
      const convertedDuplicates = await convertDuplicates(duplicatePair.fileMatches);
      const table = await constructTable(convertedDuplicates);
      const choices = await setChoices(duplicatePair.fileMatches);
      const dupeResult = await chooseFileAction(convertedDuplicates, table, choices);

      console.log("dupeResult: ", JSON.stringify(dupeResult, null, 2));

      summary.actions.push(dupeResult);

      if (dupeResult.success) {
        summary.success++;
      } else {
        summary.failed++;
      }
    }

    console.log("Summary:\n", summary);
  } catch (error) {
    console.log(error);
  }
};