const SHOWS = ['the office (us)', 'westworld', 'Westworld', 'How I Met Your Mother', 'how i met you mother', 'the office us', 'two and a half men', 'Two and a Half Men'];
const SEPARATORS = ['.', ' '];
const POSTFIXES = ['WEB-DL.DD5.1.H264-dummy', 'WEB DL DD5 1 H264-dummy', 'WEB-DL DD5.1.H264-dummy'];
const VIDEO_EXTS = ['.mkv', '.flv', '.webm', '.mp4', '.mov', '.avi', '.avchd', '.rm', '.rmvb'];
const SUB_EXTS = ['.srt', '.ass', '.ttml', '.sbv', '.dfxp', '.vtt', '.txt'];
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
