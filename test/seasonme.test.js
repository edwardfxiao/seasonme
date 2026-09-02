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
  handleVideoRenaming,
} = require('../src/format/index.js');
const { moveMoviesSubs } = require('../src/subs/movies.js');
const { moveSeriesSubs } = require('../src/subs/series.js');

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
  assert.equal(getSequenceInfo('video.1920x1080'), undefined);
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
  await assert.rejects(format({ directory }), /Multiple videos represent the same episode/);
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
  await touch(path.join(episode, 'notes.nfo'));
  const result = await moveSeriesSubs({ directory });
  assert.equal(result.changes.length, 2);
  assert.equal(fs.existsSync(path.join(season, 'Twin.Peaks.S01E01.English.3.srt')), true);
  assert.equal(fs.existsSync(path.join(season, 'Twin.Peaks.S01E01.French.1.srt')), true);
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
