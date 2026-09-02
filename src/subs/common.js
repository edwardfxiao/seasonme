const path = require('node:path');
const { SUB_EXTS, VIDEO_EXTS } = require('../consts/index.js');

const subtitleExtensions = new Set(SUB_EXTS.map(ext => ext.toLowerCase()));
const videoExtensions = new Set(VIDEO_EXTS.map(ext => ext.toLowerCase()));

const LANGUAGE_CODES = new Map([
  ['chinese', 'zh'], ['chi', 'zh'], ['zho', 'zh'], ['chs', 'zh'], ['cht', 'zh'],
  ['zh', 'zh'], ['zh-cn', 'zh'], ['zh-tw', 'zh'], ['zh-hk', 'zh'],
  ['zh-sg', 'zh'], ['zh-mo', 'zh'], ['中文', 'zh'], ['中文字幕', 'zh'], ['简体', 'zh'], ['繁体', 'zh'],
  ['english', 'en'], ['eng', 'en'], ['en', 'en'],
  ['french', 'fr'], ['fre', 'fr'], ['fra', 'fr'], ['fr', 'fr'],
  ['german', 'de'], ['ger', 'de'], ['deu', 'de'], ['de', 'de'],
  ['spanish', 'es'], ['spa', 'es'], ['es', 'es'],
  ['italian', 'it'], ['ita', 'it'], ['it', 'it'],
  ['japanese', 'ja'], ['jpn', 'ja'], ['ja', 'ja'],
  ['korean', 'ko'], ['kor', 'ko'], ['ko', 'ko'],
  ['portuguese', 'pt'], ['por', 'pt'], ['pt', 'pt'], ['pt-br', 'pt-br'],
  ['russian', 'ru'], ['rus', 'ru'], ['ru', 'ru'],
]);
const LEGACY_LANGUAGE_NAMES = new Map([
  ['zh', '中文字幕'], ['en', 'English'], ['fr', 'French'], ['de', 'German'],
  ['es', 'Spanish'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'],
  ['pt', 'Portuguese'], ['pt-br', 'Portuguese-BR'], ['ru', 'Russian'],
]);

const isSubtitle = file => subtitleExtensions.has(path.extname(file).toLowerCase());
const isVideo = file => videoExtensions.has(path.extname(file).toLowerCase());
const cleanSuffix = value => value.replace(/^[._ -]+|[._ -]+$/g, '').replace(/[._ -]+/g, '.');

const normalizeLanguageCode = value => LANGUAGE_CODES.get(cleanSuffix(value).replace(/\./g, '-').toLowerCase());

const getNumberedSubtitleSuffix = (value, options = {}) => {
  let stem = value;
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
  const languageCode = normalizeLanguageCode(stem);
  if (options.infuseFriendly) {
    const language = languageCode || cleanSuffix(stem).replace(/\./g, '-');
    return [language || 'subtitle', number].filter(Boolean).join('-');
  }
  const language = LEGACY_LANGUAGE_NAMES.get(languageCode) || cleanSuffix(stem);
  return [language || 'Subtitle', number].filter(Boolean).join('.');
};

const getSubtitleLanguageCode = value => {
  const normalized = value.replace(/[._ ]+/g, '-');
  const tokens = normalized.split('-').filter(Boolean);
  if (tokens.length) {
    const attachedNumber = /^(.+?)(\d+)$/.exec(tokens[tokens.length - 1]);
    if (attachedNumber) tokens[tokens.length - 1] = attachedNumber[1];
  }
  while (/^(?:\d+|forced|sdh|cc|default|hi)$/i.test(tokens[tokens.length - 1] || '')) tokens.pop();
  const last = tokens[tokens.length - 1] || '';
  const pair = tokens.length > 1 ? `${tokens[tokens.length - 2]}-${last}` : '';
  if (LANGUAGE_CODES.has(pair.toLowerCase())) return LANGUAGE_CODES.get(pair.toLowerCase());
  if (LANGUAGE_CODES.has(last.toLowerCase())) return LANGUAGE_CODES.get(last.toLowerCase());
  return undefined;
};

const getLegacyLanguageName = value => LEGACY_LANGUAGE_NAMES.get(getSubtitleLanguageCode(value));

const getSubtitleTargetName = (file, mediaName, options = {}) => {
  const parsed = path.parse(file);
  const extension = parsed.ext.toLowerCase();
  if (parsed.name.toLowerCase() === mediaName.toLowerCase()) return `${mediaName}${extension}`;
  const existingPrefix = new RegExp(`^${mediaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[._ -]+`, 'i');
  if (existingPrefix.test(parsed.name)) {
    const rawSuffix = parsed.name.replace(existingPrefix, '');
    if (!options.infuseFriendly) return `${mediaName}.${cleanSuffix(rawSuffix)}${extension}`;
    const suffix = getNumberedSubtitleSuffix(rawSuffix, options);
    return `${mediaName}-${suffix}${extension}`;
  }
  const suffix = getNumberedSubtitleSuffix(parsed.name, options);
  return `${mediaName}${options.infuseFriendly ? '-' : '.'}${suffix}${extension}`;
};

module.exports = { getLegacyLanguageName, getSubtitleLanguageCode, getSubtitleTargetName, isSubtitle, isVideo };
