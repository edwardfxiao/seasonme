const path = require('node:path');
const {
  executeRenamePlan,
  listDirectories,
  listFiles,
  removeDirectoryIfEmpty,
  removeDirectoryTree,
} = require('../utils/index.js');
const { getSubtitleTargetName, isSubtitle, isVideo } = require('./common.js');

const buildMoviesSubsPlan = async (directory, options = {}) => {
  const { forceRemoveSubs = false } = options;
  const root = path.resolve(directory || process.cwd());
  const movieFolders = await listDirectories(root);
  const plan = [];
  const warnings = [];
  const cleanupCandidates = [];

  for (const movieFolder of movieFolders) {
    const children = await listDirectories(movieFolder);
    const subsFolder = children.find(folder => path.basename(folder).toLowerCase() === 'subs');
    if (!subsFolder) continue;
    cleanupCandidates.push(subsFolder);
    const videos = (await listFiles(movieFolder)).filter(isVideo);
    const folderName = path.basename(movieFolder).toLowerCase();
    const exactVideo = videos.find(video => path.parse(video).name.toLowerCase() === folderName);
    const video = exactVideo || (videos.length === 1 ? videos[0] : undefined);
    if (!video) {
      warnings.push(forceRemoveSubs
        ? `Will delete Subs folder even though the movie video is missing or ambiguous: ${movieFolder}`
        : `Kept subtitles because the movie video is missing or ambiguous: ${movieFolder}`);
      continue;
    }

    const movieName = path.parse(video).name;
    for (const file of await listFiles(subsFolder)) {
      if (!isSubtitle(file)) {
        warnings.push(forceRemoveSubs ? `Will delete unsupported file: ${file}` : `Kept unsupported file: ${file}`);
        continue;
      }
      plan.push({
        source: file,
        target: path.join(movieFolder, getSubtitleTargetName(file, movieName, options)),
        kind: 'subtitle',
      });
    }
  }

  return { root, plan, warnings, cleanupCandidates };
};

const moveMoviesSubs = async (props = {}) => {
  const {
    directory = process.cwd(),
    dryRun = false,
    infuseFriendly = false,
    forceRemoveSubs = false,
  } = props;
  const result = await buildMoviesSubsPlan(directory, { infuseFriendly, forceRemoveSubs });
  result.changes = await executeRenamePlan(result.plan, { dryRun });
  result.directoryRemovals = forceRemoveSubs ? result.cleanupCandidates : [];
  if (!dryRun && forceRemoveSubs) {
    for (const folder of result.cleanupCandidates) await removeDirectoryTree(folder);
  } else if (!dryRun) {
    for (const folder of result.cleanupCandidates) await removeDirectoryIfEmpty(folder);
  }
  result.dryRun = dryRun;
  return result;
};

module.exports = { buildMoviesSubsPlan, moveMoviesSubs };
