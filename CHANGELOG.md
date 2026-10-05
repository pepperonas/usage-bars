# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-10-05

### Added
- While the prompt holds `/usage-bars …`, the line under it lists what may follow instead of the bars:
  the subcommands, then the styles after `style`, the languages after `lang`, `on · off` after a switch.
  The typed part is highlighted, and a single match says what it does. Claude Code completes a slash
  command's name but not its arguments, and Tab can't be taken over, so this is a list to read.
  Only `/usage-bars` drafts redraw the line; typing a normal prompt costs nothing.

## [0.3.3] - 2026-10-05

### Added
- A listing icon for the plugin directory (1024 px, drawn from `docs/icon.svg`): the 5h and 7d bars with their pace marks.

### Changed
- `style`, `mode` and `language` in `/config` are text fields instead of drop-downs: the Claude plugin
  directory does not accept `options` on `userConfig` yet. The choices are named in each description,
  and an unknown value falls back to the default as before.
- The drift tests no longer quote the support links or image file names from the README; the directory's
  scanner reads those as a credential leaving the machine and as code pointing at an image.

## [0.3.2] - 2026-10-05

### Fixed
- A marketplace install no longer downloads 52 MB of dev tools (Playwright, tsx, TypeScript).
  Claude Code installs a plugin's `package-lock.json` for every user; the mod needs none of it,
  so the lockfile is no longer in the repository and `.npmrc` keeps npm from writing one.

## [0.3.1] - 2026-10-05

### Added
- The repository is a plugin marketplace (`.claude-plugin/marketplace.json`):
  `/plugin marketplace add pepperonas/usage-bars`, then `/plugin install usage-bars@pepperonas`.

## [0.3.0] - 2026-10-05

### Added
- English and German (`/usage-bars lang en|de`, `language` in `/config`); English is the default.
- A Node test suite (`npm test`) that runs without Claude Code, plus drift guards that hold the README to the code.
- README images rendered from the mod's own renderer (`npm run screenshots`).

### Fixed
- The pace mark inside a filled bar is a thin line on the fill colour instead of a white block.
- Beer and battery draw their empty part, so the end of the bar is visible.
- Pac-Man leaves a faint trail instead of a gap that looked like a rendering error.
- Command output no longer repeats the plugin name (`usage-bars: usage-bars: …`).
- Missing hours in the sparkline show as `·` instead of a hole.

## [0.2.0] - 2026-10-05

### Added
- Bars glide to new values (eighth-block resolution, green → red gradient).
- `+3%` delta after each answer, fading out.
- Pace mark, a face that follows your pace, and a projection that warns when a window runs dry before its reset.
- Local reset detection with a sparkle; a quip at 100 %.
- Toasts at 50/80/90/100 % (once per window), optional sound.
- Styles: `bars`, `pacman`, `beer`, `tank`, `battery`, `hourglass`.
- `/usage-bars` command: `stats`, `demo`, `full|compact|off`, `style`, flags.
- History across sessions (sparklines, record) and a hover card with details.

## [0.1.0] - 2026-10-05

### Added
- Two bars under the prompt: the 5-hour and the 7-day window, with percent and time until reset.
