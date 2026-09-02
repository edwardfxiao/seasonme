const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const fsPromises = fs.promises;

class PlanValidationError extends Error {
  constructor(issues) {
    super(`File operation plan is unsafe:\n- ${issues.join('\n- ')}`);
    this.name = 'PlanValidationError';
    this.issues = issues;
  }
}

const pathExists = async filePath => {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};

const getPathIdentity = async filePath => {
  try {
    const stat = await fsPromises.stat(filePath);
    return `${stat.dev}:${stat.ino}`;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
};

const walkFiles = async root => {
  const result = [];
  const visit = async directory => {
    const entries = await fsPromises.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile()) result.push(entryPath);
    }
  };
  await visit(path.resolve(root));
  return result.sort((a, b) => a.localeCompare(b));
};

const walkDirectories = async root => {
  const result = [];
  const visit = async directory => {
    const entries = await fsPromises.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
      const entryPath = path.join(directory, entry.name);
      result.push(entryPath);
      await visit(entryPath);
    }
  };
  await visit(path.resolve(root));
  return result.sort((a, b) => a.localeCompare(b));
};

const listFiles = async directory => {
  const entries = await fsPromises.readdir(directory, { withFileTypes: true });
  return entries
    .filter(entry => !entry.name.startsWith('.') && entry.isFile())
    .map(entry => path.join(directory, entry.name))
    .sort((a, b) => a.localeCompare(b));
};

const listDirectories = async directory => {
  const entries = await fsPromises.readdir(directory, { withFileTypes: true });
  return entries
    .filter(entry => !entry.name.startsWith('.') && entry.isDirectory())
    .map(entry => path.join(directory, entry.name))
    .sort((a, b) => a.localeCompare(b));
};

const canonicalCollisionKey = filePath => path.resolve(filePath).normalize('NFC').toLocaleLowerCase('en-US');

const validateRenamePlan = async plan => {
  const issues = [];
  const sourceKeys = new Map();
  const targetKeys = new Map();

  for (const item of plan) {
    const source = path.resolve(item.source);
    const target = path.resolve(item.target);
    const sourceKey = canonicalCollisionKey(source);
    const targetKey = canonicalCollisionKey(target);
    if (sourceKeys.has(sourceKey)) issues.push(`Source is listed more than once: ${source}`);
    else sourceKeys.set(sourceKey, source);
    if (targetKeys.has(targetKey) && canonicalCollisionKey(targetKeys.get(targetKey)) !== sourceKey) {
      issues.push(`Multiple files would use the same target: ${target}`);
    } else {
      targetKeys.set(targetKey, source);
    }
    if (!(await getPathIdentity(source))) issues.push(`Source does not exist: ${source}`);
  }

  for (const item of plan) {
    const source = path.resolve(item.source);
    const target = path.resolve(item.target);
    const sourceIdentity = await getPathIdentity(source);
    const targetIdentity = await getPathIdentity(target);
    if (targetIdentity && targetIdentity !== sourceIdentity && !sourceKeys.has(canonicalCollisionKey(target))) {
      issues.push(`Target already exists: ${target}`);
    }
  }

  if (issues.length) throw new PlanValidationError([...new Set(issues)]);
};

const executeRenamePlan = async (plan, options = {}) => {
  const { dryRun = false } = options;
  await validateRenamePlan(plan);
  const changes = plan.filter(item => path.resolve(item.source) !== path.resolve(item.target));
  if (dryRun || !changes.length) return changes;

  const staged = changes.map(item => ({
    ...item,
    source: path.resolve(item.source),
    target: path.resolve(item.target),
    temp: path.join(path.dirname(item.source), `.${path.basename(item.source)}.seasonme-${crypto.randomUUID()}.tmp`),
  }));
  const phaseOneComplete = [];
  const phaseTwoComplete = [];

  try {
    for (const item of staged) {
      await fsPromises.rename(item.source, item.temp);
      phaseOneComplete.push(item);
    }
    for (const item of staged) {
      if (await pathExists(item.target)) throw new Error(`Target appeared while renaming: ${item.target}`);
      await fsPromises.rename(item.temp, item.target);
      phaseTwoComplete.push(item);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const item of [...phaseTwoComplete].reverse()) {
      try {
        await fsPromises.rename(item.target, item.temp);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    for (const item of [...phaseOneComplete].reverse()) {
      try {
        if (await pathExists(item.temp)) await fsPromises.rename(item.temp, item.source);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    if (rollbackErrors.length) error.message += `\nRollback errors:\n- ${rollbackErrors.join('\n- ')}`;
    throw error;
  }
  return changes;
};

const removeDirectoryIfEmpty = async directory => {
  try {
    await fsPromises.rmdir(directory);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    if (error.code === 'ENOTEMPTY' || error.code === 'EEXIST') return false;
    throw error;
  }
};

const removeDirectoryTree = async directory => {
  try {
    await fsPromises.rm(directory, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
};

module.exports = {
  PlanValidationError,
  executeRenamePlan,
  listDirectories,
  listFiles,
  pathExists,
  removeDirectoryIfEmpty,
  removeDirectoryTree,
  validateRenamePlan,
  walkDirectories,
  walkFiles,
};
