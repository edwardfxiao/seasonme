const fs = require('node:fs');
const path = require('node:path');
const { SHOWS, SEPARATORS, POSTFIXES } = require('../consts/index.js');

const fsPromises = fs.promises;
const MAX_DUMMY_FILES = 10000;

const generateSeason = num => `S${num}`;
const generateSeasonWithPad = num => `S${String(num).padStart(2, '0')}`;
const generateSeasonFull = num => `Season ${num}`;
const generateSeasonFullWithPad = num => `Season ${String(num).padStart(2, '0')}`;
const generateSeasonNumber = num => String(num);
const generateSeasonNumberWithPad = num => String(num).padStart(2, '0');
const generateEpisode = num => `E${num}`;
const generateEpisodeWithPad = num => `E${String(num).padStart(2, '0')}`;
const generateEpisodeFull = num => ` Episode ${num}`;
const generateEpisodeFullWithPad = num => ` Episode ${String(num).padStart(2, '0')}`;
const generateEpisodeNumber = num => `x${num}`;
const generateEpisodeNumberWithPad = num => `x${String(num).padStart(2, '0')}`;

const SEASONS = [
  [generateSeason, generateSeasonWithPad],
  [generateSeasonNumber, generateSeasonNumberWithPad],
  [generateSeasonFull, generateSeasonFullWithPad],
];
const EPISODES = [
  [generateEpisode, generateEpisodeWithPad],
  [generateEpisodeNumber, generateEpisodeNumberWithPad],
  [generateEpisodeFull, generateEpisodeFullWithPad],
];
const SPLITS = [value => value.replace(/ /g, '.'), value => value];

const getRandomInt = max => Math.floor(Math.random() * max);

const validateNumber = number => {
  const parsed = Number(number);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_DUMMY_FILES) {
    throw new TypeError(`number must be an integer between 1 and ${MAX_DUMMY_FILES}`);
  }
  return parsed;
};

const generateDummyNames = async number => {
  const count = validateNumber(number);
  const result = { videos: [], subs: [] };
  const usedVideos = new Set();
  const usedSubs = new Set();
  let attempts = 0;

  while (result.videos.length < count) {
    attempts += 1;
    if (attempts > count * 100) throw new Error('Could not generate enough unique dummy names');
    const show = SPLITS[getRandomInt(SPLITS.length)](SHOWS[getRandomInt(SHOWS.length)]);
    const sequenceStyle = getRandomInt(SEASONS.length);
    const seasonNumber = getRandomInt(100);
    const episodeNumber = getRandomInt(100);
    const video = `${show}${SEPARATORS[getRandomInt(SEPARATORS.length)]}${SEASONS[sequenceStyle][getRandomInt(2)](seasonNumber)}${EPISODES[sequenceStyle][getRandomInt(2)](episodeNumber)}${SEPARATORS[getRandomInt(SEPARATORS.length)]}${POSTFIXES[getRandomInt(POSTFIXES.length)]}.mkv`;
    const subtitle = `${show}${SEPARATORS[getRandomInt(SEPARATORS.length)]}${SEASONS[sequenceStyle][getRandomInt(2)](seasonNumber)}${EPISODES[sequenceStyle][getRandomInt(2)](episodeNumber)}${SEPARATORS[getRandomInt(SEPARATORS.length)]}${POSTFIXES[getRandomInt(POSTFIXES.length)]}.srt`;
    if (usedVideos.has(video) || usedSubs.has(subtitle)) continue;
    usedVideos.add(video);
    usedSubs.add(subtitle);
    result.videos.push(video);
    result.subs.push(subtitle);
  }
  return result;
};

const saveFiles = async (directory, videos, subs) => {
  const targets = [...videos, ...subs].map(name => path.join(directory, name));
  const duplicates = targets.filter((target, index) => targets.indexOf(target) !== index);
  if (duplicates.length) throw new Error(`Generated names collide: ${[...new Set(duplicates)].join(', ')}`);
  const existing = [];
  for (const target of targets) {
    try {
      await fsPromises.access(target);
      existing.push(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (existing.length) throw new Error(`Refusing to overwrite existing files: ${existing.join(', ')}`);

  const created = [];
  try {
    for (const target of targets) {
      await fsPromises.writeFile(target, '', { flag: 'wx' });
      created.push(target);
    }
  } catch (error) {
    for (const target of created.reverse()) {
      try {
        await fsPromises.unlink(target);
      } catch (rollbackError) {
        error.message += `\nCould not remove partially generated file ${target}: ${rollbackError.message}`;
      }
    }
    throw error;
  }
};

const generateDummyFiles = async (props = {}) => {
  const { directory = process.cwd(), number, force = false } = props;
  const count = validateNumber(number);
  const targetDirectory = path.resolve(directory);
  await fsPromises.mkdir(targetDirectory, { recursive: true });
  const existing = await fsPromises.readdir(targetDirectory);
  if (existing.length && !force) {
    throw new Error(`Refusing to generate files in a non-empty directory: ${targetDirectory}. Use --force to add files without deleting existing content.`);
  }
  const { videos, subs } = await generateDummyNames(count);
  await saveFiles(targetDirectory, videos, subs);
  return { directory: targetDirectory, videos, subs };
};

module.exports = { MAX_DUMMY_FILES, generateDummyNames, generateDummyFiles, saveFiles, validateNumber };
