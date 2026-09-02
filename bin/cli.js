#!/usr/bin/env node
const { parseArgs } = require('node:util');
const packageJson = require('../package.json');
const { generateDummyFiles } = require('../src/dummy/index.js');
const { format } = require('../src/format/index.js');
const { moveSeriesSubs } = require('../src/subs/series.js');
const { moveMoviesSubs } = require('../src/subs/movies.js');
const { printResult } = require('../src/ui/index.js');

const HELP = `seasonme ${packageJson.version}

Usage:
  seasonme format [-d directory] [--dry-run] [--infuse-friendly]
  seasonme movesubs -t <series|movies> -d directory [--dry-run] [--infuse-friendly] [-f]
  seasonme generate -n number [-d directory] [--force]

Commands:
  format      Standardize TV video and subtitle names
  movesubs    Move subtitles out of Subs folders
  generate    Generate sample files without deleting existing content

Global options:
  -h, --help          Show help
  -v, --version       Show version
  --infuse-friendly   Use Infuse/Plex ranges and language-code suffixes
  -f, --force-remove-subs
                      Delete Subs folders and all remaining contents (movesubs)

Safety:
  Renames are validated before any file is changed. Use --dry-run to inspect
  planned format/movesubs operations. Existing targets are never overwritten.
`;

const commonOptions = {
  directory: { type: 'string', short: 'd' },
  'dry-run': { type: 'boolean', default: false },
  'infuse-friendly': { type: 'boolean', default: false },
  infusefriendly: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
};

const parse = (args, options) => parseArgs({ args, options, allowPositionals: false, strict: true }).values;

const main = async (argv = process.argv.slice(2)) => {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    console.log(packageJson.version);
    return;
  }

  const [command, ...args] = argv;
  if (command === 'format') {
    const values = parse(args, commonOptions);
    const infuseFriendly = values['infuse-friendly'] || values.infusefriendly;
    printResult(await format({ directory: values.directory, dryRun: values['dry-run'], infuseFriendly }), { command: 'format' });
    return;
  }
  if (command === 'movesubs') {
    const values = parse(args, {
      ...commonOptions,
      type: { type: 'string', short: 't' },
      'force-remove-subs': { type: 'boolean', short: 'f', default: false },
    });
    if (!values.directory) throw new TypeError('movesubs requires --directory');
    if (!['series', 'movies'].includes(values.type)) throw new TypeError('movesubs --type must be series or movies');
    const handler = values.type === 'series' ? moveSeriesSubs : moveMoviesSubs;
    const infuseFriendly = values['infuse-friendly'] || values.infusefriendly;
    printResult(await handler({
      directory: values.directory,
      dryRun: values['dry-run'],
      infuseFriendly,
      forceRemoveSubs: values['force-remove-subs'],
    }));
    return;
  }
  if (command === 'generate') {
    const values = parse(args, {
      directory: { type: 'string', short: 'd' },
      number: { type: 'string', short: 'n' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    });
    if (values.number === undefined) throw new TypeError('generate requires --number');
    const result = await generateDummyFiles({ directory: values.directory, number: values.number, force: values.force });
    console.log(`Generated ${result.videos.length} video and ${result.subs.length} subtitle files in ${result.directory}.`);
    return;
  }
  throw new TypeError(`Unknown command: ${command}`);
};

if (require.main === module) {
  main().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { HELP, main };
