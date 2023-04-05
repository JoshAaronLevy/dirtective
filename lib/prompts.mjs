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

let duplicateDecisions = [];

const questions = [
  {
    type: 'list',
    name: 'continue',
    message: 'Do you want to continue?',
    choices: ['Yes', 'No'],
    default: 'Yes'
  }
];

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
      // console.log("dirtectiveArgs: ", JSON.stringify(dirtectiveArgs, null, 2));
      return identifyDuplicates();
      // return constructTable();
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
      const friendlySize = bytesToSize(fileSize);
      const rawCreatedDate = fs.statSync(filePath).birthtime;
      const createdDate = moment(rawCreatedDate).format("MM/DD/YYYY hh:mma");
      selectedDir.size.bytes += fileSize;
      return {
        name: path.parse(file).name,
        base: path.basename(file),
        path: filePath,
        type: path.extname(file) || null,
        createdDate: createdDate,
        size: `${friendlySize.size} ${friendlySize.unit}`
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
  return updateQueue(newFiles);
};

const constructTable = (duplicateFiles) => {
  const table = new Table({
    head: [
      // '',
      dirtectiveArgs.primaryDirectory.path,
      dirtectiveArgs.secondaryDirectory.path
    ],
    chars: {
      'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗'
      , 'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝'
      , 'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼'
      , 'right': '║', 'right-mid': '╢', 'middle': '│'
    },
    wordWrap: true
  });
  duplicateFiles.forEach(file => {
    let dupeName = Object.keys(file)[0];
    table.push(
      [JSON.stringify(file[dupeName][0].path), JSON.stringify(file[dupeName][1])]
    )
  });
};

const updateQueue = (duplicateQueue) => {
  console.log("duplicateQueue: ", JSON.stringify(duplicateQueue, null, 2));
  if (duplicateQueue.length > 0) {
    queuedDuplicates.push(duplicateQueue.shift());
    return chooseFileAction(queuedDuplicates[0].fileMatches);
  }
};

const chooseFileAction = (fileMatches) => {
  console.log("fileMatches: ", JSON.stringify(fileMatches, null, 2));
  inquirer
    .prompt([
      {
        type: 'list',
        name: 'keepFile',
        message: 'What would you like to do with these matching files?\n' + JSON.stringify(fileMatches),
        choices: [
          `Keep from ${dirtectiveArgs.primaryDirectory.path}`,
          `Keep from ${dirtectiveArgs.secondaryDirectory.path}`,
          'Keep larger file',
          'Keep smaller file',
          'Keep older file',
          'Keep newer file',
          'Keep from both',
          'Skip'
        ],
        default: 'Skip'
      }
    ])
    .then(answer => {
      console.log(answer);
      if (answer.keepFile === 'Skip') {
        return updateQueue(queuedDuplicates);
      }
    }).catch(error => {
      console.log(error);
    });
};
