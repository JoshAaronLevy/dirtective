#!/usr/bin/env node
import { Command } from "commander";
const program = new Command();
import prompts from "../lib/prompts.mjs";

program
  .description("Example: dirtective \"./\"")
  .version("1.0.0", "-v, --version")
  .action(async (message, command) => {
    if (message.branch === true || message.b === true) {
      command = message;
      await prompts(command);
      return;
    } else if (!command || command === undefined) {
      command = message;
      await prompts(command);
      return;
    } else {
      await prompts(command);
      return;
    }
  });

program.parse(process.argv);