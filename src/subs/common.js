const path = require('node:path');
const { SUB_EXTS, VIDEO_EXTS } = require('../consts/index.js');

const subtitleExtensions = new Set(SUB_EXTS.map(ext => ext.toLowerCase()));
const videoExtensions = new Set(VIDEO_EXTS.map(ext => ext.toLowerCase()));

const LANGUAGE_NAMES = new Map([
  ['chinese', '中文字幕'], ['chi', '中文字幕'], ['chs', '中文字幕'], ['cht', '中文字幕'],
  ['zh', '中文字幕'], ['zh-cn', '中文字幕'], ['zh-tw', '中文字幕'], ['zh-hk', '中文字幕'],
  ['zh-sg', '中文字幕'], ['zh-mo', '中文字幕'],
  ['english', 'English'], ['eng', 'English'], ['en', 'English'],
  ['french', 'French'], ['fre', 'French'], ['fra', 'French'], ['fr', 'French'],
]);

const isSubtitle = file => subtitleExtensions.has(path.extname(file).toLowerCase());
const isVideo = file => videoExtensions.has(path.extname(file).toLowerCase());
const cleanSuffix = value => value.replace(/^[._ -]+|[._ -]+$/g, '').replace(/[._ -]+/g, '.');

const getSubtitleTargetName = (file, mediaName) => {
  const parsed = path.parse(file);
  const extension = parsed.ext.toLowerCase();
  const existingPrefix = `${mediaName}.`;
  if (parsed.name.toLowerCase() === mediaName.toLowerCase()) return `${mediaName}${extension}`;
  if (parsed.name.toLowerCase().startsWith(existingPrefix.toLowerCase())) {
    return `${mediaName}.${cleanSuffix(parsed.name.slice(existingPrefix.length))}${extension}`;
  }

  let stem = parsed.name;
  let number;
  const leadingNumber = /^(\d+)_+/.exec(stem);
  if (leadingNumber) {
    number = leadingNumber[1];
    stem = stem.slice(leadingNumber[0].length);
  }
  const trailingNumber = /(?:[._ -]?)(\d+)$/.exec(stem);
  if (trailingNumber) {
    number = number || trailingNumber[1];
    stem = stem.slice(0, trailingNumber.index);
  }

  const languageKey = cleanSuffix(stem).toLowerCase();
  const language = LANGUAGE_NAMES.get(languageKey) || cleanSuffix(stem);
  const suffix = [language || 'Subtitle', number].filter(Boolean).join('.');
  return `${mediaName}.${suffix}${extension}`;
};

module.exports = { getSubtitleTargetName, isSubtitle, isVideo };
