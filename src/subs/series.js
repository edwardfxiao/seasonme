const path = require('node:path');
const {
  executeRenamePlan,
  listDirectories,
  listFiles,
  removeDirectoryIfEmpty,
  removeDirectoryTree,
  walkDirectories,
} = require('../utils/index.js');
const { getSubtitleTargetName, isSubtitle } = require('./common.js');

const buildSeriesSubsPlan = async (directory, options = {}) => {
  const { forceRemoveSubs = false } = options;
  const root = path.resolve(directory || process.cwd());
  const directories = await walkDirectories(root);
  const subsFolders = directories.filter(folder => path.basename(folder).toLowerCase() === 'subs');
  const plan = [];
  const warnings = [];
  const cleanupCandidates = [];

  if (!subsFolders.length) {
    warnings.push(`No Subs folders found under: ${root}. Expected Subs/<episode>/<subtitle> inside a season folder.`);
  }

  for (const subsFolder of subsFolders) {
    const episodeFolders = await listDirectories(subsFolder);
    const looseFiles = await listFiles(subsFolder);
    for (const file of looseFiles) {
      warnings.push(forceRemoveSubs
        ? `Will delete file remaining in Subs folder: ${file}`
        : `Kept file outside an episode folder: ${file}`);
    }
    for (const episodeFolder of episodeFolders) {
      cleanupCandidates.push(episodeFolder);
      const episodeName = path.basename(episodeFolder);
      for (const file of await listFiles(episodeFolder)) {
        if (!isSubtitle(file)) {
          warnings.push(forceRemoveSubs ? `Will delete unsupported file: ${file}` : `Kept unsupported file: ${file}`);
          continue;
        }
        plan.push({
          source: file,
          target: path.join(path.dirname(subsFolder), getSubtitleTargetName(file, episodeName, options)),
          kind: 'subtitle',
        });
      }
    }
    cleanupCandidates.push(subsFolder);
  }

  return { root, subsFolders, plan, warnings, cleanupCandidates };
};

const moveSeriesSubs = async (props = {}) => {
  const {
    directory = process.cwd(),
    dryRun = false,
    infuseFriendly = false,
    forceRemoveSubs = false,
  } = props;
  const result = await buildSeriesSubsPlan(directory, { infuseFriendly, forceRemoveSubs });
  result.changes = await executeRenamePlan(result.plan, { dryRun });
  const subsFolders = result.cleanupCandidates.filter(folder => path.basename(folder).toLowerCase() === 'subs');
  result.directoryRemovals = forceRemoveSubs ? subsFolders : [];
  if (!dryRun && forceRemoveSubs) {
    for (const folder of subsFolders) await removeDirectoryTree(folder);
  } else if (!dryRun) {
    const episodeFolders = result.cleanupCandidates.filter(folder => path.basename(folder).toLowerCase() !== 'subs');
    for (const folder of [...episodeFolders].reverse()) await removeDirectoryIfEmpty(folder);
    for (const folder of [...subsFolders].reverse()) await removeDirectoryIfEmpty(folder);
  }
  result.dryRun = dryRun;
  return result;
};

module.exports = { buildSeriesSubsPlan, moveSeriesSubs };
