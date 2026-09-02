const path = require('node:path');

const COLORS = {
  green: '\u001b[38;2;84;199;84m',
  yellow: '\u001b[38;2;230;180;60m',
  cyan: '\u001b[38;2;86;182;194m',
  red: '\u001b[38;2;220;90;90m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  reset: '\u001b[0m',
};

const paint = (text, tone, color) => (color ? `${COLORS[tone] || ''}${text}${COLORS.reset}` : text);

const renderBox = (title, detail, options = {}) => {
  const { tone = 'green', color = false } = options;
  const lines = [title, detail].filter(Boolean);
  const width = Math.max(...lines.map(line => [...line].length));
  const border = `─`.repeat(width + 4);
  const output = [
    `╭${border}╮`,
    `│${' '.repeat(width + 4)}│`,
    ...lines.map(line => `│  ${line}${' '.repeat(width - [...line].length)}  │`),
    `│${' '.repeat(width + 4)}│`,
    `╰${border}╯`,
  ].join('\n');
  return paint(output, tone, color);
};

const displayPath = (file, root) => {
  if (!root) return file;
  const relative = path.relative(root, file);
  return relative && !relative.startsWith('..') ? relative : file;
};

const renderOperation = (item, result, color) => {
  const source = displayPath(item.source, result.root);
  const target = displayPath(item.target, result.root);
  const marker = result.dryRun ? '◆' : '✓';
  const verb = result.dryRun ? 'Would rename' : 'Renamed';
  return `${paint(`${marker} ${verb}`, 'green', color)}  ${source}\n  ${paint('→', 'cyan', color)} ${target}`;
};

const renderDirectoryRemoval = (directory, result, color) => {
  const target = displayPath(directory, result.root);
  const marker = result.dryRun ? '◆' : '✓';
  const verb = result.dryRun ? 'Would delete folder and remaining contents' : 'Deleted folder and remaining contents';
  return paint(`${marker} ${verb}  ${target}`, 'red', color);
};

const renderResult = (result, options = {}) => {
  const { command, color = false } = options;
  const changes = result.changes || [];
  const directoryRemovals = result.directoryRemovals || [];
  const warnings = result.warnings || [];
  const sections = [];

  if (changes.length) sections.push(changes.map(item => renderOperation(item, result, color)).join('\n\n'));
  if (directoryRemovals.length) {
    sections.push(directoryRemovals.map(directory => renderDirectoryRemoval(directory, result, color)).join('\n'));
  }
  if (warnings.length) {
    sections.push(warnings.map(warning => paint(`⚠ ${warning}`, 'yellow', color)).join('\n'));
  }

  if (command === 'format') {
    if (warnings.length) {
      sections.push(renderBox(
        '⚠ Format Completed with Warnings',
        `${changes.length} file operation(s) completed; ${warnings.length} warning(s).`,
        { tone: 'yellow', color },
      ));
    } else if (result.dryRun) {
      sections.push(renderBox(
        '◆ Format Dry Run Completed Successfully!',
        `${changes.length} safe file operation(s) planned. No files were changed.`,
        { tone: 'cyan', color },
      ));
    } else {
      sections.push(renderBox(
        '✓ Formatted Successfully!',
        changes.length ? `${changes.length} file operation(s) completed safely.` : 'Everything is already formatted. No changes were needed.',
        { tone: 'green', color },
      ));
    }
  } else {
    const operationCount = changes.length + directoryRemovals.length;
    sections.push(`${result.dryRun ? 'Planned' : 'Completed'} ${operationCount} file operation(s).`);
  }

  return `${sections.join('\n\n')}\n`;
};

const printResult = (result, options = {}) => {
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  process.stdout.write(renderResult(result, { ...options, color }));
};

module.exports = { printResult, renderBox, renderResult };
