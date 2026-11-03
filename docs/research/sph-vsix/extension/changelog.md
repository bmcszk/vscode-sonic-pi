# Changelog

## [0.3.2] — 2026-04-28

### Changed
- New logo / icon
- Removed dead code (`getAIContext`) and unused data file (`sonic-pi-ai-context.md`)
- Cleaned visualization sample files from the extension package

## [0.3.1] — 2026-04-28

### Fixed
- README updated to reflect current features (removed AI assistant references)

## [0.3.0] — 2026-04-28

### Changed
- Cross-platform support: Windows (WMI), macOS (`ps -ww aux`), Linux (`/proc` filesystem)
- Removed AI assistant — extension is now focused and dependency-free
- Removed visualization server
- Package size reduced from 1.9 MB to 34 KB

## [0.1.0] — 2026-04-27

### Added
- Live code execution in Sonic Pi via OSC (`Alt+R` / `Alt+S`)
- IntelliSense: autocomplete for 43 synths, 34 FX, 96 samples
- Hover documentation for synths, FX and samples
- 20 code snippets for common Sonic Pi patterns
