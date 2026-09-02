const path = require('node:path');
const { executeRenamePlan, listDirectories, listFiles, removeDirectoryIfEmpty, walkDirectories } = require('../utils/index.js');
const { getSubtitleTargetName, isSubtitle } = require('./common.js');

const buildSeriesSubsPlan = async directory => {
  const root = path.resolve(directory || process.cwd());
  const directories = await walkDirectories(root);
  const subsFolders = directories.filter(folder => path.basename(folder).toLowerCase() === 'subs');
  const plan = [];
  const warnings = [];
  const cleanupCandidates = [];

  for (const subsFolder of subsFolders) {
    const episodeFolders = await listDirectories(subsFolder);
    const looseFiles = await listFiles(subsFolder);
    for (const file of looseFiles) warnings.push(`Kept file outside an episode folder: ${file}`);
    for (const episodeFolder of episodeFolders) {
      cleanupCandidates.push(episodeFolder);
      const episodeName = path.basename(episodeFolder);
      for (const file of await listFiles(episodeFolder)) {
        if (!isSubtitle(file)) {
          warnings.push(`Kept unsupported file: ${file}`);
          continue;
        }
        plan.push({
          source: file,
          target: path.join(path.dirname(subsFolder), getSubtitleTargetName(file, episodeName)),
          kind: 'subtitle',
        });
      }
    }
    cleanupCandidates.push(subsFolder);
  }

  return { root, plan, warnings, cleanupCandidates };
};

const moveSeriesSubs = async (props = {}) => {
  const { directory = process.cwd(), dryRun = false } = props;
  const result = await buildSeriesSubsPlan(directory);
  result.changes = await executeRenamePlan(result.plan, { dryRun });
  if (!dryRun) {
    const episodeFolders = result.cleanupCandidates.filter(folder => path.basename(folder).toLowerCase() !== 'subs');
    const subsFolders = result.cleanupCandidates.filter(folder => path.basename(folder).toLowerCase() === 'subs');
    for (const folder of [...episodeFolders].reverse()) await removeDirectoryIfEmpty(folder);
    for (const folder of [...subsFolders].reverse()) await removeDirectoryIfEmpty(folder);
  }
  result.dryRun = dryRun;
  return result;
};

module.exports = { buildSeriesSubsPlan, moveSeriesSubs };
