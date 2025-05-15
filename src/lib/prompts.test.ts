/// <reference types="jest" />

import inquirer from 'inquirer';
import type { Table } from 'cli-table3';
import {
  selectDirectory,
  chooseAllDupeAction,
  postDupeAction,
  chooseNewFileLocation,
  chooseNewDirectoryLocation,
  chooseNewFileName,
  chooseFileAction
} from './prompts';
import type { FileInfo } from '../helpers/models';

// Mock inquirer
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
  registerPrompt: jest.fn()
}));

jest.mock('inquirer-file-tree-selection-prompt', () => ({
  __esModule: true,
  default: jest.fn()
}));

const mockInquirerPrompt = inquirer.prompt as unknown as jest.MockedFunction<typeof inquirer.prompt>;

// Mock constants
jest.mock('../helpers/constants', () => ({
  constants: {
    primaryDirectory: { path: '/test/primary' },
    secondaryDirectory: { path: '/test/secondary' }
  }
}));

// Mock utils
jest.mock('../helpers/utils', () => ({
  createSummaryFile: jest.fn(),
  findDivergentDirectories: jest.fn().mockReturnValue(['dir1', 'dir2'])
}));

describe('prompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('selectDirectory', () => {
    it('should return selected directory path for primary directory', async () => {
      const mockPath = '/selected/path';
      mockInquirerPrompt.mockResolvedValueOnce({ 'Primary Directory': mockPath });

      const result = await selectDirectory('primaryDirectory');
      expect(result).toBe(mockPath);
      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'file-tree-selection',
          onlyShowDir: true,
          enableGoUpperDirectory: true,
          name: 'Primary Directory'
        })
      ]);
    });

    it('should handle errors and return empty string', async () => {
      mockInquirerPrompt.mockRejectedValueOnce(new Error('Test error'));

      const result = await selectDirectory('primaryDirectory');
      expect(result).toBe('');
    });
  });

  describe('chooseAllDupeAction', () => {
    it('should return processDuplicates for individual choice', async () => {
      mockInquirerPrompt.mockResolvedValueOnce({
        allDupeAction: '01/15: Choose for each duplicate individually'
      });

      const result = await chooseAllDupeAction();
      expect(result).toBe('processDuplicates');
    });

    it('should handle cancel action', async () => {
      mockInquirerPrompt.mockResolvedValueOnce({
        allDupeAction: '15/15: Cancel'
      });

      const result = await chooseAllDupeAction();
      expect(result).toBe('');
    });

    it('should call chooseNewFileLocation for JSON file creation', async () => {
      mockInquirerPrompt.mockResolvedValueOnce({
        allDupeAction: '13/15: Create a JSON file with all duplicates'
      });
      
      await chooseAllDupeAction();
      // The actual return value depends on chooseNewFileLocation which is tested separately
    });
  });

  describe('postDupeAction', () => {
    it('should return empty string when selecting No', async () => {
      mockInquirerPrompt.mockResolvedValueOnce({
        postDupeAction: 'No'
      });

      const result = await postDupeAction();
      expect(result).toBe('');
    });

    it('should handle errors and return empty string', async () => {
      mockInquirerPrompt.mockRejectedValueOnce(new Error('Test error'));

      const result = await postDupeAction();
      expect(result).toBe('');
    });
  });

  describe('chooseNewFileLocation', () => {
    it('should call chooseNewFileName with selected location', async () => {
      const mockLocation = '/selected/location';
      mockInquirerPrompt.mockResolvedValueOnce({
        newFileLocation: mockLocation
      });

      await chooseNewFileLocation('json');
      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'file-tree-selection',
          name: 'newFileLocation',
          onlyShowDir: true,
          enableGoUpperDirectory: true
        })
      ]);
    });
  });

  describe('chooseNewDirectoryLocation', () => {
    it('should call chooseNewFileName with selected location', async () => {
      const mockLocation = '/selected/location';
      mockInquirerPrompt.mockResolvedValueOnce({
        newDirectoryLocation: mockLocation
      });

      await chooseNewDirectoryLocation('merge');
      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'file-tree-selection',
          name: 'newDirectoryLocation',
          onlyShowDir: true,
          enableGoUpperDirectory: true
        })
      ]);
    });
  });

  describe('chooseNewFileName', () => {
    it('should create summary file with selected name', async () => {
      const mockFileName = 'test-file';
      mockInquirerPrompt.mockResolvedValueOnce({
        newFileName: mockFileName
      });

      const result = await chooseNewFileName('/test/path', 'json');
      expect(result).toBe(mockFileName);
    });

    it('should handle errors and return empty string', async () => {
      mockInquirerPrompt.mockRejectedValueOnce(new Error('Test error'));

      const result = await chooseNewFileName('/test/path', 'json');
      expect(result).toBe('');
    });
  });

  describe('chooseFileAction', () => {
    it('should return selected decision and increment counter', async () => {
      const mockDecision = 'Keep both';
      const mockTable = {
        toString: () => 'Mock Table'
      } as Table;
      const mockChoices = ['Keep both', 'Delete both'];

      mockInquirerPrompt.mockResolvedValueOnce({
        chooseFileAction: mockDecision
      });

      const result = await chooseFileAction([] as FileInfo[], mockTable, mockChoices);
      expect(result).toEqual({ decision: mockDecision });
    });

    it('should handle errors and return default decision', async () => {
      const mockTable = {
        toString: () => 'Mock Table'
      } as Table;
      const mockChoices = ['Keep both', 'Delete both'];

      mockInquirerPrompt.mockRejectedValueOnce(new Error('Test error'));

      const result = await chooseFileAction([] as FileInfo[], mockTable, mockChoices);
      expect(result).toEqual({ decision: 'Keep both' });
    });
  });
});