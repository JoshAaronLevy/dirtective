import path from "path";
import { promises as fs } from "fs";
import { exec } from "child_process";
import Fuse from "fuse.js";
import moment from "moment";
import Papa from "papaparse";
import cliProgress from "cli-progress";
import { getFileType } from "./fileTypes.mjs";
import { constants } from "../models/args.mjs";

const isSystemFile = (filename) => {
  const ext = path.extname(filename);
  const base = path.basename(filename);

  if (constants.systemFiles.includes(ext)) {
    return true;
  }

  if (base.startsWith("._")) {
    return true;
  }

  return false;
};

export const walk = async (dir, fileList = []) => {
  const files = await fs.readdir(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    if (isSystemFile(file)) {
      continue;
    }

    if (stat.isDirectory()) {
      await walk(filePath, fileList);
    } else {
      if (!file.startsWith(".")) {
        fileList.push(filePath);
      }
    }
  }

  return fileList;
};

const getFileTags = (filePath) => {
  return new Promise((resolve, reject) => {
    const script = `xattr -px com.apple.metadata:_kMDItemUserTags "${filePath}" | xxd -r -p | plutil -convert xml1 - -o -`;
    exec(script, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else if (stderr) {
        reject(new Error(stderr));
      } else {
        // Extract tags from plist XML
        const tagMatches = stdout.match(/<string>.*?<\/string>/g);
        const tags = tagMatches ? tagMatches.map(tag => tag.replace(/<\/?string>/g, "")) : [];
        resolve(tags);
      }
    });
  });
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
    // const fileTags = getFileTags(file)
    //   .then(tags => tags)
    //   .catch(error => console.error(error));

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
    // newFile.tags = fileTags;
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

const formatSeconds = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const checkResolution = (filePath, currentIndex) => {
  let matchingVideo = {};
  return new Promise((resolve, reject) => {
    import("fluent-ffmpeg").then(({ default: ffmpeg }) => {
      ffmpeg.ffprobe(filePath, async (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const videoStream = metadata.streams.find(stream => (stream.width <= 480 && stream.width > 0) && stream.codec_type === "video");
          if (videoStream) {
            console.log("metadata:\n", metadata);
            const fileTags = getFileTags(filePath)
              .then(tags => {
                console.log("tags: ", tags);
                return tags;
              })
              .catch(error => console.error(error));
            const convertedSize = bytesToSize(metadata.format.size);
            const roundedSeconds = Math.round(metadata.format.duration);
            matchingVideo = {
              id: currentIndex,
              path: filePath,
              name: path.basename(filePath),
              width: videoStream.width,
              height: videoStream.height,
              resolution: `${videoStream.width}x${videoStream.height}`,
              orientation: videoStream.width > videoStream.height ? "Landscape" : "Portrait",
              seconds: roundedSeconds,
              duration: formatSeconds(roundedSeconds),
              size: `${convertedSize.size} ${convertedSize.unit}`,
              tags: fileTags
            };
          }
          resolve(matchingVideo);
        }
      });
    });
  });
};

export const findFiles = async (dir) => {
  const files = await walk(dir);
  const totalFiles = files.length;
  console.log(`\nFiltering ${totalFiles} videos by low resolution. Please wait...\n`);
  const matchingFiles = [];

  const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_grey);
  bar1.start(totalFiles, 0);

  const fileStats = await fs.stat(files[5]);
  console.log("fileStats:\n", fileStats);

  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    const currentIndex = i + 1;
    bar1.update(currentIndex);
    let matchingVideo = await checkResolution(file, currentIndex);
    if (matchingVideo.path) {
      matchingFiles.push(matchingVideo);
    }
  }

  bar1.stop();

  if (matchingFiles.length === 0) {
    console.log("\nNo low resolution videos found\n");
  } else {
    console.log(`\nFound ${matchingFiles.length} low resolution videos\n`);
  }

  return matchingFiles;
};

export const findFilesWithString = async (dir, searchString) => {
  const files = await walk(dir);
  const filesWithString = [];
  const convertedFiles = files.map(async file => await convertFile(file));
  const fileList = await Promise.all(convertedFiles).then(file => file);

  for (const file of fileList) {
    const fuse = new Fuse([file.name], {
      includeScore: true,
      threshold: 0.3,
      findAllMatches: true,
      minMatchCharLength: 2
    });

    const results = fuse.search(searchString);

    if (results.length > 0 && results[0].score < fuse.options.threshold) {
      filesWithString.push(file);
    }
  }

  return filesWithString;
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

export function sanitizeFileName(fileName) {
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

export const createFilterJsonFile = async (targetPath, fileName, filterResults) => {
  const targetFile = `${targetPath}${path.sep}${fileName}.json`;
  try {
    const jsonData = JSON.stringify(filterResults);
    await fs.writeFile(targetFile, jsonData, "utf8");
    console.log(`.json file written successfully in: ${targetFile}`);
  } catch (error) {
    console.log(`Error! Unable to write file: \n${error}`);
  }
};

export const writeFilterToCSV = async (targetPath, fileName, filterResults) => {
  const targetFile = `${targetPath}${path.sep}${fileName}.csv`;
  try {
    const fileData = filterResults.map(async (file) => {
      return {
        ["id"]: file.id,
        ["path"]: file.path,
        ["name"]: file.name,
        ["width"]: file.width,
        ["height"]: file.height,
        ["resolution"]: file.resolution,
        ["orientation"]: file.orientation,
        ["seconds"]: file.seconds,
        ["size"]: file.size,
        ["tags"]: file.tags
      };
    });

    const csvData = await Promise.all(fileData)
      .then((data) => {
        return data;
      }).catch((error) => {
        console.log("error: ", error);
      });

    const csvHeaders = constants.csvHeaders;

    const csv = Papa.unparse(csvData, csvHeaders);
    await fs.writeFile(targetFile, csv, "utf8");
    console.log(`.csv file written successfully in: ${targetFile}`);
  } catch (error) {
    console.log(`Error! Unable to write file: \n${error}`);
  }
};

export const writeSearchToCSV = async (targetPath, fileName, searchResults) => {
  const targetFile = `${targetPath}${path.sep}${fileName}.csv`;
  try {
    const fileData = searchResults.map(async (file, index) => {
      return {
        ["#"]: index + 1,
        ["name"]: file.name,
        ["path"]: file.path,
        ["created"]: file.date.raw,
        ["size"]: file.size.calculated,
        ["bytes"]: file.size.bytes,
        ["type"]: file.type
      };
    });

    const csvData = await Promise.all(fileData)
      .then((data) => {
        return data;
      }).catch((error) => {
        console.log("error: ", error);
      });

    const csvHeaders = constants.csvHeaders;

    const csv = Papa.unparse(csvData, csvHeaders);
    await fs.writeFile(targetFile, csv, "utf8");
  } catch (error) {
    console.log(`Error! Unable to write file: \n${error}`);
  }
};

export const writeToCSV = async (fileName, duplicateQueue) => {
  try {
    const fileData = duplicateQueue.map(async (duplicate, index) => {
      let file1 = await duplicate.fileMatches[0];
      let file2 = await duplicate.fileMatches[1];
      if (duplicate.fileMatches.length === 2) {
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
      } else if (duplicate.fileMatches.length === 3) {
        let file3 = await duplicate.fileMatches[2];
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
          ["(2) type"]: file2.type,
          ["--"]: "-",
          ["(3) name"]: file3.name,
          ["(3) path"]: file3.path,
          ["(3) created"]: file3.date.raw,
          ["(3) size"]: file3.size.calculated,
          ["(3) bytes"]: file3.size.bytes,
          ["(3) type"]: file3.type
        };
      } else if (duplicate.fileMatches.length === 4) {
        let file3 = await duplicate.fileMatches[2];
        let file4 = await duplicate.fileMatches[3];
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
          ["(2) type"]: file2.type,
          ["--"]: "-",
          ["(3) name"]: file3.name,
          ["(3) path"]: file3.path,
          ["(3) created"]: file3.date.raw,
          ["(3) size"]: file3.size.calculated,
          ["(3) bytes"]: file3.size.bytes,
          ["(3) type"]: file3.type,
          ["---"]: "-",
          ["(4) name"]: file4.name,
          ["(4) path"]: file4.path,
          ["(4) created"]: file4.date.raw,
          ["(4) size"]: file4.size.calculated,
          ["(4) bytes"]: file4.size.bytes,
          ["(4) type"]: file4.type
        };
      } else {
        return;
      }
    });

    const csvData = await Promise.all(fileData)
      .then((data) => {
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