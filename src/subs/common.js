const path = require('node:path');
const { SUB_EXTS, VIDEO_EXTS } = require('../consts/index.js');

const subtitleExtensions = new Set(SUB_EXTS.map(ext => ext.toLowerCase()));
const videoExtensions = new Set(VIDEO_EXTS.map(ext => ext.toLowerCase()));

const LANGUAGE_CODES = new Map([
  ['chinese', 'zh'], ['chi', 'zh'], ['zho', 'zh'], ['ch', 'zh'], ['chs', 'zh'], ['cht', 'zh'],
  ['zh', 'zh'], ['zh-cn', 'zh'], ['zh-tw', 'zh'], ['zh-hk', 'zh'],
  ['zh-sg', 'zh'], ['zh-mo', 'zh'], ['中文', 'zh'], ['中文字幕', 'zh'], ['简体', 'zh'], ['繁体', 'zh'],
  ['zh-hans', 'zh'], ['zh-hant', 'zh'], ['中', 'zh'], ['中英', 'zh'], ['英中', 'zh'],
  ['简中', 'zh'], ['繁中', 'zh'], ['简体中文', 'zh'], ['繁体中文', 'zh'], ['繁體中文', 'zh'],
  ['simplified-chinese', 'zh'], ['chinese-simplified', 'zh'],
  ['traditional-chinese', 'zh'], ['chinese-traditional', 'zh'],
  ['english', 'en'], ['eng', 'en'], ['en', 'en'], ['英文', 'en'], ['英语', 'en'], ['英語', 'en'],
  ['french', 'fr'], ['fre', 'fr'], ['fra', 'fr'], ['fr', 'fr'],
  ['german', 'de'], ['ger', 'de'], ['deu', 'de'], ['de', 'de'],
  ['dutch', 'nl'], ['dut', 'nl'], ['nld', 'nl'], ['nl', 'nl'],
  ['spanish', 'es'], ['spa', 'es'], ['es', 'es'],
  ['italian', 'it'], ['ita', 'it'], ['it', 'it'],
  ['japanese', 'ja'], ['jpn', 'ja'], ['ja', 'ja'], ['日文', 'ja'], ['日语', 'ja'], ['日語', 'ja'],
  ['korean', 'ko'], ['kor', 'ko'], ['ko', 'ko'], ['韩文', 'ko'], ['韓文', 'ko'], ['韩语', 'ko'], ['韓語', 'ko'],
  ['portuguese', 'pt'], ['por', 'pt'], ['pt', 'pt'], ['pt-br', 'pt-br'], ['portuguese-br', 'pt-br'],
  ['russian', 'ru'], ['rus', 'ru'], ['ru', 'ru'],
]);
const LEGACY_LANGUAGE_NAMES = new Map([
  ['zh', '中文字幕'], ['en', 'English'], ['fr', 'French'], ['de', 'German'], ['nl', 'Dutch'],
  ['es', 'Spanish'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'],
  ['pt', 'Portuguese'], ['pt-br', 'Portuguese-BR'], ['ru', 'Russian'],
]);

const isSubtitle = file => subtitleExtensions.has(path.extname(file).toLowerCase());
const isVideo = file => videoExtensions.has(path.extname(file).toLowerCase());
const cleanSuffix = value => value.replace(/^[._ -]+|[._ -]+$/g, '').replace(/[._ -]+/g, '.');

const normalizeLanguageCode = value => LANGUAGE_CODES.get(cleanSuffix(value).replace(/\./g, '-').toLowerCase());

const compactLanguageTokens = [...LANGUAGE_CODES.keys()]
  .filter(value => /^[a-z]+$/.test(value))
  .sort((a, b) => b.length - a.length)
  .join('|');
const compactLanguagePattern = new RegExp(`^(?:${compactLanguageTokens})+$`, 'i');
const traditionalMarkerPattern = /繁[体體中英]|^繁$|英繁|^[简簡]繁(?:英)?$|正[体體]|^cht$|(?:^|-)(?:hant|tw|hk|mo|traditional)(?:-|$)/i;

const getLanguageMarker = value => {
  const normalized = value.toLowerCase().replace(/字幕$/, '');
  const code = normalizeLanguageCode(normalized);
  const chineseTag = /^(?:zh|zho|chi)(?:-(?:hans|hant))?(?:-(?:cn|sg|tw|hk|mo))?$/.test(normalized);
  const chineseText = !normalized.includes('-') && (/中文|[简簡繁][体體]|正[体體]/.test(normalized)
    || /^(?:[简簡繁](?:中英|中|英)?|[简簡]繁(?:英)?|中(?:英文?|日|韩|韓)?|英(?:中|简|簡|繁))(?:双语|雙語|双字|雙字|字幕)*$/.test(normalized));
  if (code || chineseTag || chineseText) {
    const languageCode = chineseTag || chineseText ? 'zh' : code;
    const explicitSimplifiedScript = chineseTag && /(?:^|-)hans(?:-|$)/.test(normalized);
    return {
      languageCode,
      traditional: languageCode === 'zh' && !explicitSimplifiedScript && traditionalMarkerPattern.test(normalized),
    };
  }

  // Accept concatenated language markers (chseng), never arbitrary substrings
  // such as the "ch" in French, Dutch, Watch, or a release group name.
  if (!compactLanguagePattern.test(normalized)) return undefined;
  const markers = normalized.match(new RegExp(compactLanguageTokens, 'gi'));
  if (!markers.some(marker => LANGUAGE_CODES.get(marker) === 'zh')) return undefined;
  return { languageCode: 'zh', traditional: markers.includes('cht') };
};

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

const getSubtitleLanguageInfo = value => {
  const tokens = value.normalize('NFKC').split(/[.\s_&+\-()[\]{}【】,、|/:]+/u).filter(Boolean);
  let languageCode;
  let number;
  let traditional = false;

  // Read only the trailing language group, stopping at the release name.
  // Chinese takes precedence in bilingual groups such as chs.eng or zh&en.
  while (tokens.length) {
    const last = tokens[tokens.length - 1];
    if (/^(?:forced|sdh|cc|default|hi|字幕|双语|雙語|双字|雙字|双语字幕|雙語字幕|特效)$/i.test(last)) {
      tokens.pop();
      continue;
    }
    if (!languageCode && /^\d+$/.test(last)) {
      number = number || last;
      tokens.pop();
      continue;
    }
    const attachedNumber = /^(.+?)(\d+)$/.exec(last);
    const language = attachedNumber ? attachedNumber[1] : last;
    let marker;
    let tokenCount;
    for (let count = Math.min(3, tokens.length); count >= 1; count -= 1) {
      const candidate = [...tokens.slice(tokens.length - count, -1), language].join('-');
      marker = getLanguageMarker(candidate);
      if (marker) {
        tokenCount = count;
        break;
      }
    }
    if (!marker) {
      // Han annotations such as 校订版 or a secondary language must not hide
      // an earlier 中文/简体/繁体 marker. Unknown Latin release words stop us.
      if (/\p{Script=Han}/u.test(last)) {
        tokens.pop();
        continue;
      }
      break;
    }
    languageCode = marker.languageCode === 'zh' ? 'zh' : (languageCode || marker.languageCode);
    traditional = traditional || marker.traditional;
    if (attachedNumber) number = number || attachedNumber[2];
    tokens.splice(tokens.length - tokenCount);
  }
  return { languageCode, traditional, number: languageCode ? number : undefined };
};

const getSubtitleLanguageCode = value => getSubtitleLanguageInfo(value).languageCode;
const getSubtitleLanguageName = (info, options = {}) => {
  if (info.languageCode === 'zh' && info.traditional) {
    return options.infuseFriendly ? 'zh-Hant' : '中文字幕.繁体';
  }
  return options.infuseFriendly ? info.languageCode : LEGACY_LANGUAGE_NAMES.get(info.languageCode);
};
const getLegacyLanguageName = value => getSubtitleLanguageName(getSubtitleLanguageInfo(value));

const getSubtitleLanguageSuffix = (value, options = {}) => {
  const info = getSubtitleLanguageInfo(value);
  const language = getSubtitleLanguageName(info, options);
  const separator = options.infuseFriendly ? '-' : '.';
  return language ? `${separator}${[language, info.number].filter(Boolean).join(separator)}` : '';
};

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

module.exports = { getLegacyLanguageName, getSubtitleLanguageCode, getSubtitleLanguageSuffix, getSubtitleTargetName, isSubtitle, isVideo };
