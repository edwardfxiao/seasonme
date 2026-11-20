const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cli = path.resolve(__dirname, '../bin/cli.js');

const makeTemporary = async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'seasonme-movesubs-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  return temporary;
};

const makeLibrary = async t => {
  const temporary = await makeTemporary(t);
  const root = path.join(temporary, 'The.Big.Bang.Theory');
  const seasons = [];
  for (const version of ['REMUX[rartv]', 'x265-RARBG']) {
    for (const number of [1, 2]) {
      const name = `The.Big.Bang.Theory.S0${number}`;
      const directory = path.join(root, version, name);
      const subs = path.join(directory, 'Subs');
      const videoName = `${name}E01.${version}`;
      const episode = path.join(subs, videoName);
      await fs.mkdir(episode, { recursive: true });
      const video = path.join(directory, `${videoName}.mkv`);
      await fs.writeFile(video, videoName);
      const source = path.join(episode, 'English3.srt');
      await fs.writeFile(source, `${version}: season ${number}`);
      seasons.push({
        directory, subs, video, videoName, source,
        target: path.join(directory, `${videoName}.English.3.srt`),
        content: `${version}: season ${number}`,
      });
    }
  }
  return { temporary, root, seasons };
};

const runCli = (args, cwd, expectedStatus = 0) => {
  const result = spawnSync(process.execPath, [cli, 'movesubs', ...args], {
    cwd, encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, expectedStatus, result.stderr);
  if (expectedStatus === 0) assert.equal(result.stderr, '');
  return result;
};

const assertOriginals = async seasons => {
  for (const season of seasons) {
    assert.equal(await fs.readFile(season.source, 'utf8'), season.content);
    await assert.rejects(fs.access(season.target), { code: 'ENOENT' });
  }
};

for (const level of ['A', 'B', 'C']) {
  for (const entry of ['the current directory', '-d absolute-path', '-d .']) {
    test(`series movesubs at level ${level} using ${entry}`, async t => {
      const library = await makeLibrary(t);
      const directory = level === 'A' ? library.root
        : level === 'B' ? path.dirname(library.seasons[0].directory) : library.seasons[1].directory;
      const selected = library.seasons.filter(season => season.source.startsWith(`${directory}${path.sep}`));
      const args = ['-t', 'series'];
      if (entry === '-d absolute-path') args.push('-d', directory);
      if (entry === '-d .') args.push('-d', '.');
      const cwd = entry === '-d absolute-path' ? library.temporary : directory;
      const expectedRoot = entry === '-d absolute-path' ? directory : await fs.realpath(directory);

      const preview = runCli([...args, '--dry-run'], cwd);
      assert.ok(preview.stdout.includes(`Root: ${expectedRoot}`));
      assert.ok(preview.stdout.includes(`Subs folders found recursively (${selected.length}):`));
      assert.ok(preview.stdout.includes(`Planned ${selected.length} file operation(s).`));
      for (const season of selected) assert.ok(preview.stdout.includes(path.relative(directory, season.target)));
      await assertOriginals(library.seasons);

      const result = runCli(args, cwd);
      assert.ok(result.stdout.includes(`Completed ${selected.length} file operation(s).`));
      for (const season of selected) {
        assert.equal(await fs.readFile(season.target, 'utf8'), season.content);
        await assert.rejects(fs.access(season.subs), { code: 'ENOENT' });
      }
      await assertOriginals(library.seasons.filter(season => !selected.includes(season)));
      for (const season of library.seasons) assert.equal(await fs.readFile(season.video, 'utf8'), season.videoName);
      assert.match(runCli(args, cwd).stdout, /Completed 0 file operation\(s\)/);
    });
  }
}

for (const scope of ['myshow', 'myshow/season1']) {
  test(`series movesubs accepts an explicit ${scope} path without relying on folder names`, async t => {
    const temporary = await makeTemporary(t);
    const seasons = [];
    for (const number of [1, 2]) {
      const directory = path.join(temporary, 'myshow', `season${number}`);
      const episodeName = `My.Show.S0${number}E01`;
      const subs = path.join(directory, 'Subs');
      const episode = path.join(subs, episodeName);
      await fs.mkdir(episode, { recursive: true });
      const source = path.join(episode, 'English1.srt');
      const content = `season ${number} subtitles`;
      await fs.writeFile(source, content);
      await fs.writeFile(path.join(directory, `${episodeName}.mkv`), `video ${number}`);
      seasons.push({ source, target: path.join(directory, `${episodeName}.English.1.srt`), subs, content });
    }
    const directory = path.join(temporary, scope);
    const args = ['-t', 'series', '-d', directory];
    const selected = scope === 'myshow' ? seasons : seasons.slice(0, 1);
    const preview = runCli([...args, '--dry-run'], temporary).stdout;
    assert.ok(preview.includes(`Root: ${directory}`));
    assert.ok(preview.includes(`Subs folders found recursively (${selected.length}):`));
    await assertOriginals(seasons);

    const output = runCli(args, temporary).stdout;
    assert.ok(output.includes(`Completed ${selected.length} file operation(s).`));
    for (const season of selected) {
      assert.equal(await fs.readFile(season.target, 'utf8'), season.content);
      await assert.rejects(fs.access(season.subs), { code: 'ENOENT' });
    }
    await assertOriginals(seasons.filter(season => !selected.includes(season)));
    for (const number of [1, 2]) {
      assert.equal(await fs.readFile(path.join(temporary, 'myshow', `season${number}`, `My.Show.S0${number}E01.mkv`), 'utf8'), `video ${number}`);
    }
  });
}

test('series movesubs identifies the scan root when no Subs folders are found', async t => {
  const temporary = await makeTemporary(t);
  const directory = path.join(temporary, 'myshow', 'season1');
  await fs.mkdir(directory, { recursive: true });
  const video = path.join(directory, 'My.Show.S01E01.mkv');
  await fs.writeFile(video, 'video');
  const output = runCli(['-t', 'series', '-d', directory], temporary).stdout;
  assert.ok(output.includes(`Root: ${directory}`));
  assert.match(output, /Subs folders found recursively \(0\)/);
  assert.match(output, /No Subs folders found under:/);
  assert.match(output, /Expected Subs\/<episode>\/<subtitle>/);
  assert.equal(await fs.readFile(video, 'utf8'), 'video');
});

test('season-level movesubs preserves unsupported files unless forced', async t => {
  const library = await makeLibrary(t);
  const season = library.seasons[0];
  const note = path.join(path.dirname(season.source), 'notes.nfo');
  await fs.writeFile(note, 'keep me');

  const result = runCli(['-t', 'series'], season.directory);
  assert.match(result.stdout, /Kept unsupported file/);
  assert.equal(await fs.readFile(note, 'utf8'), 'keep me');
  assert.equal(await fs.readFile(season.target, 'utf8'), season.content);
  await assertOriginals(library.seasons.slice(1));
});

test('season-level forced cleanup previews and deletes only the selected season Subs', async t => {
  const library = await makeLibrary(t);
  const season = library.seasons[0];
  const note = path.join(season.subs, 'notes.nfo');
  await fs.writeFile(note, 'leftover');

  const preview = runCli(['-t', 'series', '-f', '--dry-run'], season.directory);
  assert.match(preview.stdout, /Would delete folder and remaining contents/);
  assert.equal(await fs.readFile(note, 'utf8'), 'leftover');
  await assertOriginals(library.seasons);

  runCli(['-t', 'series', '-f'], season.directory);
  assert.equal(await fs.readFile(season.target, 'utf8'), season.content);
  await assert.rejects(fs.access(season.subs), { code: 'ENOENT' });
  await assertOriginals(library.seasons.slice(1));
});

test('season-level target conflict aborts before moving files or forced cleanup', async t => {
  const library = await makeLibrary(t);
  const season = library.seasons[0];
  await fs.writeFile(season.target, 'existing subtitle');
  const note = path.join(season.subs, 'notes.nfo');
  await fs.writeFile(note, 'keep me');

  for (const preview of [true, false]) {
    const result = runCli(['-t', 'series', '-f', ...(preview ? ['--dry-run'] : [])], season.directory, 1);
    assert.match(result.stderr, /Target already exists/);
    assert.equal(await fs.readFile(season.source, 'utf8'), season.content);
    assert.equal(await fs.readFile(season.target, 'utf8'), 'existing subtitle');
    assert.equal(await fs.readFile(note, 'utf8'), 'keep me');
    await assertOriginals(library.seasons.slice(1));
  }
});

test('season-level movesubs supports Infuse-friendly subtitle suffixes', async t => {
  const library = await makeLibrary(t);
  const season = library.seasons[0];
  runCli(['-t', 'series', '--infuse-friendly'], season.directory);
  assert.equal(await fs.readFile(path.join(season.directory, `${season.videoName}-en-3.srt`), 'utf8'), season.content);
  await assert.rejects(fs.access(season.subs), { code: 'ENOENT' });
  await assertOriginals(library.seasons.slice(1));
});

test('a conflict in a later season stops all series moves and forced cleanup across versions', async t => {
  const library = await makeLibrary(t);
  const lastSeason = library.seasons.at(-1);
  await fs.writeFile(lastSeason.target, 'existing subtitle');
  const notes = [];
  for (const season of library.seasons) {
    const note = path.join(season.subs, 'notes.nfo');
    await fs.writeFile(note, `keep ${season.content}`);
    notes.push({ path: note, content: `keep ${season.content}` });
  }

  for (const dryRun of [true, false]) {
    const result = runCli([
      '-t', 'series', '-d', library.root, '-f', ...(dryRun ? ['--dry-run'] : []),
    ], library.temporary, 1);
    assert.match(result.stderr, /Target already exists/);
    assert.equal(await fs.readFile(lastSeason.target, 'utf8'), 'existing subtitle');
    for (const season of library.seasons) {
      assert.equal(await fs.readFile(season.source, 'utf8'), season.content);
      assert.equal(await fs.readFile(season.video, 'utf8'), season.videoName);
      assert.equal((await fs.stat(season.subs)).isDirectory(), true);
    }
    await assertOriginals(library.seasons.slice(0, -1));
    for (const note of notes) assert.equal(await fs.readFile(note.path, 'utf8'), note.content);
  }
});

test('movies still requires an explicit directory and invalid types do not modify files', async t => {
  const library = await makeLibrary(t);
  assert.match(runCli(['-t', 'movies'], library.root, 1).stderr, /requires --directory/);
  assert.match(runCli(['-t', 'invalid'], library.root, 1).stderr, /--type must be series or movies/);
  await assertOriginals(library.seasons);
});
