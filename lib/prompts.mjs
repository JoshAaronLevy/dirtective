#!/usr/bin/env node
import path from "path";
import { promises as fs } from "fs";
const directory = process.cwd();
import { createSpinner } from "nanospinner";
import Table from "cli-table3";
import { red } from "colorette";
import moment from "moment";
import inquirer from "inquirer";
import inquirerFileTreeSelection from "inquirer-file-tree-selection-prompt";
import { dirtectiveArgs } from "./models/args.mjs";
import { bytesToSize } from "./helpers/utils.mjs";
import { getFileType } from "./helpers/fileTypes.mjs";

inquirer.registerPrompt("file-tree-selection", inquirerFileTreeSelection);

let rootPath;
let cwdPath;
let duplicateQueue = [];
let currentSelectedNumber = 1;
let totalDuplicates = 0;

export default async (command) => {
  if (command) {
    console.log("command:\n", command.args);
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
  try {
    const asyncFileList = await fs.readdir(selectedDir.path);
    const fileList = asyncFileList.filter(file => !file.includes("$") && !file.includes(".ini") && file[0] !== ".");

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
    return fileData;
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
      spinner.warn("No duplicates found.\n");
    } else {
      totalDuplicates = newFiles.length;
      duplicateQueue = newFiles;
      spinner.success(`${newFiles.length} duplicates found.\n`);
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
        message: `${totalDuplicates} found. What would you like to do?\n`,
        choices: [
          "1/8: Choose for each duplicate individually",
          "2/8: Move from primary to secondary directory (overwrites all in secondary)",
          "3/8: Move from secondary to primary directory (overwrites all in primary)",
          "4/8: Delete all duplicates from primary directory",
          "5/8: Delete all duplicates from secondary directory",
          "6/8: Delete all duplicates from both directories",
          "7/8: Create a JSON file with all duplicates",
          "8/8: Cancel"
        ],
        default: "1/8: Choose for each duplicate individually"
      }
    ])
    .then(answer => {
      console.log(answer);
      if (answer["allDupeAction"] === "7/8: Create a JSON file with all duplicates") {
        return chooseJsonLocation();
      } else if (answer["allDupeAction"] === "8/8: Cancel") {
        return;
      } else if (answer["allDupeAction"] === "1/8: Choose for each duplicate individually") {
        return processDuplicates();
      } else {
        console.log(answer);
      }
    }).catch(error => {
      console.log(error);
    });
};

const chooseJsonLocation = () => {
  inquirer
    .prompt([
      {
        type: "file-tree-selection",
        name: "jsonLocation",
        onlyShowDir: true,
        enableGoUpperDirectory: true,
        root: cwdPath,
      }
    ])
    .then(answer => {
      console.log(answer);
      return chooseJsonName(answer["jsonLocation"]);
    }).catch(error => {
      console.log(error);
    });
};

const chooseJsonName = (targetPath) => {
  const timestamp = moment().format("YYYY-MM-DD-HH-mm-ss");
  const defaultName = `dirtective-duplicates-${timestamp}.json`;
  inquirer
    .prompt([
      {
        type: "input",
        name: "jsonName",
        message: "What would you like to name the JSON file?",
        default: defaultName
      }
    ])
    .then(answer => {
      const targetFile = `${targetPath}${path.sep}${answer["jsonName"]}`;
      console.log(`Writing duplicate file to: ${targetFile}`);
      return createPackageJsonFile(targetFile);
    }).catch(error => {
      console.log(error);
    });
};

const convertDuplicates = async (duplicateFiles) => {
  try {
    const convertedDupesPromises = duplicateFiles.map(async (file) => {
      const filePath = `${file.path}${path.sep}${file.base}`;

      const fileStats = await fs.stat(filePath);
      const fileSize = fileStats.size;
      const friendlySize = bytesToSize(fileSize);

      const rawCreatedDate = fileStats.birthtime;
      const friendlyDate = moment(rawCreatedDate).format("MM/DD/YYYY hh:mma");

      const fileExtension = path.extname(file.base);
      const fileType = await getFileType(fileExtension) || null;

      return {
        name: file.base,
        createdDate: friendlyDate,
        size: {
          bytes: fileSize,
          calculated: `${friendlySize.size} ${friendlySize.unit}`,
        },
        type: fileType,
        path: file.path,
      };
    });

    const convertedDupes = await Promise.all(convertedDupesPromises);
    console.log("convertedDupes:\n", JSON.stringify(convertedDupes, null, 2));
    return convertedDupes;
  } catch (error) {
    console.log(error);
  }
};

const generateJsonFileData = async () => {
  try {
    if (duplicateQueue.length > 0) {
      const mappedDupeQueuePromises = duplicateQueue.map(async (dupe) => {
        const modifiedDupe = await convertDuplicates(dupe.fileMatches);
        return modifiedDupe;
      });

      const mappedDupeQueue = await Promise.all(mappedDupeQueuePromises);
      return JSON.stringify(mappedDupeQueue);
    } else {
      console.log("duplicateQueue: ", duplicateQueue);
      return duplicateQueue;
    }
  } catch (error) {
    console.log(error);
  }
};

const processDuplicates = async (duplicateQueue) => {
  for (let i = 0; i < duplicateQueue.length; i++) {
    const duplicates = await convertDuplicates(duplicateQueue[i].fileMatches);
    const table = constructTable(duplicates);
    const choices = setChoices(duplicates);
    await chooseFileAction(duplicates, table, choices);
  }
};

const constructTable = (duplicateFiles) => {
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

const setChoices = (fileMatches) => {
  const firstMatch = fileMatches[0];
  const secondMatch = fileMatches[1];
  let choices = [
    "Skip",
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
    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "keepFile",
        message: `Duplicate ${currentSelectedNumber} of ${totalDuplicates}. What would you like to do?\n\n` +
          table.toString() + "\n",
        choices: choices,
        default: "Skip"
      }
    ]);

    console.log(answer);
    duplicates.answer = answer;
    currentSelectedNumber++;
  } catch (error) {
    console.log(error);
  }
};

const createPackageJsonFile = async (newFilePath) => {
  try {
    const jsonData = await generateJsonFileData();
    await fs.writeFile(newFilePath, jsonData, "utf8");
    console.log(`File written successfully in ${newFilePath}`);
  } catch (error) {
    console.log(`Error! Unable to write file: \n${error}`);
  }
};