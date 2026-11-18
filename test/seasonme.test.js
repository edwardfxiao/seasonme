const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { generateDummyFiles } = require('../src/dummy/index.js');
const {
  canonicalizeEpisodeName,
  format,
  getSequenceInfo,
  handleSubRenaming,
  handleVideoRenaming,
  isInfuseCompatibleEpisodeName,
} = require('../src/format/index.js');
const { moveMoviesSubs } = require('../src/subs/movies.js');
const { moveSeriesSubs } = require('../src/subs/series.js');
const { getSubtitleLanguageCode } = require('../src/subs/common.js');
const { renderResult } = require('../src/ui/index.js');
const { HELP } = require('../bin/cli.js');

const fsPromises = fs.promises;

const makeTempDirectory = async t => {
  const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'seasonme-test-'));
  t.after(() => fsPromises.rm(directory, { recursive: true, force: true }));
  return directory;
};

const touch = async file => {
  await fsPromises.mkdir(path.dirname(file), { recursive: true });
  await fsPromises.writeFile(file, 'fixture', { flag: 'wx' });
};

test('normalizes all documented episode naming styles', async () => {
  const inputs = [
    'Two.and.a.Half.Men.Season 7 Episode 4.WEB DL.mkv',
    'Two and a Half Men Season 07 Episode 04 WEB DL.mkv',
    'Two and a Half Men S7 E4 WEB DL.mkv',
    'Two and a Half Men S07E04 WEB DL.mkv',
    'Two and a Half Men 7x4 WEB DL.mkv',
    'Two and a Half Men 7X04 WEB DL.mkv',
  ];
  const result = await handleVideoRenaming(inputs);
  assert.deepEqual(result, inputs.map(() => 'Two.and.a.Half.Men.S07E04.WEB.DL.mkv'));
});

test('normalizes multiple episodes and rejects resolution-shaped text', () => {
  assert.equal(
    canonicalizeEpisodeName('Show Season 7 Episode 4 & Episode 5 WEB DL').name,
    'Show.S07E04E05.WEB.DL',
  );
  assert.equal(canonicalizeEpisodeName('Show 7x4x5 WEB DL').name, 'Show.S07E04E05.WEB.DL');
  assert.equal(canonicalizeEpisodeName('Show.S04E05E06').name, 'Show.S04E05E06');
  assert.equal(getSequenceInfo('video.1920x1080'), undefined);
});

test('supports common Plex and Sonarr episode naming variants', () => {
  const cases = new Map([
    ['Band of Brothers (2001) - s01e01 - Currahee', 'Band.of.Brothers.(2001).S01E01.Currahee'],
    ["Grey's Anatomy (2005) - s00e01 - Special", "Grey's.Anatomy.(2005).S00E01.Special"],
    ['The Series Title (2010) - S01E01-E03 - Episode Title', 'The.Series.Title.(2010).S01E01E03.Episode.Title'],
    ['Show (2020) {TMDB-123456} - S01E01 [1080p]', 'Show.(2020).{TMDB-123456}.S01E01.[1080p]'],
    ['Anime Show [S03E01] v2', 'Anime.Show.[S03E01].v2'],
    ['Anime.Show.S03E01v2', 'Anime.Show.S03E01v2'],
    ['Show.Name.S03E01+E02', 'Show.Name.S03E01E02'],
  ]);
  for (const [input, expected] of cases) assert.equal(canonicalizeEpisodeName(input).name, expected);
});

test('produces Infuse-safe season and episode tokens', () => {
  const inputs = [
    'Bluey (2018) - S03E01 - Perfect',
    'Breaking Bad S00 E01 Special',
    'Anime Show [S03E01] v2',
    'Show S04E05E06',
    'Show (2020) {tmdb-123456} S01E01',
    'Show: Subtitle S01E01?',
  ];
  for (const input of inputs) {
    const result = canonicalizeEpisodeName(input, { infuseFriendly: true });
    assert.equal(isInfuseCompatibleEpisodeName(result.name), true, result.name);
  }
  assert.equal(isInfuseCompatibleEpisodeName('Anime.Show.[S03E01].v2'), false);
  assert.equal(isInfuseCompatibleEpisodeName('Anime.Show.S03E01v2'), false);
  assert.equal(
    canonicalizeEpisodeName('Show S04E05E06', { infuseFriendly: true }).name,
    'Show.S04E05-E06',
  );
});

test('safely skips date-based and absolute-number episode names', () => {
  assert.equal(canonicalizeEpisodeName('The Colbert Report (2005) - 2011-11-15 - Guest'), undefined);
  assert.equal(canonicalizeEpisodeName('[Group] Anime Show - 003 [1080p]'), undefined);
});

test('recognizes additional common video container extensions', async () => {
  const inputs = [
    'Show S1 E1.m4v',
    'Show S1 E1.TS',
    'Show S1 E1.m2ts',
    'Show S1 E1.mts',
    'Show S1 E1.mpeg',
    'Show S1 E1.strm',
    'Show S1 E1.iso',
    'Show S1 E1.mxf',
  ];
  const result = await handleVideoRenaming(inputs);
  assert.deepEqual(result, [
    'Show.S01E01.m4v',
    'Show.S01E01.ts',
    'Show.S01E01.m2ts',
    'Show.S01E01.mts',
    'Show.S01E01.mpeg',
    'Show.S01E01.strm',
    'Show.S01E01.iso',
    'Show.S01E01.mxf',
  ]);
});

test('formats split episode parts and matches each part subtitle', async t => {
  const directory = await makeTempDirectory(t);
  const files = [
    "Grey's Anatomy (2005) - s01e01 - pt1.avi",
    "Grey's Anatomy (2005) - s01e01 - pt2.avi",
    "Grey's Anatomy (2005) - s01e01 - pt1.srt",
    "Grey's Anatomy (2005) - s01e01 - pt2.srt",
  ];
  for (const file of files) await touch(path.join(directory, file));

  const result = await format({ directory });
  assert.equal(result.changes.length, 4);
  for (const part of ['pt1', 'pt2']) {
    assert.equal(fs.existsSync(path.join(directory, `Grey's.Anatomy.(2005).S01E01.${part}.avi`)), true);
    assert.equal(fs.existsSync(path.join(directory, `Grey's.Anatomy.(2005).S01E01.${part}.srt`)), true);
  }
});

test('keeps an ambiguous subtitle when split episode parts cannot be distinguished', async t => {
  const directory = await makeTempDirectory(t);
  const firstVideo = path.join(directory, 'Show S1 E1 Pt1.mkv');
  const secondVideo = path.join(directory, 'Show S1 E1 Pt2.mkv');
  const subtitle = path.join(directory, 'Show S1 E1.srt');
  await touch(firstVideo);
  await touch(secondVideo);
  await touch(subtitle);

  const result = await format({ directory });
  assert.equal(result.changes.length, 2);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /multiple videos match/);
  assert.equal(fs.existsSync(subtitle), true);
  assert.equal(fs.existsSync(path.join(directory, 'Show.S01E01.Pt1.mkv')), true);
  assert.equal(fs.existsSync(path.join(directory, 'Show.S01E01.Pt2.mkv')), true);
});

test('preserves a year that appears before the season and episode', () => {
  assert.equal(
    canonicalizeEpisodeName('Bluey (2018) - S03E01 - Perfect (1080p DSNP WEB-DL x265 Garshasp)').name,
    'Bluey.(2018).S03E01.Perfect.(1080p.DSNP.WEB-DL.x265.Garshasp)',
  );
  assert.equal(
    canonicalizeEpisodeName('Bluey.2018.S03E01').name,
    'Bluey.2018.S03E01',
  );
});

test('matches a short year-based subtitle to a long release video name', async t => {
  const directory = await makeTempDirectory(t);
  const video = path.join(directory, 'Bluey (2018) - S03E01 - Perfect (1080p DSNP WEB-DL x265 Garshasp).mkv');
  const subtitle = path.join(directory, 'Bluey.2018.S03E01.srt');
  await touch(video);
  await touch(subtitle);

  const result = await format({ directory });
  const expectedBase = 'Bluey.(2018).S03E01.Perfect.(1080p.DSNP.WEB-DL.x265.Garshasp)';
  assert.equal(result.changes.length, 2);
  assert.equal(await fsPromises.readFile(path.join(directory, `${expectedBase}.mkv`), 'utf8'), 'fixture');
  assert.equal(await fsPromises.readFile(path.join(directory, `${expectedBase}.srt`), 'utf8'), 'fixture');
});

test('formats a video and matching uppercase-extension subtitle', async t => {
  const directory = await makeTempDirectory(t);
  await touch(path.join(directory, 'Show S1 E1.MKV'));
  await touch(path.join(directory, 'Show 1x1.SRT'));
  const result = await format({ directory });
  assert.equal(result.changes.length, 2);
  assert.equal(await fsPromises.readFile(path.join(directory, 'Show.S01E01.mkv'), 'utf8'), 'fixture');
  assert.equal(await fsPromises.readFile(path.join(directory, 'Show.S01E01.srt'), 'utf8'), 'fixture');
});

test('uses Infuse language suffixes while keeping exact-name subtitles exact', async t => {
  const directory = await makeTempDirectory(t);
  await touch(path.join(directory, 'Bluey (2018) - S03E01 - Perfect.mkv'));
  await touch(path.join(directory, 'Bluey.2018.S03E01.zh-CN.srt'));
  await format({ directory, infuseFriendly: true });
  const expectedBase = 'Bluey.(2018).S03E01.Perfect';
  assert.equal(fs.existsSync(path.join(directory, `${expectedBase}.mkv`)), true);
  assert.equal(fs.existsSync(path.join(directory, `${expectedBase}-zh.srt`)), true);

  const exactDirectory = await makeTempDirectory(t);
  await touch(path.join(exactDirectory, 'This Is It S01E01.mkv'));
  await touch(path.join(exactDirectory, 'This Is It S01E01.srt'));
  await format({ directory: exactDirectory, infuseFriendly: true });
  assert.equal(fs.existsSync(path.join(exactDirectory, 'This.Is.It.S01E01.srt')), true);
});

test('keeps compact multi-episode and legacy subtitle style by default', async t => {
  const directory = await makeTempDirectory(t);
  await touch(path.join(directory, 'Adventure Show S04E05 E06.mkv'));
  await touch(path.join(directory, 'Adventure Show S04E05E06 chs.srt'));
  await format({ directory });
  assert.equal(fs.existsSync(path.join(directory, 'Adventure.Show.S04E05E06.mkv')), true);
  assert.equal(fs.existsSync(path.join(directory, 'Adventure.Show.S04E05E06.中文字幕.srt')), true);
});

test('keeps dot-separated language names by default', async t => {
  const directory = await makeTempDirectory(t);
  await touch(path.join(directory, 'Bluey (2018) - S03E01 - Perfect.mkv'));
  await touch(path.join(directory, 'Bluey.2018.S03E01.zh-CN.srt'));
  await format({ directory });
  assert.equal(
    fs.existsSync(path.join(directory, 'Bluey.(2018).S03E01.Perfect.中文字幕.srt')),
    true,
  );
});

test('recognizes Chinese in trailing bilingual language groups', async t => {
  const root = await makeTempDirectory(t);
  const videoName = 'Fleabag.S02E01.2160p.AMZN.WEB-DL.DDP5.1.HDR.HEVC-SHORTBREHD';
  const suffixes = [
    'chs', 'zh', 'chs.eng', 'chs&eng', 'zh&en', 'eng.chs',
    'en&zh', 'CHS&ENG', 'zh-CN.eng', '中', '中英', '英中',
    '简体中文', 'chs_eng', 'chs+eng', 'chs.eng.sdh',
  ];
  for (const [index, suffix] of suffixes.entries()) {
    const directory = path.join(root, String(index));
    await touch(path.join(directory, `${videoName}.mkv`));
    await touch(path.join(directory, `${videoName}.${suffix}.ass`));
    await format({ directory });
    assert.equal(await fsPromises.readFile(path.join(directory, `${videoName}.中文字幕.ass`), 'utf8'), 'fixture', suffix);
    assert.equal((await format({ directory })).changes.length, 0, suffix);
  }
});

test('language detection stays within the trailing language group', () => {
  const cases = new Map([
    ['Show.S01E01.zh-CN.2.forced', 'zh'],
    ['Show.S01E01.Portuguese-BR.3.sdh', 'pt-br'],
    ['Show.S01E01.English2', 'en'],
    ['Show.S01E01.English.3', 'en'],
    ['Show.S01E01.French', 'fr'],
    ['CHS.Show.S01E01.English.2', 'en'],
    ['中英.Show.S01E01.1080p', undefined],
    ['Show.S01E01.WEB-DL.x265', undefined],
    ['Show.S01E01.ReleaseCHS', undefined],
  ]);
  for (const [name, expected] of cases) assert.equal(getSubtitleLanguageCode(name), expected, name);
});

test('does not treat the matching video name as part of the subtitle language group', async t => {
  const directory = await makeTempDirectory(t);
  await touch(path.join(directory, 'Show.S01E01.CHS.mkv'));
  await touch(path.join(directory, 'Show.S01E01.CHS.English.2.srt'));
  await touch(path.join(directory, 'Show.S01E01.CHS.English.3.srt'));
  assert.equal((await format({ directory })).changes.length, 0);
});

test('recognizes the Chinese bilingual marker after a different episode release name', async t => {
  const directory = await makeTempDirectory(t);
  const videoName = 'Arrested.Development.S05E12.1080p.WEBRip.x265-RARBG';
  await touch(path.join(directory, `${videoName}.mp4`));
  await touch(path.join(directory, 'Arrested Development (2003) - S05E12 - Check Mates (1080p NF WEB-DL x265 Garshasp).中英.ass'));
  await format({ directory });
  assert.equal(await fsPromises.readFile(path.join(directory, `${videoName}.中文字幕.ass`), 'utf8'), 'fixture');
});

test('preserves numbered English tracks alongside a Chinese bilingual subtitle', async t => {
  const directory = await makeTempDirectory(t);
  const videoName = 'Arrested.Development.S05E01.1080p.WEBRip.x265-RARBG';
  const chineseName = 'Arrested Development (2003) - S05E01 - Family Leave (1080p NF WEB-DL x265 Garshasp).中英.ass';
  await touch(path.join(directory, `${videoName}.mp4`));
  for (const suffix of ['English', 'English.2', 'English.3']) {
    await fsPromises.writeFile(path.join(directory, `${videoName}.${suffix}.srt`), suffix);
  }
  await fsPromises.writeFile(path.join(directory, chineseName), 'Chinese and English');

  const dryRun = await format({ directory, dryRun: true });
  assert.equal(dryRun.changes.length, 1);
  assert.equal(dryRun.changes[0].target, path.join(directory, `${videoName}.中文字幕.ass`));
  assert.equal(fs.existsSync(path.join(directory, chineseName)), true);
  const result = await format({ directory });
  assert.equal(result.changes.length, 1);
  for (const suffix of ['English', 'English.2', 'English.3']) {
    assert.equal(await fsPromises.readFile(path.join(directory, `${videoName}.${suffix}.srt`), 'utf8'), suffix);
  }
  assert.equal(await fsPromises.readFile(path.join(directory, `${videoName}.中文字幕.ass`), 'utf8'), 'Chinese and English');
  assert.equal((await format({ directory })).changes.length, 0);
});

test('retains subtitle track numbers when normalizing different release names in either mode', async t => {
  for (const infuseFriendly of [false, true]) {
    const directory = await makeTempDirectory(t);
    await touch(path.join(directory, 'Show S1 E1.mkv'));
    const cases = [
      ['ReleaseA.S01E01.English2.srt', infuseFriendly ? '-en-2.srt' : '.English.2.srt'],
      ['ReleaseB.1x1.en.3.srt', infuseFriendly ? '-en-3.srt' : '.English.3.srt'],
      ['ReleaseC.S01E01.chs&eng.04.ass', infuseFriendly ? '-zh-04.ass' : '.中文字幕.04.ass'],
      ['ReleaseD.S01E01.English.5.forced.srt', infuseFriendly ? '-en-5.srt' : '.English.5.srt'],
      ['ReleaseE.S01E01.Portuguese-BR.6.srt', infuseFriendly ? '-pt-br-6.srt' : '.Portuguese-BR.6.srt'],
    ];
    for (const [source] of cases) await fsPromises.writeFile(path.join(directory, source), source);
    await format({ directory, infuseFriendly });
    for (const [source, suffix] of cases) {
      assert.equal(await fsPromises.readFile(path.join(directory, `Show.S01E01${suffix}`), 'utf8'), source);
    }
    assert.equal((await format({ directory, infuseFriendly })).changes.length, 0);
  }
});

test('legacy subtitle helper uses the same language and numbering rules', async () => {
  const files = [
    'Release.S05E01.chs.eng.ass',
    'Release.S05E01.English.2.srt',
    'Release.S05E01.English.3.srt',
    'Show.S05E01.English.srt',
  ];
  const names = { S05_E01: 'Show.S05E01.English' };
  assert.deepEqual(await handleSubRenaming(files, names), [
    'Show.S05E01.English.中文字幕.ass',
    'Show.S05E01.English.English.2.srt',
    'Show.S05E01.English.English.3.srt',
    'Show.S05E01.English.srt',
  ]);
  assert.deepEqual(await handleSubRenaming(files, names, { infuseFriendly: true }), [
    'Show.S05E01.English-zh.ass',
    'Show.S05E01.English-en-2.srt',
    'Show.S05E01.English-en-3.srt',
    'Show.S05E01.English.srt',
  ]);
});

test('still rejects subtitles whose language and track number truly collide', async t => {
  const directory = await makeTempDirectory(t);
  const files = ['Show S1 E1.mkv', 'ReleaseA.S01E01.English2.srt', 'ReleaseB.S01E01.en.2.srt'];
  for (const file of files) await touch(path.join(directory, file));
  await assert.rejects(format({ directory }), /Multiple files would use the same target/);
  for (const file of files) assert.equal(await fsPromises.readFile(path.join(directory, file), 'utf8'), 'fixture');
});

test('keeps a subtitle with no matching video', async t => {
  const directory = await makeTempDirectory(t);
  const subtitle = path.join(directory, 'Show.S01E01.srt');
  await touch(subtitle);
  const result = await format({ directory });
  assert.equal(result.changes.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.equal(await fsPromises.readFile(subtitle, 'utf8'), 'fixture');
  assert.equal(fs.existsSync(path.join(directory, 'undefined.srt')), false);
});

test('aborts before changing files when normalized targets collide', async t => {
  const directory = await makeTempDirectory(t);
  const first = path.join(directory, 'Show S1 E1.mkv');
  const second = path.join(directory, 'Show.S01E01.mkv');
  await touch(first);
  await touch(second);
  await assert.rejects(format({ directory }), /Multiple files would use the same target/);
  assert.equal(fs.existsSync(first), true);
  assert.equal(fs.existsSync(second), true);
});

test('skips unrelated videos instead of crashing', async t => {
  const directory = await makeTempDirectory(t);
  const video = path.join(directory, 'movie.mkv');
  await touch(video);
  const result = await format({ directory });
  assert.equal(result.changes.length, 0);
  assert.match(result.warnings[0], /Skipped video/);
  assert.equal(fs.existsSync(video), true);
});

test('dry-run reports changes without touching files', async t => {
  const directory = await makeTempDirectory(t);
  const video = path.join(directory, 'Show S1 E1.mkv');
  await touch(video);
  const result = await format({ directory, dryRun: true });
  assert.equal(result.changes.length, 1);
  assert.equal(fs.existsSync(video), true);
  assert.equal(fs.existsSync(path.join(directory, 'Show.S01E01.mkv')), false);
});

test('multiple subtitles for one episode abort without overwriting either file', async t => {
  const directory = await makeTempDirectory(t);
  const video = path.join(directory, 'Show.S01E01.mkv');
  const first = path.join(directory, 'ReleaseA.S01E01.srt');
  const second = path.join(directory, 'ReleaseB.1x1.srt');
  await touch(video);
  await touch(first);
  await touch(second);
  await assert.rejects(format({ directory }), /Multiple files would use the same target/);
  assert.equal(fs.existsSync(first), true);
  assert.equal(fs.existsSync(second), true);
});

test('paths containing apostrophes are handled without a shell', async t => {
  const root = await makeTempDirectory(t);
  const directory = path.join(root, "O'Brien");
  const source = path.join(directory, 'Show S1 E1.mkv');
  await touch(source);
  await format({ directory });
  assert.equal(fs.existsSync(path.join(directory, 'Show.S01E01.mkv')), true);
});

test('series subtitle mover supports README-style names and preserves unknown files', async t => {
  const directory = await makeTempDirectory(t);
  const season = path.join(directory, 'Twin.Peaks', 'Twin.Peaks.S01');
  const episode = path.join(season, 'Subs', 'Twin.Peaks.S01E01');
  await touch(path.join(episode, 'English3.srt'));
  await touch(path.join(episode, 'French1.srt'));
  await touch(path.join(episode, 'Twin.Peaks.S01E01.Chinese.2.ass'));
  await touch(path.join(episode, 'notes.nfo'));
  const result = await moveSeriesSubs({ directory });
  assert.equal(result.changes.length, 3);
  assert.equal(fs.existsSync(path.join(season, 'Twin.Peaks.S01E01.English.3.srt')), true);
  assert.equal(fs.existsSync(path.join(season, 'Twin.Peaks.S01E01.French.1.srt')), true);
  assert.equal(fs.existsSync(path.join(season, 'Twin.Peaks.S01E01.Chinese.2.ass')), true);
  assert.equal(fs.existsSync(path.join(episode, 'notes.nfo')), true);
  assert.equal(fs.existsSync(path.join(season, 'Subs')), true);
});

test('series subtitle mover removes only directories that became empty', async t => {
  const directory = await makeTempDirectory(t);
  const season = path.join(directory, 'Show', 'Show.S01');
  const episode = path.join(season, 'Subs', 'Show.S01E01');
  await touch(path.join(episode, 'English3.srt'));
  await moveSeriesSubs({ directory });
  assert.equal(fs.existsSync(path.join(season, 'Show.S01E01.English.3.srt')), true);
  assert.equal(fs.existsSync(path.join(season, 'Subs')), false);
});

test('force-remove-subs deletes a non-empty series Subs tree after moving subtitles', async t => {
  const directory = await makeTempDirectory(t);
  const season = path.join(directory, 'Show', 'Show.S01');
  const subs = path.join(season, 'Subs');
  const episode = path.join(subs, 'Show.S01E01');
  await touch(path.join(episode, 'English1.srt'));
  await touch(path.join(episode, 'notes.nfo'));
  await touch(path.join(subs, 'loose.txt'));

  const dryRun = await moveSeriesSubs({ directory, dryRun: true, forceRemoveSubs: true });
  assert.deepEqual(dryRun.directoryRemovals, [subs]);
  assert.equal(fs.existsSync(subs), true);

  const result = await moveSeriesSubs({ directory, forceRemoveSubs: true });
  assert.deepEqual(result.directoryRemovals, [subs]);
  assert.equal(fs.existsSync(path.join(season, 'Show.S01E01.English.1.srt')), true);
  assert.equal(fs.existsSync(subs), false);
});

test('subtitle mover uses language codes only in Infuse-friendly mode', async t => {
  const directory = await makeTempDirectory(t);
  const season = path.join(directory, 'Show', 'Show.S01');
  const episode = path.join(season, 'Subs', 'Show.S01E01');
  await touch(path.join(episode, 'English3.srt'));
  await moveSeriesSubs({ directory, infuseFriendly: true });
  assert.equal(fs.existsSync(path.join(season, 'Show.S01E01-en-3.srt')), true);
});

test('movie subtitle mover is awaited and removes only an empty Subs folder', async t => {
  const directory = await makeTempDirectory(t);
  const movie = path.join(directory, 'Toy.Story.1995');
  await touch(path.join(movie, 'Toy.Story.1995.mkv'));
  await touch(path.join(movie, 'Subs', 'English3.srt'));
  const result = await moveMoviesSubs({ directory });
  assert.equal(result.changes.length, 1);
  assert.equal(fs.existsSync(path.join(movie, 'Toy.Story.1995.English.3.srt')), true);
  assert.equal(fs.existsSync(path.join(movie, 'Subs')), false);
});

test('force-remove-subs deletes an ambiguous movie Subs folder without moving its files', async t => {
  const directory = await makeTempDirectory(t);
  const movie = path.join(directory, 'Ambiguous.Movie');
  const subs = path.join(movie, 'Subs');
  await touch(path.join(movie, 'cut-a.mkv'));
  await touch(path.join(movie, 'cut-b.mp4'));
  await touch(path.join(subs, 'English1.srt'));
  await touch(path.join(subs, 'poster.jpg'));

  const result = await moveMoviesSubs({ directory, forceRemoveSubs: true });
  assert.equal(result.changes.length, 0);
  assert.deepEqual(result.directoryRemovals, [subs]);
  assert.equal(fs.existsSync(subs), false);
});

test('dummy generator validates input and never clears existing content', async t => {
  const directory = await makeTempDirectory(t);
  const valuable = path.join(directory, 'valuable.txt');
  await touch(valuable);
  await assert.rejects(generateDummyFiles({ directory }), /number must be an integer/);
  await assert.rejects(generateDummyFiles({ directory, number: Infinity }), /number must be an integer/);
  await assert.rejects(generateDummyFiles({ directory, number: 2 }), /non-empty directory/);
  assert.equal(await fsPromises.readFile(valuable, 'utf8'), 'fixture');
  const result = await generateDummyFiles({ directory, number: 2, force: true });
  assert.equal(result.videos.length, 2);
  assert.equal(result.subs.length, 2);
  assert.equal(await fsPromises.readFile(valuable, 'utf8'), 'fixture');
});

test('package main entry exports the public API', () => {
  const seasonme = require('..');
  assert.equal(typeof seasonme.format, 'function');
  assert.equal(typeof seasonme.moveSeriesSubs, 'function');
  assert.equal(typeof seasonme.generateDummyFiles, 'function');
});

test('CLI documents the opt-in Infuse-friendly mode', () => {
  assert.match(HELP, /--infuse-friendly/);
  assert.match(HELP, /--force-remove-subs/);
  assert.match(HELP, /-f, --force-remove-subs/);
});

test('format success output is styled and reports success accurately', () => {
  const root = path.join(path.sep, 'fixtures');
  const output = renderResult({
    root,
    dryRun: false,
    warnings: [],
    changes: [{
      source: path.join(root, 'Show S1 E1.mkv'),
      target: path.join(root, 'Show.S01E01.mkv'),
    }],
  }, { command: 'format', color: false });
  assert.match(output, /╭─+╮/);
  assert.match(output, /✓ Formatted Successfully!/);
  assert.match(output, /Show S1 E1\.mkv/);
  assert.match(output, /Show\.S01E01\.mkv/);
});

test('format warning output does not claim full success', () => {
  const output = renderResult({
    root: path.sep,
    dryRun: false,
    warnings: ['Skipped an unrelated video'],
    changes: [],
  }, { command: 'format', color: false });
  assert.match(output, /Format Completed with Warnings/);
  assert.doesNotMatch(output, /Formatted Successfully/);
});

test('dry-run output makes forced Subs deletion explicit', () => {
  const root = path.join(path.sep, 'fixtures');
  const output = renderResult({
    root,
    dryRun: true,
    warnings: [],
    changes: [],
    directoryRemovals: [path.join(root, 'Show', 'Subs')],
  }, { color: false });
  assert.match(output, /Would delete folder and remaining contents/);
  assert.match(output, /Planned 1 file operation/);
});
