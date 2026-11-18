const path = require('node:path');
const { CASES, SUB_EXTS, VIDEO_EXTS } = require('../consts/index.js');
const { getSubtitleLanguageSuffix } = require('../subs/common.js');
const { executeRenamePlan, walkFiles } = require('../utils/index.js');

const videoExtensions = new Set(VIDEO_EXTS.map(ext => ext.toLowerCase()));
const subtitleExtensions = new Set(SUB_EXTS.map(ext => ext.toLowerCase()));
const infuseEpisodePattern = /(?:^|[.\s_-])S\d{2}E\d{2,3}(?:-E\d{2,3})*(?=$|[.\s_-])/i;

const normalizeSeparators = (value, options = {}) =>
  value
    .trim()
    .replace(options.infuseFriendly ? /["\\:|<>*?]+/g : /$^/g, '.')
    .replace(/\s+/g, '.')
    .replace(/\.-\./g, '.')
    .replace(/\.{2,}/g, '.');

const formatVideoName = (value, options = {}) =>
  normalizeSeparators(value, options)
    .replace(/season[._-]*(\d{1,2})/gi, 'S$1')
    .replace(/episode[._-]*(\d{1,3})/gi, 'E$1')
    .replace(/\.&\.E/gi, 'E')
    .replace(/(\d{1,2})\.E(?=\d)/gi, '$1E')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');

const findXMatch = value => {
  const match = /(^|[.\s_+()[\]-])(\d{1,2}(?:[xX]\d{1,3})+)(?=$|[.\s_+()[\]-]|v\d+(?:$|[.\s_+()[\]-]))/i.exec(value);
  if (!match) return undefined;
  return { index: match.index + match[1].length, token: match[2] };
};

const findAbbrMatch = value => {
  const match = /(^|[.\s_+()[\]-])(S\d{1,2}(?:(?:[.\s_+()[\]-]*)E\d{1,3})+)(?=$|[.\s_+()[\]-]|v\d+(?:$|[.\s_+()[\]-]))/i.exec(value);
  if (!match) return undefined;
  return { index: match.index + match[1].length, token: match[2] };
};

const findFullMatch = value => {
  const match = /(^|[.\s_-])(Season[.\s_-]*\d{1,2}(?:(?:[.\s_-]*&?[.\s_-]*)Episode[.\s_-]*\d{1,3})+)(?=$|[.\s_-])/i.exec(value);
  if (!match) return undefined;
  return { index: match.index + match[1].length, token: match[2] };
};

const toSequenceInfo = (seasonNumber, episodeNumbers, matches, namingCase) => {
  const episodes = episodeNumbers.map(number => `E${String(Number(number)).padStart(2, '0')}`);
  return {
    season: `S${String(Number(seasonNumber)).padStart(2, '0')}`,
    episode: episodes.join(''),
    episodes,
    matches,
    case: namingCase,
  };
};

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

const isInfuseCompatibleEpisodeName = value =>
  infuseEpisodePattern.test(value) && !/["\\:|<>*?]/.test(value);

const canonicalizeEpisodeName = (value, options = {}) => {
  const { infuseFriendly = false } = options;
  const formatted = formatVideoName(value, options);
  const found = findAbbrMatch(formatted) || findXMatch(formatted);
  const sequenceInfo = getSequenceInfo(formatted);
  if (!found || !sequenceInfo) return undefined;
  const episode = infuseFriendly ? sequenceInfo.episodes.join('-') : sequenceInfo.episode;
  const sequence = `${sequenceInfo.season}${episode}`;
  const isBracketed = infuseFriendly
    && formatted[found.index - 1] === '['
    && formatted[found.index + found.token.length] === ']';
  const start = isBracketed ? found.index - 1 : found.index;
  const end = found.index + found.token.length + (isBracketed ? 1 : 0);
  let suffix = formatted.slice(end);
  if (infuseFriendly && /^v\d+/i.test(suffix)) suffix = `.${suffix}`;
  return {
    name: `${formatted.slice(0, start)}${sequence}${suffix}`
      .replace(/bluray/gi, 'BluRay')
      .replace(infuseFriendly ? /\{tmdb-(\d+)\}/gi : /$^/g, '{tmdb-$1}')
      .replace(infuseFriendly ? /\{imdb-(tt\d+)\}/gi : /$^/g, '{imdb-$1}')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.|\.$/g, ''),
    sequenceInfo,
  };
};

const sequenceKey = (directory, info) => `${path.resolve(directory)}\0${info.season}_${info.episode}`;

const getSubtitleSuffixAfterVideoName = (subtitleName, videoName) => {
  const normalizedSubtitle = subtitleName.toLowerCase();
  const normalizedVideo = videoName.toLowerCase();
  if (normalizedSubtitle === normalizedVideo) return '';
  if (!normalizedSubtitle.startsWith(normalizedVideo)) return undefined;
  const suffix = subtitleName.slice(videoName.length);
  return /^[.\s_&+\-([{【]/u.test(suffix.normalize('NFKC')) ? suffix : undefined;
};

const getFormatSubtitleSuffix = (subtitleName, videoName, options) => {
  const suffix = getSubtitleSuffixAfterVideoName(subtitleName, videoName) ?? subtitleName;
  return getSubtitleLanguageSuffix(suffix, options);
};

const buildFormatPlan = async (directory, options = {}) => {
  const root = path.resolve(directory || process.cwd());
  const files = await walkFiles(root);
  const plan = [];
  const warnings = [];
  const errors = [];
  const videosBySequence = new Map();

  for (const file of files) {
    const parsedPath = path.parse(file);
    if (!videoExtensions.has(parsedPath.ext.toLowerCase())) continue;
    const canonical = canonicalizeEpisodeName(parsedPath.name, options);
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

  for (const file of files) {
    const parsedPath = path.parse(file);
    if (!subtitleExtensions.has(parsedPath.ext.toLowerCase())) continue;
    const canonical = canonicalizeEpisodeName(parsedPath.name, options);
    if (!canonical) {
      warnings.push(`Skipped subtitle without season/episode information: ${file}`);
      continue;
    }
    const matches = videosBySequence.get(sequenceKey(parsedPath.dir, canonical.sequenceInfo)) || [];
    if (!matches.length) {
      warnings.push(`Kept subtitle because no matching video was found: ${file}`);
      continue;
    }
    let selectedVideo = matches[0];
    if (matches.length > 1) {
      const subtitleName = canonical.name.toLowerCase();
      const specificMatches = matches.filter(item => {
        const videoName = path.parse(item.target).name.toLowerCase();
        return getSubtitleSuffixAfterVideoName(subtitleName, videoName) !== undefined;
      });
      if (specificMatches.length === 1) selectedVideo = specificMatches[0];
      else {
        warnings.push(`Kept subtitle because multiple videos match the same episode: ${file}`);
        continue;
      }
    }
    if (!selectedVideo) {
      warnings.push(`Kept subtitle because no unambiguous video match was found: ${file}`);
      continue;
    }
    const videoName = path.parse(selectedVideo.target).name;
    const languageSuffix = getFormatSubtitleSuffix(canonical.name, videoName, options);
    const targetName = `${videoName}${languageSuffix}${parsedPath.ext.toLowerCase()}`;
    plan.push({ source: file, target: path.join(parsedPath.dir, targetName), kind: 'subtitle', sequenceInfo: canonical.sequenceInfo });
  }

  return { root, plan, warnings, errors };
};

const format = async (props = {}) => {
  const { directory = process.cwd(), dryRun = false, infuseFriendly = false } = props;
  const result = await buildFormatPlan(directory, { infuseFriendly });
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
    const canonical = canonicalizeEpisodeName(parsedPath.name, options);
    if (!canonical) continue;
    plan.push({ source: file, target: path.join(parsedPath.dir, `${canonical.name}${parsedPath.ext.toLowerCase()}`) });
  }
  if (options.execute) await executeRenamePlan(plan, { dryRun: options.dryRun });
  return plan.map(item => item.target);
};

const getVideoNamingHash = async (files, options = {}) => {
  const result = {};
  for (const file of files) {
    const parsedPath = path.parse(file);
    if (!videoExtensions.has(parsedPath.ext.toLowerCase())) continue;
    const canonical = canonicalizeEpisodeName(parsedPath.name, options);
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
    const canonical = canonicalizeEpisodeName(parsedPath.name, options);
    if (!canonical) continue;
    const key = `${canonical.sequenceInfo.season}_${canonical.sequenceInfo.episode}`;
    const videoName = fileNamesHash[key];
    if (!videoName) continue;
    const languageSuffix = getFormatSubtitleSuffix(canonical.name, videoName, options);
    plan.push({
      source: file,
      target: path.join(parsedPath.dir, `${videoName}${languageSuffix}${parsedPath.ext.toLowerCase()}`),
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
  isInfuseCompatibleEpisodeName,
};
