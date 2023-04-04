export const bytesToSize = (bytes) => {
  // Checking for invalid input
  if (isNaN(bytes) || bytes < 0) {
    return "Invalid input";
  }

  // Define conversion constants
  const kilobyte = 1024;
  const megabyte = kilobyte * 1024;

  // Convert bytes to KB or MB
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
  // Checking for invalid input
  if (isNaN(size) || size < 0 || !['KB', 'MB'].includes(unit.toUpperCase())) {
    return "Invalid input";
  }

  // Define conversion constants
  const kilobyte = 1024;
  const megabyte = kilobyte * 1024;

  // Convert KB or MB to bytes
  if (unit.toUpperCase() === 'KB') {
    return size * kilobyte;
  } else {
    return size * megabyte;
  }
};