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
import { constants } from "./models/args.mjs";
import { bytesToSize, convertDuplicates, createSummaryFile, findDivergentDirectories, findDuplicates, findFilesWithString } from "./helpers/utils.mjs";

inquirer.registerPrompt("file-tree-selection", inquirerFileTreeSelection);

let rootPath;
let cwdPath;
let duplicateQueue = [];
let uniqueQueue = [];
let currentSelectedNumber = 1;
let totalDuplicateFiles = 0;
let summary = {
  total: duplicateQueue.length,
  success: 0,
  failed: 0,
  actions: []
};
let searchValue = null;

export default async (command) => {
  if (command && command.args.length > 0) {
    console.log("command args:\n", command.args);
  }
  try {
    rootPath = await getRootPath();
    cwdPath = await getCwdPath();
    if (rootPath) {
      return initialAction();
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

const initialAction = () => {
  inquirer
    .prompt([
      {
        type: "list",
        name: "initialAction",
        message: "Would you like to do?\n",
        choices: [
          "Enter a new search query",
          "Compare directories"
        ],
        default: "Enter "
      }
    ])
    .then(answer => {
      const action = answer["initialAction"];

      if (action === "Enter a new search query") {
        return enterSearchQuery();
      } else if (action === "Compare directories") {
        return selectDirectory("primaryDirectory");
      } else {
        console.log("Cancelled");
        return;
      }
    }).catch(error => {
      console.log(error);
    });
};

const enterSearchQuery = () => {
  inquirer
    .prompt([
      {
        type: "input",
        name: "searchQuery",
        message: "What would you like to search for?",
        default: null
      }
    ])
    .then(async answer => {
      if (!answer["searchQuery"]) {
        console.log("No search query entered. Please try again.");
      } else if (answer["searchQuery"]) {
        searchValue = answer["searchQuery"];
        return selectSearchDirectory(searchValue);
      }
    }).catch(error => {
      console.log(error);
    });
};

const selectSearchDirectory = (searchValue) => {
  inquirer
    .prompt([
      {
        type: "file-tree-selection",
        onlyShowDir: true,
        enableGoUpperDirectory: true,
        root: rootPath,
        name: "searchDir"
      }
    ])
    .then(async answer => {
      console.log("answer[searchDir]: ", answer["searchDir"]);
      console.log("searchValue: ", searchValue);
      if (answer["searchDir"] && searchValue) {
        return await findFilesWithString(answer["searchDir"], searchValue);
      } else {
        console.log("No directory selected. Please try again.");
        return;
      }
    }).catch(error => {
      console.log(error);
    });
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
    const targetDir = constants[targetDirectory];
    targetDir.path = answer;
    targetDir.name = path.basename(answer);
    targetDir.files = await getFileList(targetDir);
    targetDir.fileCount = targetDir.files.length;

    const friendlySize = bytesToSize(targetDir.size.bytes);
    targetDir.size.calculated = `${friendlySize.size} ${friendlySize.unit}`;

    if (targetDirectory === "primaryDirectory") {
      return selectDirectory("secondaryDirectory");
    } else if (targetDirectory === "secondaryDirectory") {
      if (constants.primaryDirectory.path === constants.secondaryDirectory.path) {
        console.log(red(`You cannot compare the same directory. Please select a different directory than ${answer}.\n`));
        return selectDirectory("secondaryDirectory");
      }
      return findDupes();
    } else {
      return constants;
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
          white(`No files found in ${selectedDir.path}. Please select a different directory.\n`)
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
  } catch (error) {
    console.log(error);
  }
};

const identifyUniqueFiles = async () => {
  const arr1 = constants.primaryDirectory.files;
  const arr2 = constants.secondaryDirectory.files;

  let uniqueFiles = [];

  function fileExists(array, name) {
    return array.some(file => file.name === name);
  }

  arr1.forEach(file => {
    if (!fileExists(arr2, file.name)) {
      if (file.base.includes(".")) {
        uniqueFiles.push(file);
      }
    }
  });

  arr2.forEach(file => {
    if (!fileExists(arr1, file.name)) {
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
    .then(async duplicates => {
      duplicateQueue = duplicates;
      if (duplicates.length === 0) {
        spinner.success({ text: green("\nNo duplicates found.\n") });
      } else {
        spinner.success({ text: `${duplicateQueue.length} duplicates found.\n` });
      }
      await identifyUniqueFiles();
      return chooseAllDupeAction();
    })
    .catch(error => {
      spinner.error({ text: "An error occurred during the search" });
      console.error(error);
    });
};

const chooseAllDupeAction = () => {
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
        return;
      } else if (answer === "13/15: Create a JSON file with all duplicates") {
        return chooseNewFileLocation("json");
      } else if (answer === "14/15: Create a .csv file with all duplicates") {
        return chooseNewFileLocation("csv");
      } else if (answer === "1/15: Choose for each duplicate individually") {
        return processDuplicates();
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
          return processDuplicates();
        default:
          console.log(answer);
          return;
      }
    }).catch(error => {
      console.log(error);
    });
};

const postDupeAction = () => {
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
      } else {
        console.log("Cancelled");
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
      return chooseNewFileName(answer["newFileLocation"], type);
    }).catch(error => {
      console.log(error);
    });
};

const chooseNewDirectoryLocation = (type) => {
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

const chooseNewFileName = (targetPath, fileType) => {
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
    .then(async answer => {
      await createSummaryFile(targetPath, answer["newFileName"], fileType, duplicateQueue);
    }).catch(error => {
      console.log(error);
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

  table.push(
    { "Name": [file1.name, file2.name] },
    { "Created": [file1.date.formatted, file2.date.formatted] },
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

  if (firstMatch.date.raw !== secondMatch.date.raw) {
    if (firstMatch.date.raw > secondMatch.date.raw) {
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
        message: `Duplicate ${currentSelectedNumber} of ${totalDuplicateFiles}. What would you like to do?\n\n` +
          table.toString() + "\n",
        choices: choices,
        default: "Keep both"
      }
    ]).then(async answer => {
      currentSelectedNumber++;
      await performAction(answer["chooseFileAction"], duplicates[0], duplicates[1]);
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
      const postFileAction = await postDupeAction(dupeResult);
      console.log("postFileAction: ", JSON.stringify(postFileAction, null, 2));

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