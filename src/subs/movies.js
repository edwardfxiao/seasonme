const path = require('node:path');
const { executeRenamePlan, listDirectories, listFiles, removeDirectoryIfEmpty } = require('../utils/index.js');
const { getSubtitleTargetName, isSubtitle, isVideo } = require('./common.js');

const buildMoviesSubsPlan = async (directory, options = {}) => {
  const root = path.resolve(directory || process.cwd());
  const movieFolders = await listDirectories(root);
  const plan = [];
  const warnings = [];
  const cleanupCandidates = [];

  for (const movieFolder of movieFolders) {
    const children = await listDirectories(movieFolder);
    const subsFolder = children.find(folder => path.basename(folder).toLowerCase() === 'subs');
    if (!subsFolder) continue;
    const videos = (await listFiles(movieFolder)).filter(isVideo);
    const folderName = path.basename(movieFolder).toLowerCase();
    const exactVideo = videos.find(video => path.parse(video).name.toLowerCase() === folderName);
    const video = exactVideo || (videos.length === 1 ? videos[0] : undefined);
    if (!video) {
      warnings.push(`Kept subtitles because the movie video is missing or ambiguous: ${movieFolder}`);
      continue;
    }

    const movieName = path.parse(video).name;
    for (const file of await listFiles(subsFolder)) {
      if (!isSubtitle(file)) {
        warnings.push(`Kept unsupported file: ${file}`);
        continue;
      }
      plan.push({
        source: file,
        target: path.join(movieFolder, getSubtitleTargetName(file, movieName, options)),
        kind: 'subtitle',
      });
    }
    cleanupCandidates.push(subsFolder);
  }

  return { root, plan, warnings, cleanupCandidates };
};

const moveMoviesSubs = async (props = {}) => {
  const { directory = process.cwd(), dryRun = false, infuseFriendly = false } = props;
  const result = await buildMoviesSubsPlan(directory, { infuseFriendly });
  result.changes = await executeRenamePlan(result.plan, { dryRun });
  if (!dryRun) {
    for (const folder of result.cleanupCandidates) await removeDirectoryIfEmpty(folder);
  }
  result.dryRun = dryRun;
  return result;
};

module.exports = { buildMoviesSubsPlan, moveMoviesSubs };
