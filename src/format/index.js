const path = require('node:path');
const { CASES, SUB_EXTS, VIDEO_EXTS } = require('../consts/index.js');
const { executeRenamePlan, walkFiles } = require('../utils/index.js');

const videoExtensions = new Set(VIDEO_EXTS.map(ext => ext.toLowerCase()));
const subtitleExtensions = new Set(SUB_EXTS.map(ext => ext.toLowerCase()));

const normalizeSeparators = value =>
  value
    .trim()
    .replace(/\s+/g, '.')
    .replace(/\.-\./g, '.')
    .replace(/\.{2,}/g, '.');

const formatVideoName = value =>
  normalizeSeparators(value)
    .replace(/season[._-]*(\d{1,2})/gi, 'S$1')
    .replace(/episode[._-]*(\d{1,3})/gi, 'E$1')
    .replace(/\.&\.E/gi, 'E')
    .replace(/(\d{1,2})\.E(?=\d)/gi, '$1E')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');

const findXMatch = value => {
  const match = /(^|[.\s_-])(\d{1,2}(?:[xX]\d{1,3})+)(?=$|[.\s_-])/.exec(value);
  if (!match) return undefined;
  return { index: match.index + match[1].length, token: match[2] };
};

const findAbbrMatch = value => {
  const match = /(^|[.\s_-])(S\d{1,2}(?:(?:[.\s_-]*)E\d{1,3})+)(?=$|[.\s_-])/i.exec(value);
  if (!match) return undefined;
  return { index: match.index + match[1].length, token: match[2] };
};

const findFullMatch = value => {
  const match = /(^|[.\s_-])(Season[.\s_-]*\d{1,2}(?:(?:[.\s_-]*&?[.\s_-]*)Episode[.\s_-]*\d{1,3})+)(?=$|[.\s_-])/i.exec(value);
  if (!match) return undefined;
  return { index: match.index + match[1].length, token: match[2] };
};

const toSequenceInfo = (seasonNumber, episodeNumbers, matches, namingCase) => ({
  season: `S${String(Number(seasonNumber)).padStart(2, '0')}`,
  episode: episodeNumbers.map(number => `E${String(Number(number)).padStart(2, '0')}`).join(''),
  matches,
  case: namingCase,
});

const getCaseXInfoObj = value => {
  const found = findXMatch(value);
  if (!found) return undefined;
  const numbers = found.token.toLowerCase().split('x');
  return toSequenceInfo(numbers[0], numbers.slice(1), numbers, CASES[0]);
};

const getCaseAbbrInfoObj = value => {
  const found = findAbbrMatch(value);
  if (!found) return undefined;
  const season = /^S(\d{1,2})/i.exec(found.token)[1];
  const episodes = [...found.token.matchAll(/E(\d{1,3})/gi)].map(match => match[1]);
  return toSequenceInfo(season, episodes, [`S${season}`, ...episodes.map(number => `E${number}`)], CASES[1]);
};

const getCaseFullInfoObj = value => {
  const found = findFullMatch(value);
  if (!found) return undefined;
  const season = /Season[.\s_-]*(\d{1,2})/i.exec(found.token)[1];
  const episodes = [...found.token.matchAll(/Episode[.\s_-]*(\d{1,3})/gi)].map(match => match[1]);
  return toSequenceInfo(season, episodes, [found.token], CASES[2]);
};

const findNamingCase = value => {
  if (findXMatch(value)) return CASES[0];
  if (findFullMatch(value)) return CASES[2];
  if (findAbbrMatch(value)) return CASES[1];
  return undefined;
};

const getSequenceInfo = value => {
  switch (findNamingCase(value)) {
    case CASES[0]:
      return getCaseXInfoObj(value);
    case CASES[1]:
      return getCaseAbbrInfoObj(value);
    case CASES[2]:
      return getCaseFullInfoObj(value);
    default:
      return undefined;
  }
};

const canonicalizeEpisodeName = value => {
  const formatted = formatVideoName(value);
  const found = findAbbrMatch(formatted) || findXMatch(formatted);
  const sequenceInfo = getSequenceInfo(formatted);
  if (!found || !sequenceInfo) return undefined;
  const sequence = `${sequenceInfo.season}${sequenceInfo.episode}`;
  return {
    name: `${formatted.slice(0, found.index)}${sequence}${formatted.slice(found.index + found.token.length)}`
      .replace(/bluray/gi, 'BluRay')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.|\.$/g, ''),
    sequenceInfo,
  };
};

const sequenceKey = (directory, info) => `${path.resolve(directory)}\0${info.season}_${info.episode}`;

const buildFormatPlan = async directory => {
  const root = path.resolve(directory || process.cwd());
  const files = await walkFiles(root);
  const plan = [];
  const warnings = [];
  const errors = [];
  const videosBySequence = new Map();

  for (const file of files) {
    const parsedPath = path.parse(file);
    if (!videoExtensions.has(parsedPath.ext.toLowerCase())) continue;
    const canonical = canonicalizeEpisodeName(parsedPath.name);
    if (!canonical) {
      warnings.push(`Skipped video without season/episode information: ${file}`);
      continue;
    }
    const target = path.join(parsedPath.dir, `${canonical.name}${parsedPath.ext.toLowerCase()}`);
    const item = { source: file, target, kind: 'video', sequenceInfo: canonical.sequenceInfo };
    plan.push(item);
    const key = sequenceKey(parsedPath.dir, canonical.sequenceInfo);
    const entries = videosBySequence.get(key) || [];
    entries.push(item);
    videosBySequence.set(key, entries);
  }

  for (const [key, entries] of videosBySequence) {
    if (entries.length > 1) errors.push(`Multiple videos represent the same episode (${key.split('\0')[1]}): ${entries.map(item => item.source).join(', ')}`);
  }

  for (const file of files) {
    const parsedPath = path.parse(file);
    if (!subtitleExtensions.has(parsedPath.ext.toLowerCase())) continue;
    const canonical = canonicalizeEpisodeName(parsedPath.name);
    if (!canonical) {
      warnings.push(`Skipped subtitle without season/episode information: ${file}`);
      continue;
    }
    const matches = videosBySequence.get(sequenceKey(parsedPath.dir, canonical.sequenceInfo)) || [];
    if (!matches.length) {
      warnings.push(`Kept subtitle because no matching video was found: ${file}`);
      continue;
    }
    if (matches.length > 1) {
      errors.push(`Cannot choose a video for subtitle: ${file}`);
      continue;
    }
    const videoName = path.parse(matches[0].target).name;
    const isChinese = /中文|简体|(?:^|[._ -])chs(?:$|[._ -])/i.test(parsedPath.name);
    const targetName = `${videoName}${isChinese ? '.中文字幕' : ''}${parsedPath.ext.toLowerCase()}`;
    plan.push({ source: file, target: path.join(parsedPath.dir, targetName), kind: 'subtitle', sequenceInfo: canonical.sequenceInfo });
  }

  return { root, plan, warnings, errors };
};

const format = async (props = {}) => {
  const { directory = process.cwd(), dryRun = false } = props;
  const result = await buildFormatPlan(directory);
  if (result.errors.length) throw new Error(`Formatting plan has errors:\n- ${result.errors.join('\n- ')}`);
  result.changes = await executeRenamePlan(result.plan, { dryRun });
  result.dryRun = dryRun;
  return result;
};

// Backward-compatible helpers. They are pure by default; callers that want to
// modify files can pass { execute: true }.
const handleVideoRenaming = async (files, options = {}) => {
  const plan = [];
  for (const file of files) {
    const parsedPath = path.parse(file);
    if (!videoExtensions.has(parsedPath.ext.toLowerCase())) continue;
    const canonical = canonicalizeEpisodeName(parsedPath.name);
    if (!canonical) continue;
    plan.push({ source: file, target: path.join(parsedPath.dir, `${canonical.name}${parsedPath.ext.toLowerCase()}`) });
  }
  if (options.execute) await executeRenamePlan(plan, { dryRun: options.dryRun });
  return plan.map(item => item.target);
};

const getVideoNamingHash = async files => {
  const result = {};
  for (const file of files) {
    const parsedPath = path.parse(file);
    if (!videoExtensions.has(parsedPath.ext.toLowerCase())) continue;
    const canonical = canonicalizeEpisodeName(parsedPath.name);
    if (!canonical) continue;
    const key = `${canonical.sequenceInfo.season}_${canonical.sequenceInfo.episode}`;
    if (result[key] && result[key] !== canonical.name) throw new Error(`Multiple videos represent ${key}`);
    result[key] = canonical.name;
  }
  return result;
};

const handleSubRenaming = async (files, fileNamesHash, options = {}) => {
  const plan = [];
  for (const file of files) {
    const parsedPath = path.parse(file);
    if (!subtitleExtensions.has(parsedPath.ext.toLowerCase())) continue;
    const canonical = canonicalizeEpisodeName(parsedPath.name);
    if (!canonical) continue;
    const key = `${canonical.sequenceInfo.season}_${canonical.sequenceInfo.episode}`;
    const videoName = fileNamesHash[key];
    if (!videoName) continue;
    const isChinese = /中文|简体|(?:^|[._ -])chs(?:$|[._ -])/i.test(parsedPath.name);
    plan.push({
      source: file,
      target: path.join(parsedPath.dir, `${videoName}${isChinese ? '.中文字幕' : ''}${parsedPath.ext.toLowerCase()}`),
    });
  }
  if (options.execute) await executeRenamePlan(plan, { dryRun: options.dryRun });
  return plan.map(item => item.target);
};

module.exports = {
  buildFormatPlan,
  canonicalizeEpisodeName,
  findNamingCase,
  format,
  formatVideoName,
  getCaseAbbrInfoObj,
  getCaseFullInfoObj,
  getCaseXInfoObj,
  getSequenceInfo,
  getVideoNamingHash,
  handleSubRenaming,
  handleVideoRenaming,
};
