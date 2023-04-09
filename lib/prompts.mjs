#!/usr/bin/env node
import path from "path";
import fs from "fs";
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
let queuedDuplicates = [];
let currentSelectedNumber = 1;
let totalDuplicates = 0;
let table;

export default async (command) => {
  if (command) {
    console.log("command:\n", command.args);
  }
  try {
    rootPath = await getRootPath();
    console.log("rootPath: ", rootPath);
    cwdPath = await getCwdPath();
    console.log("cwdPath: ", cwdPath);
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
    dirtectiveArgs[targetDirectory].path = answer;
    dirtectiveArgs[targetDirectory].name = path.basename(answer);
    dirtectiveArgs[targetDirectory].files = await getFileList(dirtectiveArgs[targetDirectory]);
    dirtectiveArgs[targetDirectory].fileCount = dirtectiveArgs[targetDirectory].files.length;
    const friendlySize = bytesToSize(dirtectiveArgs[targetDirectory].size.bytes);
    dirtectiveArgs[targetDirectory].size.calculated = `${friendlySize.size} ${friendlySize.unit}`;

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
    const fileList = fs.readdirSync(selectedDir.path).filter(file => !file.includes("$") && !file.includes(".ini") && file[0] !== ".");
    return selectedDir.files = fileList.map(file => {
      const filePath = `${selectedDir.path}${path.sep}${file}`;
      const fileSize = fs.statSync(filePath).size;
      const rawCreatedDate = fs.statSync(filePath).birthtime;
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
  } catch (error) {
    console.log(error);
  }
};

const identifyDuplicates = async () => {
  const spinner = createSpinner("Looking for duplicates...\n").start();
  try {
    const primaryFiles = dirtectiveArgs.primaryDirectory.files;
    const secondaryFiles = dirtectiveArgs.secondaryDirectory.files;
    const newFiles = [];
    primaryFiles.forEach(primaryFile => {
      secondaryFiles.forEach(secondaryFile => {
        if (secondaryFile.name === primaryFile.name) {
          newFiles.push({ fileMatches: [primaryFile, secondaryFile] });
        }
      });
    });
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
        return updateQueue();
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
    }).catch(error => {
      console.log(error);
    });
};

const constructTable = async (duplicateFiles) => {
  const file1 = duplicateFiles[0];
  const file2 = duplicateFiles[1];
  table = new Table({
    head: ["", `(1) ${file1.path}`, `(2) ${file2.path}`],
    chars: {
      "top": "═", "top-mid": "╤", "top-left": "╔", "top-right": "╗"
      , "bottom": "═", "bottom-mid": "╧", "bottom-left": "╚", "bottom-right": "╝"
      , "left": "║", "left-mid": "╟", "mid": "─", "mid-mid": "┼"
      , "right": "║", "right-mid": "╢", "middle": "│"
    },
    wordWrap: true
  });
  table.push(
    { "Name": [file1.name, file2.name] },
    { "Created": [file1.createdDate, file2.createdDate] },
    { "Size": [file1.size.calculated, file2.size.calculated] },
    { "Type": [file1.type, file2.type] },
    // [JSON.stringify(duplicateFiles[0], null, 2), JSON.stringify(duplicateFiles[1], null, 2)]
  );
  return table;
};

const convertDuplicates = async (duplicateFiles) => {
  try {
    const convertedDupes = duplicateFiles.map(file => {
      const filePath = `${file.path}${path.sep}${file.base}`;
      const fileSize = fs.statSync(filePath).size;
      const friendlySize = bytesToSize(fileSize);
      const rawCreatedDate = fs.statSync(filePath).birthtime;
      const friendlyDate = moment(rawCreatedDate).format("MM/DD/YYYY hh:mma");
      return {
        name: file.base,
        createdDate: friendlyDate,
        size: {
          bytes: fileSize,
          calculated: `${friendlySize.size} ${friendlySize.unit}`
        },
        type: getFileType(file.extension) || null,
        path: file.path
      };
    });
    return convertedDupes;
  } catch (error) {
    console.log(error);
  }
};

const updateQueue = async () => {
  try {
    queuedDuplicates = [];
    let tempQueue = [...duplicateQueue];
    if (tempQueue.length > 0) {
      queuedDuplicates.push(tempQueue.shift());
      const newDupeQueuedStuff = await convertDuplicates(queuedDuplicates[0].fileMatches);
      await constructTable(newDupeQueuedStuff);
      const dupeChoices = await setChoices(queuedDuplicates[0].fileMatches);
      return chooseFileAction(queuedDuplicates[0], dupeChoices);
    } else {
      console.log("duplicateQueue: ", duplicateQueue);
      return duplicateQueue;
    }
  } catch (error) {
    console.log(error);
  }
};

const setChoices = async (fileMatches) => {
  try {
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
  } catch (error) {
    console.log(error);
  }
};

const chooseFileAction = (matchPair, choices) => {
  inquirer
    .prompt([
      {
        type: "list",
        name: "keepFile",
        message: `Duplicate ${currentSelectedNumber} of ${totalDuplicates}. What would you like to do?\n\n` +
          table.toString() + "\n",
        choices: choices,
        default: "Skip"
      }
    ])
    .then(answer => {
      console.log(answer);
      // fileMatches.push(answer);
      matchPair.answer = answer;
      currentSelectedNumber++;
      return updateQueue();
    }).catch(error => {
      console.log(error);
    });
};
