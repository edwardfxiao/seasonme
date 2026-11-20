const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { format } = require('../src/format/index.js');
const { renderResult } = require('../src/ui/index.js');

const cli = path.resolve(__dirname, '../bin/cli.js');
const show = 'The.Big.Bang.Theory';
const releases = [
  '1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP[rartv]',
  '1080p.BluRay.x265-RARBG',
];

const makeLibrary = async (t, { infuseFriendly = false, layout = 'long' } = {}) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'seasonme-scope-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = layout === 'long' ? path.join(temporary, 'Series', show) : path.join(temporary, 'myshow');
  const libraryReleases = layout === 'long' ? releases
    : layout === 'two-level' ? ['WEBRip.x265'] : ['WEBRip.x265', 'BluRay.x264'];
  const files = [];
  const directories = [];
  for (const release of libraryReleases) {
    for (const season of [1, 2]) {
      const directory = layout === 'long'
        ? path.join(root, `${show}.${release}`, `${show}.S0${season}.${release}`)
        : layout === 'two-level' ? path.join(root, `s0${season}`)
          : path.join(root, `myshow.${release.toLowerCase()}`, `s0${season}`);
      directories.push(directory);
      await fs.mkdir(directory, { recursive: true });
      const base = `${show}.S0${season}E01.${release}`;
      const names = [
        [`The Big Bang Theory S${season} E1 ${release}.MKV`, `${base}.mkv`],
        [`The Big Bang Theory ${season}x1 English2.SRT`, `${base}${infuseFriendly ? '-en-2' : '.English.2'}.srt`],
      ];
      for (const [source, target] of names) {
        const file = {
          directory,
          source: path.join(directory, source),
          target: path.join(directory, target),
          content: `${release}: season ${season}: ${source}`,
        };
        await fs.writeFile(file.source, file.content);
        files.push(file);
      }
    }
  }
  return { temporary, root, directories, files };
};

const assertOriginals = async files => {
  for (const file of files) {
    assert.equal(await fs.readFile(file.source, 'utf8'), file.content);
    await assert.rejects(fs.access(file.target), { code: 'ENOENT' });
  }
};

const runCli = (args, cwd) => {
  const result = spawnSync(process.execPath, [cli, 'format', ...args], {
    cwd, encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout;
};

const scopeCases = [
  ...['A', 'B', 'C'].map(level => ({ name: `level ${level}`, level })),
  ...['.', 'myshow.webrip.x265', 'myshow.webrip.x265/s01', 'myshow.bluray.x264', 'myshow.bluray.x264/s01']
    .map(relative => ({ name: `three-level myshow/${relative}`, layout: 'three-level', relative })),
  ...['.', 's01'].map(relative => ({ name: `two-level myshow/${relative}`, layout: 'two-level', relative })),
];

for (const scope of scopeCases) {
  const entries = scope.level ? ['the current directory', '-d absolute-path', '-d .'] : ['-d absolute-path', '-d .'];
  for (const entry of entries) {
    test(`CLI formats ${scope.name} using ${entry}`, async t => {
      const library = await makeLibrary(t, { layout: scope.layout });
      const directory = scope.level === 'A' ? library.root
        : scope.level === 'B' ? path.dirname(library.directories[0])
          : scope.level === 'C' ? library.directories[1] : path.join(library.root, scope.relative);
      const selected = library.files.filter(file => file.source.startsWith(`${directory}${path.sep}`));
      const selectedDirectories = [...new Set(selected.map(file => file.directory))];
      const args = entry === '-d absolute-path' ? ['-d', directory] : entry === '-d .' ? ['-d', '.'] : [];
      const cwd = entry === '-d absolute-path' ? library.temporary : directory;
      const expectedRoot = entry === '-d absolute-path' ? directory : await fs.realpath(directory);

      const preview = runCli([...args, '--dry-run'], cwd);
      assert.ok(preview.includes(`Root: ${expectedRoot}`));
      assert.ok(preview.includes(`Media folders scanned recursively (${selectedDirectories.length})`));
      assert.ok(preview.includes(`${selected.length} safe file operation(s) planned`));
      for (const file of selected) assert.ok(preview.includes(path.relative(directory, file.target)));
      await assertOriginals(library.files);

      const output = runCli(args, cwd);
      assert.ok(output.includes(`${selected.length} file operation(s) completed safely`));
      for (const file of selected) {
        assert.equal(await fs.readFile(file.target, 'utf8'), file.content);
        await assert.rejects(fs.access(file.source), { code: 'ENOENT' });
      }
      await assertOriginals(library.files.filter(file => !selected.includes(file)));

      assert.match(runCli(args, cwd), /Everything is already formatted. No changes were needed/);
      for (const file of selected) assert.equal(await fs.readFile(file.target, 'utf8'), file.content);
      await assertOriginals(library.files.filter(file => !selected.includes(file)));
      const repeated = await format({ directory });
      assert.deepEqual(repeated.changes, []);
      assert.deepEqual(repeated.warnings, []);
      assert.deepEqual(new Set(repeated.directories), new Set(selectedDirectories));
    });
  }
}

test('CLI applies Infuse-friendly naming to every version and season', async t => {
  const library = await makeLibrary(t, { infuseFriendly: true });
  runCli(['-d', library.root, '--infuse-friendly'], library.temporary);
  for (const file of library.files) {
    assert.equal(await fs.readFile(file.target, 'utf8'), file.content);
    await assert.rejects(fs.access(file.source), { code: 'ENOENT' });
  }
  assert.deepEqual((await format({ directory: library.root, infuseFriendly: true })).changes, []);
});

test('a conflict in one season aborts the whole batch before any renames', async t => {
  const library = await makeLibrary(t);
  const lastVideo = library.files.at(-2);
  await fs.writeFile(lastVideo.target, 'existing video');

  for (const dryRun of [true, false]) {
    await assert.rejects(format({ directory: library.root, dryRun }), /Multiple files would use the same target/);
    for (const file of library.files) assert.equal(await fs.readFile(file.source, 'utf8'), file.content);
    assert.equal(await fs.readFile(lastVideo.target, 'utf8'), 'existing video');
    for (const file of library.files.filter(file => file !== lastVideo)) {
      await assert.rejects(fs.access(file.target), { code: 'ENOENT' });
    }
  }
});

test('unmatched subtitles never borrow videos from other versions or season folders', async t => {
  const library = await makeLibrary(t);
  const orphan = path.join(library.directories[2], 'Other.Release.S02E01.French.srt');
  const missingVideo = library.files.at(-2);
  await fs.unlink(missingVideo.source);
  await fs.writeFile(orphan, 'unmatched French subtitle');
  const missingSubtitle = library.files.at(-1);

  const result = await format({ directory: library.root });
  assert.equal(result.warnings.length, 2);
  assert.equal(result.changes.length, 6);
  assert.ok(result.warnings.every(warning => warning.includes('no matching video')));
  assert.equal(await fs.readFile(missingSubtitle.source, 'utf8'), missingSubtitle.content);
  assert.equal(await fs.readFile(orphan, 'utf8'), 'unmatched French subtitle');
  await assert.rejects(fs.access(missingSubtitle.target), { code: 'ENOENT' });
});

test('recursive formatting preserves unknown files and skips hidden entries and symlinks', async t => {
  const library = await makeLibrary(t);
  const preserved = [
    path.join(library.root, 'poster.jpg'),
    path.join(library.root, '.hidden', 'Show S1 E1.mkv'),
    path.join(library.directories[0], '.Show S1 E1.mkv'),
    path.join(library.temporary, 'outside', 'Show S1 E1.mkv'),
  ];
  for (const file of preserved) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, file);
  }
  await fs.symlink(path.dirname(preserved[3]), path.join(library.root, 'linked-version'), 'dir');
  await fs.symlink(preserved[3], path.join(library.root, 'Show S1 E1.mkv'));

  const result = await format({ directory: library.root });
  assert.equal(result.changes.length, library.files.length);
  assert.equal(result.directories.length, 4);
  for (const file of preserved) assert.equal(await fs.readFile(file, 'utf8'), file);
  assert.equal(await fs.readlink(path.join(library.root, 'Show S1 E1.mkv')), preserved[3]);
});

test('dry-run warnings describe planned operations and make no changes', async t => {
  const library = await makeLibrary(t);
  await fs.writeFile(path.join(library.directories[0], 'movie.mkv'), 'unrecognized');
  const result = await format({ directory: library.root, dryRun: true });
  const output = renderResult(result, { command: 'format' });
  assert.match(output, /Format Dry Run Completed with Warnings/);
  assert.match(output, /8 file operation\(s\) planned; 1 warning\(s\). No files were changed/);
  assert.doesNotMatch(output, /file operation\(s\) completed/);
  await assertOriginals(library.files);
});

test('empty folders report that no supported media was found', async t => {
  const library = await makeLibrary(t);
  const empty = path.join(library.root, 'empty-version');
  await fs.mkdir(empty);
  const result = await format({ directory: empty });
  assert.deepEqual(result.directories, []);
  const output = renderResult(result, { command: 'format' });
  assert.match(output, /No supported video or subtitle files were found/);
  assert.doesNotMatch(output, /Everything is already formatted/);
});
