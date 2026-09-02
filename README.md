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
Standardize the naming of your video and subtitle files in a directory.

### Usage
```sh
~$ cd MY_FOLDER_PATH
~$ seasonme format
# or
~$ seasonme format -d MY_FOLDER_PATH
# preview without changing files
~$ seasonme format -d MY_FOLDER_PATH --dry-run
```

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

### Optional Infuse/TMDB-friendly mode

The default output keeps seasonme's compact multi-episode and subtitle styles,
such as `S04E05E06` and `.中文字幕`. Add `--infuse-friendly` only when you
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
for example `Show.Name.S01E01-en.srt` or `Show.Name.S01E01-zh.srt`.

## 2. Move Subtitles (`seasonme movesubs`)
Organize subtitle files from a Subs directory to match with your video files. Supports both TV series and movies.

### For TV Series
```sh
~$ seasonme movesubs -t series -d MY_SERIES_PATH(e.g. ~/your/path/to/Twin.Peaks)
# preview without changing files
~$ seasonme movesubs -t series -d MY_SERIES_PATH --dry-run
```

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
