#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
const directory = process.cwd();
import { createSpinner } from "nanospinner";
import * as colors from "colorette";
import inquirer from 'inquirer';
import inquirerFileTreeSelection from 'inquirer-file-tree-selection-prompt';

inquirer.registerPrompt('file-tree-selection', inquirerFileTreeSelection);

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
      return getDirectories();
    }
  } catch (error) {
    console.log(error);
  }
};

const getRootPath = async () => {
  try {
    const arrPath = directory.split(path.sep);
    return arrPath.slice(0, arrPath.length - 2).join(path.sep);
  } catch (error) {
    console.log(error);
    return "";
  }
};

const getDirectories = () => {
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
    .then(answer => {
      const primaryDirectory = JSON.stringify(answer.primaryDirectory, null, 2);
      console.log("primaryDirectory stringified: ", primaryDirectory);
      console.log("primaryDirectory replace: ", primaryDirectory.replace(/ /g, "\\ "));
    }).catch(error => {
      console.log(error);
    });
};