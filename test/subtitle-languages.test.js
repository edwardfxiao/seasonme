const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { format, handleSubRenaming } = require('../src/format/index.js');
const { getSubtitleLanguageSuffix } = require('../src/subs/common.js');

const chineseLabels = [
  '中文', '中文字幕', '简体', '簡體', '简体&英文', '簡體&英文', '英文&简体',
  '简体中文&英文', '英文+中文字幕', '简体中文双语字幕', '中文精校字幕',
  '简体&英文修订版', '中文&法語', '简体&日语&英文', '中文.校订版',
  '中', '中英', '中英文', '中英双字', '中英雙字', '英中', '英简', '英簡',
  '简中', '簡中', '简英', '簡英', '简英双语', '中英双语字幕',
  'ch', 'CH', 'chs', 'chi', 'zho', 'chinese', 'ch&eng', 'chseng', 'engchs',
  'CHSENG', 'ChineseEnglish', 'chsenglish', 'chs_en', 'zh.en', 'zh-CN', 'zh_CN',
  'zh-Hans', 'zh-Hans-CN', 'zh-Hans-TW', 'zh-Hans-HK', 'zh-SG', 'zh-Hans&en', 'simplified-chinese',
];
const traditionalLabels = [
  '繁体', '繁體', '繁体&英文', '繁體中文', '繁體中文&英文', '英文&繁體',
  '繁体&英文&校订', '繁體中文&德语',
  '繁体中文字幕', '繁體中文字幕', '精校繁体字幕', '繁中', '繁英', '英繁', '繁英双语',
  '正體中文', '正体中文', 'cht', 'CHT', 'chteng', 'engcht', 'cht&eng', 'cht.eng',
  'cht_en', 'zh-TW', 'zh_HK', 'zh-MO', 'zh-Hant', 'zh_Hant_TW', 'zh-Hant-HK', 'zh-Hant-CN', 'zh-Hant字幕',
  'traditional-chinese', 'chinese-traditional', 'chs&cht', '简体&繁体', '简繁',
  '中文字幕.繁体',
];

test('formats Chinese language labels and preserves traditional script', async t => {
  for (const [labels, expected, infuseExpected] of [
    [chineseLabels, '.中文字幕', '-zh'],
    [traditionalLabels, '.中文字幕.繁体', '-zh-Hant'],
  ]) {
    for (const label of labels) {
      await t.test(label, async () => {
        const input = `barry.s04e08.1080p.web.h264-cakes.${label}.ass`;
        const video = 'barry.S04E08.1080p.web.h264-cakes';
        const names = { S04_E08: video };
        for (const [options, suffix] of [[{}, expected], [{ infuseFriendly: true }, infuseExpected]]) {
          const targets = await handleSubRenaming([input], names, options);
          assert.deepEqual(targets, [`${video}${suffix}.ass`]);
          assert.deepEqual(await handleSubRenaming(targets, names, options), targets);
        }
      });
    }
  }
});

test('accepts language annotation separators, brackets, and fullwidth characters', async t => {
  const cases = [
    ['[简体&英文]', '.中文字幕'], ['(繁體&英文)', '.中文字幕.繁体'],
    ['【CHT&ENG】', '.中文字幕.繁体'], ['（zh&en）', '.中文字幕'],
    ['［ＣＨＳ＆ＥＮＧ］', '.中文字幕'], ['繁體＋英文', '.中文字幕.繁体'],
    ['简体、英文', '.中文字幕'], ['简体,英文', '.中文字幕'], ['chs|eng', '.中文字幕'],
    ['chs/eng', '.中文字幕'], ['简体 英文', '.中文字幕'], ['简体_英文', '.中文字幕'],
    ['简体-英文', '.中文字幕'], ['中文字幕（繁體）', '.中文字幕.繁体'],
    ['简体&英文.特效', '.中文字幕'], ['繁体.英文字幕', '.中文字幕.繁体'],
  ];
  for (const [label, expected] of cases) {
    await t.test(label, () => assert.equal(getSubtitleLanguageSuffix(label), expected));
  }
});

test('keeps numbers after the complete Chinese script suffix', async t => {
  const cases = [
    ['cht.2', '.中文字幕.繁体.2', '-zh-Hant-2'],
    ['繁体&英文.03.sdh', '.中文字幕.繁体.03', '-zh-Hant-03'],
    ['zh-Hant-2', '.中文字幕.繁体.2', '-zh-Hant-2'],
    ['中文字幕.繁体.5', '.中文字幕.繁体.5', '-zh-Hant-5'],
    ['中文字幕.繁体.5.forced', '.中文字幕.繁体.5', '-zh-Hant-5'],
    ['简体&英文.2', '.中文字幕.2', '-zh-2'],
    ['cht2', '.中文字幕.繁体.2', '-zh-Hant-2'],
    ['chseng2', '.中文字幕.2', '-zh-2'],
    ['English.2', '.English.2', '-en-2'], ['Dutch.3', '.Dutch.3', '-nl-3'],
    ['French.sdh', '.French', '-fr'],
  ];
  for (const [label, expected, infuseExpected] of cases) {
    await t.test(label, () => {
      assert.equal(getSubtitleLanguageSuffix(label), expected);
      assert.equal(getSubtitleLanguageSuffix(label, { infuseFriendly: true }), infuseExpected);
    });
  }
});

test('does not classify other languages, titles, or release groups as Chinese', async t => {
  const cases = [
    ['French', '.French'], ['FRENCH', '.French'], ['French2', '.French.2'],
    ['Dutch', '.Dutch'], ['DUTCH', '.Dutch'], ['Dutch3', '.Dutch.3'],
    ['English', '.English'], ['英文', '.English'], ['英文字幕', '.English'],
    ['日文', '.Japanese'], ['韓文', '.Korean'], ['Portuguese-BR', '.Portuguese-BR'],
    ['Watch', ''], ['Match', ''], ['CHD', ''], ['ChsGroup', ''], ['ReleaseCHS', ''],
    ['China', ''], ['zhong', ''], ['x265', ''], ['UTF-8', ''], ['GBK', ''], ['Big5', ''],
    ['中英.Show.S01E01.WEB-DL', ''], ['Show.S01E01.法语注释', ''],
    ['CHS.Show.S01E01.French', '.French'], ['繁体.Show.S01E01.Dutch', '.Dutch'],
    ['繁星.中文字幕', '.中文字幕'],
  ];
  for (const [label, expected] of cases) {
    await t.test(label, () => assert.equal(getSubtitleLanguageSuffix(label), expected));
  }
});

const tempDirectory = async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seasonme-languages-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
};

test('formats mixed Chinese scripts and numbered languages without collisions or content loss', async t => {
  for (const infuseFriendly of [false, true]) {
    const directory = await tempDirectory(t);
    const video = 'barry.S04E08.1080p.web.h264-cakes';
    const cases = [
      ['简体&英文.ass', infuseFriendly ? '-zh.ass' : '.中文字幕.ass'],
      ['繁體&英文.ass', infuseFriendly ? '-zh-Hant.ass' : '.中文字幕.繁体.ass'],
      ['cht.2.ass', infuseFriendly ? '-zh-Hant-2.ass' : '.中文字幕.繁体.2.ass'],
      ['English.2.srt', infuseFriendly ? '-en-2.srt' : '.English.2.srt'],
      ['English.3.srt', infuseFriendly ? '-en-3.srt' : '.English.3.srt'],
      ['French.srt', infuseFriendly ? '-fr.srt' : '.French.srt'],
      ['Dutch.srt', infuseFriendly ? '-nl.srt' : '.Dutch.srt'],
    ];
    await fs.writeFile(path.join(directory, `${video}.mp4`), 'video');
    for (const [source] of cases) await fs.writeFile(path.join(directory, `${video}.${source}`), source);
    const before = await fs.readdir(directory);
    const dryRun = await format({ directory, dryRun: true, infuseFriendly });
    assert.equal(dryRun.warnings.length, 0);
    assert.deepEqual(await fs.readdir(directory), before);
    const result = await format({ directory, infuseFriendly });
    assert.equal(result.warnings.length, 0);
    for (const [source, target] of cases) {
      assert.equal(await fs.readFile(path.join(directory, `${video}${target}`), 'utf8'), source);
    }
    assert.equal((await format({ directory, infuseFriendly })).changes.length, 0);
  }
});

test('matches bracketed subtitles to the correct release when an episode has two videos', async t => {
  const directory = await tempDirectory(t);
  await fs.writeFile(path.join(directory, 'Show.S01E01.ReleaseA.mkv'), 'video A');
  await fs.writeFile(path.join(directory, 'Show.S01E01.ReleaseB.mkv'), 'video B');
  await fs.writeFile(path.join(directory, 'Show.S01E01.ReleaseA[繁體&英文].ASS'), 'subtitle A');
  await format({ directory });
  assert.equal(await fs.readFile(path.join(directory, 'Show.S01E01.ReleaseA.中文字幕.繁体.ass'), 'utf8'), 'subtitle A');
});

test('true duplicate traditional subtitle targets still abort before any rename', async t => {
  const directory = await tempDirectory(t);
  const originals = ['Show S1 E1.mkv', 'ReleaseA.S01E01.cht.2.ass', 'ReleaseB.S01E01.繁体.2.ass'];
  for (const name of originals) await fs.writeFile(path.join(directory, name), name);
  await assert.rejects(format({ directory }), /Multiple files would use the same target/);
  for (const name of originals) assert.equal(await fs.readFile(path.join(directory, name), 'utf8'), name);
});
