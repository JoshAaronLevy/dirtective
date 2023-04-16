import path from "path";
import { promises as fs } from "fs";
import moment from "moment";
import Papa from "papaparse";
import { getFileType } from "./fileTypes.mjs";
import { constants } from "../models/args.mjs";

export const walk = async (dir, fileList = []) => {
  const files = await fs.readdir(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      await walk(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }

  return fileList;
};

const convertFile = async (file) => {
  try {
    let newFile = {};
    const filePath = file;

    const fileStats = await fs.stat(filePath);
    const fileSize = fileStats.size;
    const friendlySize = bytesToSize(fileSize);

    const rawCreatedDate = fileStats.birthtime;
    const friendlyDate = moment(rawCreatedDate).format("MM/DD/YYYY hh:mma");

    const fileBase = path.basename(file);

    const fileExtension = path.extname(fileBase);
    const fileType = getFileType(fileExtension);

    newFile.name = fileBase;
    newFile.path = path.dirname(file);
    newFile.createdDate = friendlyDate;
    newFile.date = {
      raw: rawCreatedDate,
      formatted: friendlyDate,
    };
    newFile.size = {
      bytes: fileSize,
      calculated: `${friendlySize.size} ${friendlySize.unit}`,
    };
    newFile.type = fileType;
    return newFile;
  } catch (error) {
    console.log(error);
  }
};

export const findDuplicates = async (initialDir, comparisonDir) => {
  const initialFiles = await walk(initialDir);
  const comparisonFiles = await walk(comparisonDir);

  const initialFilenames = initialFiles.map(file => path.basename(file));
  const duplicateFilesMap = {};

  for (const file of comparisonFiles) {
    const filename = path.basename(file);
    const index = initialFilenames.indexOf(filename);

    if (index !== -1) {
      if (!duplicateFilesMap[initialFiles[index]]) {
        duplicateFilesMap[initialFiles[index]] = [initialFiles[index]];
      }
      duplicateFilesMap[initialFiles[index]].push(file);
    }
  }

  const duplicateFiles = Object.values(duplicateFilesMap).map(async matches => {
    const convertedMatches = matches.map(async match => await convertFile(match));
    const matchList = await Promise.all(convertedMatches).then(matches => matches);
    return ({ fileMatches: matchList });
  });

  return await Promise.all(duplicateFiles).then(matches => matches);
};

export const bytesToSize = (bytes) => {
  if (isNaN(bytes) || bytes < 0) {
    return "Invalid input";
  }

  const kilobyte = 1024;
  const megabyte = kilobyte * 1024;

  if (bytes < megabyte) {
    return {
      size: (bytes / kilobyte).toFixed(2),
      unit: "KB"
    };
  } else {
    return {
      size: (bytes / megabyte).toFixed(2),
      unit: "MB"
    };
  }
};

export const sizeToBytes = async (size, unit) => {
  if (isNaN(size) || size < 0 || !["KB", "MB"].includes(unit.toUpperCase())) {
    return "Invalid input";
  }

  const kilobyte = 1024;
  const megabyte = kilobyte * 1024;

  if (unit.toUpperCase() === "KB") {
    return size * kilobyte;
  } else {
    return size * megabyte;
  }
};

export const transformDupe = async (file) => {
  try {
    const filePath = `${file.path}${path.sep}${file.base}`;

    const fileStats = await fs.stat(filePath);
    const fileSize = fileStats.size;
    const friendlySize = bytesToSize(fileSize);

    const rawCreatedDate = fileStats.birthtime;
    const friendlyDate = moment(rawCreatedDate).format("MM/DD/YYYY hh:mma");

    const fileExtension = path.extname(file.base);
    const fileType = getFileType(fileExtension);

    file.name = file.base;
    file.createdDate = friendlyDate;
    file.date = {
      raw: rawCreatedDate,
      formatted: friendlyDate,
    };
    file.size = {
      bytes: fileSize,
      calculated: `${friendlySize.size} ${friendlySize.unit}`,
    };
    file.type = fileType;

    return file;
  } catch (error) {
    console.log(error);
  }
};

export const convertDuplicates = async (duplicateFiles) => {
  try {
    let convertedDupes = [];
    for (const file of duplicateFiles) {
      convertedDupes.push(await transformDupe(file));
    }
    return convertedDupes;
  } catch (error) {
    console.log(error);
  }
};

export const findDivergentDirectories = (paths) => {
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
};

function sanitizeFileName(fileName) {
  const invalidChars = ["/", "\\"];
  let sanitizedFileName = fileName;

  for (const char of invalidChars) {
    sanitizedFileName = sanitizedFileName.split(char).join("_");
  }

  return sanitizedFileName;
}

export const createMergeDirectory = async (targetPath) => {
  const mergeDir = `${targetPath}${path.sep}${constants.MERGE_DIRECTORY}`;
  try {
    await fs.mkdir(mergeDir);
    return mergeDir;
  } catch (error) {
    console.log(error);
  }
};

export const createSummaryFile = async (targetPath, fileName, fileType, duplicateQueue) => {
  const sanitizedFileName = sanitizeFileName(fileName);
  const targetFile = `${targetPath}${path.sep}${sanitizedFileName}.${fileType}`;
  if (fileType === "json") {
    return createPackageJsonFile(targetFile, duplicateQueue);
  } else if (fileType === "csv") {
    console.log("Writing to CSV...");
    await writeToCSV(targetFile, duplicateQueue);
  }
  return targetFile;
};

export const createPackageJsonFile = async (newFilePath, duplicateQueue) => {
  try {
    const jsonData = await generateJsonFileData(duplicateQueue);
    await fs.writeFile(newFilePath, jsonData, "utf8");
    console.log(`File written successfully in: ${newFilePath}`);
  } catch (error) {
    console.log(`Error! Unable to write file: \n${error}`);
  }
};

export const generateJsonFileData = async (duplicateQueue) => {
  try {
    if (duplicateQueue.length > 0) {
      const mappedDupeQueuePromises = duplicateQueue.map(async (dupe) => {
        const modifiedDupe = await convertDuplicates(dupe.fileMatches);
        return modifiedDupe;
      });

      const mappedDupeQueue = await Promise.all(mappedDupeQueuePromises);
      return JSON.stringify(mappedDupeQueue);
    } else {
      return duplicateQueue;
    }
  } catch (error) {
    console.log(error);
  }
};

export const writeToCSV = async (fileName, duplicateQueue) => {
  try {
    const fileData = duplicateQueue.map(async (duplicate, index) => {
      let file1 = await duplicate.fileMatches[0];
      let file2 = await duplicate.fileMatches[1];
      return {
        ["#"]: index + 1,
        ["(1) name"]: file1.name,
        ["(1) path"]: file1.path,
        ["(1) created"]: file1.date.raw,
        ["(1) size"]: file1.size.calculated,
        ["(1) bytes"]: file1.size.bytes,
        ["(1) type"]: file1.type,
        ["-"]: "-",
        ["(2) name"]: file2.name,
        ["(2) path"]: file2.path,
        ["(2) created"]: file2.date.raw,
        ["(2) size"]: file2.size.calculated,
        ["(2) bytes"]: file2.size.bytes,
        ["(2) type"]: file2.type
      };
    });

    const csvData = await Promise.all(fileData)
      .then((data) => {
        console.log("data: ", data);
        return data;
      }).catch((error) => {
        console.log("error: ", error);
      });

    const csvHeaders = constants.csvHeaders;

    const csv = Papa.unparse(csvData, csvHeaders);
    await fs.writeFile(fileName, csv, "utf8");
  } catch (error) {
    console.log(`Error! Unable to write file: \n${error}`);
  }
};