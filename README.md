# seasonme

A tool to organize your TV show and movie files by:
1. **Formatting** - Standardize naming of video and subtitle files
2. **Moving Subtitles** - Organize subtitle files to match with video files

# <img src="https://github.com/edwardfxiao/seasonme/blob/master/public/index.gif" />

## Installation
```sh
npm install seasonme -g
```

Requires Node.js 18 or newer. File operations are validated before they run,
existing targets are never overwritten, and unknown files are preserved.
Successful `format` runs finish with a styled summary. Runs that contain
warnings use a distinct warning summary and never claim full success.

## 1. Format Files (`seasonme format`)
Standardize the naming of your video and subtitle files in a directory and
its subdirectories. The same command works from a show, version, or season
folder; no extra flag is needed.

### Usage
```sh
~$ cd MY_FOLDER_PATH
~$ seasonme format
# or
~$ seasonme format -d MY_FOLDER_PATH
# preview without changing files
~$ seasonme format -d MY_FOLDER_PATH --dry-run
```

### Run from a show, version, or season folder

For example, this show has two versions, each containing multiple seasons:

```text
/Series/The.Big.Bang.Theory/                                  # A: show
├── The.Big.Bang.Theory.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP[rartv]/
│   │                                                        # B: version
│   ├── The.Big.Bang.Theory.S01.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP[rartv]/
│   └── The.Big.Bang.Theory.S02.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP[rartv]/
│                                                            # C: seasons
└── The.Big.Bang.Theory.1080p.BluRay.x265-RARBG/                 # B: version
    ├── The.Big.Bang.Theory.S01.1080p.BluRay.x265-RARBG/         # C: season
    └── The.Big.Bang.Theory.S02.1080p.BluRay.x265-RARBG/         # C: season
```

- **A — show folder:** process all versions and all seasons beneath the show.
- **B — version folder:** process all seasons beneath that version.
- **C — season folder:** process that season, including any subdirectories.

```sh
# A: all versions and seasons
seasonme format -d '/Series/The.Big.Bang.Theory/'

# B: all seasons of the REMUX version
seasonme format -d '/Series/The.Big.Bang.Theory/The.Big.Bang.Theory.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP[rartv]'

# C: only season 2 of the REMUX version
seasonme format -d '/Series/The.Big.Bang.Theory/The.Big.Bang.Theory.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP[rartv]/The.Big.Bang.Theory.S02.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-NOGRP[rartv]'
```

Alternatively, `cd` into any of these folders and run `seasonme format`.
Quote paths containing spaces or brackets. Add `--dry-run` to any command
to preview the whole batch, or `--infuse-friendly` to apply that naming mode
to the whole batch. Output lists the media folders scanned and the relative
paths of changed files.

Discovery is recursive and does not depend on the version or season folder
names. Episode information is still read from filenames. Files stay in their
original folders, and folder names are not changed. Subtitles are matched only
to videos in the same folder, so identical episode numbers in different
versions cannot mix. Hidden entries and symbolic links inside the selected
folder are skipped. All rename targets across the entire batch are validated
before any file is changed; a conflict in one season aborts the whole batch.

### Example
Before:
```
The.Office.US.S01
│
│   The.Office.US.S01e1.bluray.mp4
│   The.Office.US.S01e2.bluray.mp4
│   the office 1x1.srt
│   the office 1x2.srt
```

After (default style):
```
The.Office.US.S01
│
│   The.Office.US.S01E01.BluRay.mp4
│   The.Office.US.S01E01.BluRay.srt
│   The.Office.US.S01E02.BluRay.mp4
│   The.Office.US.S01E02.BluRay.srt
```

Track numbers are preserved: `.English.2.srt` and `.English.3.srt` remain
separate subtitles. Repeated formatting leaves these names unchanged.
Conflicting target names cause formatting to abort before any files are renamed.

### Optional Infuse/TMDB-friendly mode

The default output keeps seasonme's compact multi-episode and subtitle styles,
such as `S04E05E06` and `.English`. Add `--infuse-friendly` only when you
want stricter Infuse/Plex naming:

```sh
seasonme format -d MY_FOLDER_PATH --infuse-friendly
seasonme movesubs -t series -d MY_SERIES_PATH --infuse-friendly
```

This mode writes the Infuse-recommended `Show.Name.S01E02.<anything>` pattern.
Specials use `S00`, multi-episode files use the Plex-compatible
`S01E01-E03` range, and bracketed/version forms such as `[S03E01]` and
`S03E01v2` are normalized to unambiguous episode tokens.

The series title and release year are preserved. A year is optional in Infuse,
but including it improves TMDB matching. For an exact series match, include the
TMDB show ID in the original filename, for example
`Show Name (2020) {tmdb-123456} S01E01.mkv`. The episode numbers still need to
match the season and episode order listed on TMDB; seasonme cannot infer a
different episode order from the video itself. Date-only and anime
absolute-number filenames are left unchanged because Infuse's documented TV
matching requires a season number.

In `--infuse-friendly` mode external subtitles are renamed to exactly match
their video and recognized languages use Infuse's documented suffix style,
for example `Show.Name.S01E01-en.srt` or `Show.Name.S01E01-fr.srt`.
Numbered tracks retain their numbers, for example `Show.Name.S01E01-en-2.srt`.

## 2. Move Subtitles (`seasonme movesubs`)
Organize subtitle files from a Subs directory to match with your video files. Supports both TV series and movies.

### For TV Series

Run from a show folder (A), a version folder (B), or an individual season
folder (C). When `-d` is omitted, the current directory is used. Like `format`,
series `movesubs` searches recursively by default; no `-r` flag is needed.

```sh
# All versions and seasons beneath a show
seasonme movesubs -t series -d /myshow

# Only the selected season
seasonme movesubs -t series -d /myshow/season1

# Or enter the season directory and run directly
cd /myshow/season1
seasonme movesubs -t series -d . --dry-run
seasonme movesubs -t series
```

`-d .` explicitly selects the current directory and is equivalent to omitting
`-d` for series `movesubs`.

In a season directory, `Subs/<episode>/<subtitle>` is detected directly.
The show and season directory names are not parsed: plain names such as
`myshow/season1` work just like `Twin.Peaks/Twin.Peaks.S01`.
Subtitles are moved beside that season's videos, using the episode subfolder
name and the existing language/track naming rules. From a show or version
directory, each descendant `Subs` folder is handled in its own season;
files are never collected into the command's starting directory. Running
from a single season does not affect sibling seasons or other versions.
`--dry-run`, `--infuse-friendly`, and `--force-remove-subs` work at all three
levels. All moves in a batch are validated before any moves or cleanup run.
Output shows the scan root and the `Subs` folders found. If none are found,
the command reports the expected structure. Loose subtitles directly inside
`Subs` are preserved with a warning unless forced deletion is requested.

#### Expected Structure
```
Twin.Peaks
│
└───Twin.Peaks.S01
│   │   Twin.Peaks.S01E01.mp4
│   │   Twin.Peaks.S01E02.mp4
│   │
│   └───Subs
│       └───Twin.Peaks.S01E01
│           │   English3.srt
│           │   English4.srt
│           │   French1.srt
│       └───Twin.Peaks.S01E02
│           │   English3.srt
│           │   English4.srt
│           │   French1.srt
```

#### Resulting folder structure:
```
Twin.Peaks
│
└───Twin.Peaks.S01
│   │   Twin.Peaks.S01E01.mp4
│   │   Twin.Peaks.S01E01.English.3.srt
│   │   Twin.Peaks.S01E01.English.4.srt
│   │   Twin.Peaks.S01E01.French.1.srt
│   │   Twin.Peaks.S01E02.mp4
│   │   Twin.Peaks.S01E02.English.3.srt
│   │   Twin.Peaks.S01E02.English.4.srt
│   │   Twin.Peaks.S01E02.French.1.srt
```

### For Movies
```sh
~$ seasonme movesubs -t movies -d MY_MOVIES_PATH(e.g. ~/your/path/to/movies)
```

### Force-remove `Subs` folders

By default, `movesubs` removes a `Subs` folder only after it becomes empty and
preserves unsupported or unmatched files. To deliberately delete every detected
`Subs` folder together with all files left inside it, add:

```sh
seasonme movesubs -t series -d MY_SERIES_PATH --force-remove-subs
seasonme movesubs -t movies -d MY_MOVIES_PATH --force-remove-subs
# short form
seasonme movesubs -t series -d MY_SERIES_PATH -f
```

This option is destructive. Preview the moved files and recursive folder
deletions first with `--dry-run`.

#### Expected Structure
```
movies
│
└───Toy.Story.1995
│   │   Toy.Story.1995.mp4
│   │
│   └───Subs
│       │   English3.srt
│       │   English4.srt
│       │   French1.srt
│
└───Mission.Impossible.1996
    │   Mission.Impossible.1996.mp4
    │
    └───Subs
        │   English3.srt
        │   English4.srt
        │   French1.srt
```

#### Resulting folder structure:
```
movies
│
└───Toy.Story.1995
│   │   Toy.Story.1995.mp4
│   │   Toy.Story.1995.English.3.srt
│   │   Toy.Story.1995.English.4.srt
│   │   Toy.Story.1995.French.1.srt
│
└───Mission.Impossible.1996
    │   Mission.Impossible.1996.mp4
    │   Mission.Impossible.1996.English.3.srt
    │   Mission.Impossible.1996.English.4.srt
    │   Mission.Impossible.1996.French.1.srt
```

## Testing (for seasonme format)
Generate sample files to test the functionality:
```sh
~$ mkdir dummy
~$ cd dummy
~$ seasonme generate -n 10  # Creates 10 random example files
```

`generate` refuses to use a non-empty directory unless `--force` is supplied.
Even with `--force`, existing files are never deleted or overwritten.

## Development

```sh
npm test
npm run check
```

The test suite uses Node's built-in test runner, so no external test dependency
is required.
