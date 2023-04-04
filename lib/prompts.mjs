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

let rootPath;

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

const identifyDuplicates = () => {
  const primaryFiles = dirtectiveArgs.primaryDirectory.files;
  const secondaryFiles = dirtectiveArgs.secondaryDirectory.files;
  const newFiles = [];
  primaryFiles.forEach(primaryFile => {
    secondaryFiles.forEach(secondaryFile => {
      if (secondaryFile.name === primaryFile.name) {
        newFiles.push({ [primaryFile.name]: [primaryFile, secondaryFile] });
      }
    });
  });
  console.log("newFiles: ", JSON.stringify(newFiles));
  // Promise.all(newFiles.map(async file => {
  //   return chooseFileAction(file);
  // }));
  return newFiles;
};

const constructTable = () => {
  const table = new Table({
    head: [
      // '',
      dirtectiveArgs.primaryDirectory.path,
      dirtectiveArgs.secondaryDirectory.path
    ],
    // colWidths: [100, 100],
    chars: {
      'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗'
      , 'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝'
      , 'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼'
      , 'right': '║', 'right-mid': '╢', 'middle': '│'
    },
    wordWrap: true
  });
  table.push(
    [dirtectiveArgs.primaryDirectory.files[0].name, dirtectiveArgs.secondaryDirectory.files[0].name],
    [dirtectiveArgs.primaryDirectory.files[1].name, dirtectiveArgs.secondaryDirectory.files[1].name],
    [dirtectiveArgs.primaryDirectory.files[2].name, dirtectiveArgs.secondaryDirectory.files[2].name]
  );
  console.log(table.toString());
};

const chooseFileAction = () => {
  inquirer
    .prompt([
      {
        type: 'list',
        name: 'deleteFile',
        message: 'What would you like to do with this file?',
        choices: [
          `Delete from ${dirtectiveArgs.primaryDirectory.path}`,
          `Delete from ${dirtectiveArgs.secondaryDirectory.path}`,
          'Delete larger file',
          'Delete smaller file',
          'Delete older file',
          'Delete newer file',
          'Delete from both',
          'Skip'
        ],
        default: 'Skip'
      }
    ])
    .then(answer => {
      console.log(answer);
    }).catch(error => {
      console.log(error);
    });
};
