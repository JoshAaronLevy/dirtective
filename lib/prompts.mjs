#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
const directory = process.cwd();
import { createSpinner } from "nanospinner";
import Table from 'cli-table3';
import * as colors from "colorette";
import moment from 'moment';
import inquirer from 'inquirer';
import inquirerFileTreeSelection from 'inquirer-file-tree-selection-prompt';
import { bytesToSize, sizeToBytes } from './helpers/utils.mjs';
import { getFileType } from './helpers/fileTypes.mjs';

inquirer.registerPrompt('file-tree-selection', inquirerFileTreeSelection);

let rootPath;

let dirtectiveArgs = {
  primaryDirectory: {
    fileCount: 0,
    size: {
      bytes: 0,
      calculated: null
    },
    name: null,
    path: null,
    files: []
  },
  secondaryDirectory: {
    fileCount: 0,
    size: {
      bytes: 0,
      calculated: null
    },
    name: null,
    path: null,
    files: []
  },
  newDirectory: {
    fileCount: 0,
    size: {
      bytes: 0,
      calculated: null
    },
    name: null,
    path: null,
    files: []
  }
};

let duplicateQueue = [];

let queuedDuplicates = [];

let currentSelectedNumber = 1;

let totalDuplicates = 0;

let table;

export default async (command) => {
  try {
    const spinner = createSpinner("Gathering directories...\n").start();
    rootPath = await getRootPath();
    spinner.success("Gathered directories\n" + colors.green(directory));
    if (rootPath) {
      return selectPrimaryDirectory();
    }
  } catch (error) {
    console.log(error);
  }
};

const getRootPath = async () => {
  try {
    const arrPath = directory.split(path.sep);
    return arrPath.slice(0, arrPath.length - 1).join(path.sep);
  } catch (error) {
    console.log(error);
    return "";
  }
};

const selectPrimaryDirectory = () => {
  inquirer
    .prompt([
      {
        type: 'file-tree-selection',
        onlyShowDir: true,
        enableGoUpperDirectory: true,
        root: rootPath,
        name: 'primaryDirectory'
      }
    ])
    .then(async answer => {
      dirtectiveArgs.primaryDirectory.path = answer.primaryDirectory;
      dirtectiveArgs.primaryDirectory.name = path.basename(answer.primaryDirectory);
      dirtectiveArgs.primaryDirectory.files = await getFileList(dirtectiveArgs["primaryDirectory"]);
      dirtectiveArgs.primaryDirectory.fileCount = dirtectiveArgs.primaryDirectory.files.length;
      const friendlySize = bytesToSize(dirtectiveArgs.primaryDirectory.size.bytes);
      dirtectiveArgs.primaryDirectory.size.calculated = `${friendlySize.size} ${friendlySize.unit}`;
      return selectSecondaryDirectory();
    }).catch(error => {
      console.log(error);
    });
};

const selectSecondaryDirectory = () => {
  inquirer
    .prompt([
      {
        type: 'file-tree-selection',
        onlyShowDir: true,
        enableGoUpperDirectory: true,
        root: rootPath,
        name: 'secondaryDirectory'
      }
    ])
    .then(async answer => {
      dirtectiveArgs.secondaryDirectory.path = answer.secondaryDirectory;
      dirtectiveArgs.secondaryDirectory.name = path.basename(answer.secondaryDirectory);
      dirtectiveArgs.secondaryDirectory.files = await getFileList(dirtectiveArgs["secondaryDirectory"]);
      dirtectiveArgs.secondaryDirectory.fileCount = dirtectiveArgs.secondaryDirectory.files.length;
      const friendlySize = bytesToSize(dirtectiveArgs.secondaryDirectory.size.bytes);
      dirtectiveArgs.secondaryDirectory.size.calculated = `${friendlySize.size} ${friendlySize.unit}`;
      return identifyDuplicates();
    }).catch(error => {
      console.log(error);
    });
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
        type: getFileType(path.extname(file)) || null,
        createdDate: rawCreatedDate,
        size: fileSize
      }
    });
  } catch (error) {
    console.log(error);
  }
};

const identifyDuplicates = async () => {
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
  totalDuplicates = newFiles.length;
  duplicateQueue = newFiles;
  return updateQueue();
};

const constructTable = async (duplicateFiles) => {
  table = new Table({
    head: [`1: ${duplicateFiles[0].path}`, `2: ${duplicateFiles[1].path}`],
    chars: {
      'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗'
      , 'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝'
      , 'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼'
      , 'right': '║', 'right-mid': '╢', 'middle': '│'
    },
    wordWrap: true
  });
  table.push(
    [JSON.stringify(duplicateFiles[0], null, 2), JSON.stringify(duplicateFiles[1], null, 2)]
  );
  return table;
};

const convertDuplicates = async (duplicateFiles) => {
  try {
    const convertedDupes = duplicateFiles.map(file => {
      const filePath = `${file.path}${path.sep}${file.base}`;
      console.log("filePath: ", filePath);
      const fileSize = fs.statSync(filePath).size;
      const friendlySize = bytesToSize(fileSize);
      const rawCreatedDate = fs.statSync(filePath).birthtime;
      console.log("rawCreatedDate: ", rawCreatedDate);
      const createdDate = moment(rawCreatedDate).format("MM/DD/YYYY hh:mma");
      console.log("createdDate: ", createdDate);
      return {
        createdDate: createdDate,
        size: `${friendlySize.size} ${friendlySize.unit}`,
        ...file
      }
    });
    // console.log("convertedDupes: \n", JSON.stringify(convertedDupes, null, 2));
    console.log("convertedDupes: \n", Object.entries(convertedDupes[0]));
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
      // await constructTable(queuedDuplicates[0].fileMatches);
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
      'Skip'
    ];
    choices.push(`Keep from ${dirtectiveArgs.primaryDirectory.path}`);
    choices.push(`Keep from ${dirtectiveArgs.secondaryDirectory.path}`);
    if (firstMatch.size !== secondMatch.size) {
      choices.push('Keep larger file');
      choices.push('Keep smaller file');
    }
    if (firstMatch.createdDate !== secondMatch.createdDate) {
      choices.push('Keep older file');
      choices.push('Keep newer file');
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
        type: 'list',
        name: 'keepFile',
        message: `Duplicate ${currentSelectedNumber} of ${totalDuplicates}, What would you like to do?\n\n` +
          table.toString(),
        choices: choices,
        default: 'Skip'
      }
    ])
    .then(answer => {
      console.log(answer);
      fileMatches.push(answer);
      matchPair.answer = answer;
      currentSelectedNumber++;
      return updateQueue();
    }).catch(error => {
      console.log(error);
    });
};
