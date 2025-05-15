#!/usr/bin/env node
/* eslint-disable */
import { Command } from "commander";
import { main } from "../lib/main";

interface CommandOptions {
  branch?: boolean;
  b?: boolean;
  version?: boolean;
}

const program = new Command();

program
  .description("Example: dirtective")
  .version("2.0.0", "-v, --version")
  .action(async (message: string | CommandOptions, command?: CommandOptions) => {
    try {
      const opts: CommandOptions = (typeof message === "string" ? command : message) || {};
      const effectiveCommand: CommandOptions = opts;

      if (opts.branch === true || opts.b === true || !command) {
        await main(effectiveCommand);
      } else {
        await main(command);
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse(process.argv);