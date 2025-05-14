import { Command } from 'commander';
import main from '../lib/main';
const program = new Command();
program
    .description('Example: dirtective "./"')
    .version('1.0.0', '-v, --version')
    .action(async (message, command) => {
    try {
        const opts = (typeof message === 'string' ? command : message) || {};
        const effectiveCommand = opts;
        if (opts.branch === true || opts.b === true || !command) {
            await main(effectiveCommand);
        }
        else {
            await main(command);
        }
    }
    catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
program.parse(process.argv);
