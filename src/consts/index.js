const SHOWS = ['the office (us)', 'westworld', 'Westworld', 'How I Met Your Mother', 'how i met you mother', 'the office us', 'two and a half men', 'Two and a Half Men'];
const SEPARATORS = ['.', ' '];
const POSTFIXES = ['WEB-DL.DD5.1.H264-dummy', 'WEB DL DD5 1 H264-dummy', 'WEB-DL DD5.1.H264-dummy'];
const VIDEO_EXTS = [
  '.3gp',
  '.mkv',
  '.flv',
  '.webm',
  '.mp4',
  '.m4v',
  '.mov',
  '.avi',
  '.asf',
  '.avchd',
  '.divx',
  '.dvr-ms',
  '.img',
  '.iso',
  '.media',
  '.ts',
  '.m2ts',
  '.mts',
  '.mpg',
  '.mpeg',
  '.mxf',
  '.ogm',
  '.ogv',
  '.strm',
  '.wm',
  '.wmv',
  '.vwtv',
  '.rm',
  '.rmvb',
];
const SUB_EXTS = ['.srt', '.ass', '.ssa', '.smi', '.sub', '.sup', '.ttml', '.sbv', '.dfxp', '.vtt', '.txt'];
// x: 1x1 abbr: s01e01 full: Season 1 Episode 1
const CASES = ['x', 'abbr', 'full'];
module.exports = {
  SHOWS,
  SEPARATORS,
  POSTFIXES,
  VIDEO_EXTS,
  SUB_EXTS,
  CASES,
};
