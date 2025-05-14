export interface FileInfo {
  full: string;
  name: string;
  base: string;
  path: string;
  extension: string | null;
  date: { raw: Date; formatted?: string };
  size: { bytes: number; calculated?: string };
  type?: string;
}

export interface Duplicate {
  fileMatches: FileInfo[];
}

export interface ActionResult {
  file1: string;
  file2: string;
  decision: string;
  success: boolean;
  error?: string;
}

export interface Summary {
  total: number;
  success: number;
  failed: number;
  actions: ActionResult[];
}

export interface Directory {
  path: string;
  name: string;
  files: FileInfo[];
  fileCount: number;
  size: {
    bytes: number;
    calculated: string;
  };
}

export interface Constants {
  primaryDirectory: Directory;
  secondaryDirectory: Directory;
  [key: string]: Directory | unknown;
}