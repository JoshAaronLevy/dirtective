#!/usr/bin/env node
/* eslint-disable indent */
import path from "path";
import { promises as fs } from "fs";
const directory = process.cwd();
import { createSpinner } from "nanospinner";
import Table from "cli-table3";
import { red } from "colorette";
import moment from "moment";
import inquirer from "inquirer";
import inquirerFileTreeSelection from "inquirer-file-tree-selection-prompt";
// import Papa from "papaparse";
import XLSX from "xlsx";
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
          "7/9: Create a JSON file with all duplicates",
          "8/9: Create an .xlsx file with all duplicates",
          "9/9: Cancel"
        ],
        default: "1/8: Choose for each duplicate individually"
      }
    ])
    .then(answer => {
      console.log(answer);
      if (answer["allDupeAction"] === "7/9: Create a JSON file with all duplicates") {
        return chooseNewFileLocation("json");
      } else if (answer["allDupeAction"] === "8/9: Create an .xlsx file with all duplicates") {
        return chooseNewFileLocation("xlsx");
      } else if (answer["allDupeAction"] === "9/9: Cancel") {
        return;
      } else if (answer["allDupeAction"] === "1/9: Choose for each duplicate individually") {
        return processDuplicates();
      } else {
        console.log(answer);
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

const chooseNewFileName = (targetPath, fileType) => {
  const timestamp = moment().format("MMM DD, YYYY [at] hh_mma");
  const defaultName = `dirtective-duplicates - ${timestamp}`;
  inquirer
    .prompt([
      {
        type: "input",
        name: "newFileName",
        message: "What would you like to name the JSON file?",
        default: defaultName
      }
    ])
    .then(answer => {
      return createSummaryFile(targetPath, answer["newFileName"], fileType);
    }).catch(error => {
      console.log(error);
    });
};

const createSummaryFile = async (targetPath, fileName, fileType) => {
  const targetFile = `${targetPath}${path.sep}${fileName}.${fileType}`;
  console.log(`Writing duplicate summary file to: ${targetFile}`);
  if (fileType === "json") {
    return createPackageJsonFile(targetFile);
  } else if (fileType === "xlsx") {
    await writeToXLSX(targetFile);
  }
  return targetFile;
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
      const fileType = getFileType(fileExtension);

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
    return convertedDupes;
  } catch (error) {
    console.log(error);
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
        name: "chooseFileAction",
        message: `Duplicate ${currentSelectedNumber} of ${totalDuplicates}. What would you like to do?\n\n` +
          table.toString() + "\n",
        choices: choices,
        default: "Skip"
      }
    ]);

    const file1 = duplicates[0];
    const file2 = duplicates[1];

    await performAction(answer["chooseFileAction"], file1, file2);
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

// const writeToCSV = async (duplicates, fileName) => {
//   const csvData = duplicates.map(duplicate => {
//     return {
//       name1: duplicate.fileMatches[0].name,
//       path1: duplicate.fileMatches[0].path,
//       name2: duplicate.fileMatches[1].name,
//       path2: duplicate.fileMatches[1].path
//     };
//   });

//   const csvHeaders = {
//     fields: ['name1', 'path1', 'name2', 'path2'],
//     header: true
//   };

//   const csv = Papa.unparse(csvData, csvHeaders);
//   fs.writeFileSync(fileName, csv, 'utf8');
// };

const writeToXLSX = async (fileName) => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet([]);

  duplicateQueue.forEach((duplicate, index) => {
    XLSX.utils.sheet_add_json(worksheet, [duplicate.fileMatches[0]], { header: ["name", "path"], skipHeader: true, origin: `A${index * 2 + 1}` });
    XLSX.utils.sheet_add_json(worksheet, [duplicate.fileMatches[1]], { header: ["name", "path"], skipHeader: true, origin: `B${index * 2 + 1}` });
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, "Duplicates");
  XLSX.writeFile(workbook, fileName);
};

const performAction = async (action, file1, file2) => {
  try {
    switch (action) {
      case "Skip":
        return { success: true, action: "Skipped" };
      case "Delete both":
        await fs.unlink(file1.full);
        await fs.unlink(file2.full);
        return { success: true, action: "Deleted both" };
      case "Delete from (1)":
        await fs.unlink(file1.full);
        return { success: true, action: "Deleted from (1)" };
      case "Delete from (2)":
        await fs.unlink(file2.full);
        return { success: true, action: "Deleted from (2)" };
      default:
      // Implement the additional actions for larger/smaller and newer/older files.
    }
  } catch (error) {
    console.error(`Error performing action: ${error.message}`);
    return { success: false, action: action, error: error.message };
  }
};

const processDuplicates = async () => {
  let summary = {
    total: duplicateQueue.length,
    success: 0,
    failed: 0,
    actions: []
  };

  for (const duplicatePair of duplicateQueue) {
    const convertedDuplicates = await convertDuplicates(duplicatePair.fileMatches);
    const table = await constructTable(convertedDuplicates);
    const choices = await setChoices(duplicatePair.fileMatches);

    const result = await chooseFileAction(convertedDuplicates, table, choices);

    summary.actions.push({
      file1: convertedDuplicates[0].full,
      file2: convertedDuplicates[1].full,
      result: result
    });

    if (result.success) {
      summary.success++;
    } else {
      summary.failed++;
    }
  }

  console.log("Summary:\n", summary);
};