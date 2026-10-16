<!-- CREDITS.md - Record of every third-party asset used in Mem Block 8. -->
# Credits

**Audio and music must be CC0** (public domain dedication). **Fonts may be
SIL Open Font License 1.1 or CC0.** Add a row here in the same change that
adds any third-party asset (music, images, fonts), and keep the asset's
license record with it: a font's license file next to it in
`assets/fonts/`, a music track's screenshot of its source page (showing the
license) in `docs/licenses/music/`. Sound effects are synthesized in code
and need no entry.

## Fonts

| Asset | Author | License | Source URL | Date added |
| --- | --- | --- | --- | --- |
| IBM Plex Mono Regular and SemiBold, Latin-1 subsets, woff2 (`assets/fonts/IBMPlexMono-Regular-Latin1.woff2`, `assets/fonts/IBMPlexMono-SemiBold-Latin1.woff2`), unmodified | IBM Corp. | SIL Open Font License 1.1, with Reserved Font Name "Plex" (full text: `assets/fonts/IBM-Plex-Mono-OFL.txt`) | <https://github.com/IBM/plex>, files taken from the official npm package `@ibm/plex-mono` 2.5.0 (<https://registry.npmjs.org/@ibm/plex-mono/-/plex-mono-2.5.0.tgz>, SHA-1 `152c0b1dda619ef5f032db258bda798cf278125e` checked against the registry), `fonts/split/woff2/` | 2026-10-15 |

## Music

All tracks are from OpenGameArt.org and dedicated to the public domain
under **CC0 1.0**; no attribution is required, but the authors are credited
here anyway. The license of each was read from the screenshot of its source
page in `docs/licenses/music/` (taken 2026-10-15/16), which is the record.
The MP3s in `assets/music/` were made from the downloaded originals by
`scripts/convert-music.sh`: leading and trailing silence trimmed, 128 kbps,
44.1 kHz; no other change, except Iced Village (below).

| File | Title | Author | License | Source URL | License screenshot | Date added |
| --- | --- | --- | --- | --- | --- | --- |
| `assets/music/free-run.mp3` (from `Project 2 marioish.mp3`) | Free Run [8 bit(ish)] | TAD | CC0 | <https://opengameart.org/content/free-run-8-bitish> | `docs/licenses/music/ProjectTwoMarioish-opengameart-org.png` | 2026-10-16 |
| `assets/music/the-hero.mp3` (from `The Hero.ogg`) | 8 Bit The Hero | Sygil | CC0 | <https://opengameart.org/content/8-bit-the-hero> | `docs/licenses/music/TheHero-opengameart-org.png` | 2026-10-16 |
| `assets/music/battle-theme.mp3` (from `newbattle.wav`) | 8 bit Battle Theme (Famitracker) | celestialghost8 | CC0 | <https://opengameart.org/content/8-bit-battle-theme-famitracker> | `docs/licenses/music/NewBattle-opengameart-org.png` | 2026-10-16 |
| `assets/music/pixel-sprinter.mp3` (from `pixel_sprinter.wav`) | Pixel Sprinter | Zane Little Music | CC0 | <https://opengameart.org/content/pixel-sprinter> | `docs/licenses/music/pixel-sprinter-opengameart-org.png` | 2026-10-16 |
| `assets/music/boss-battle-2.mp3` (from `boss_battle_#2.WAV`) | Boss Battle #2 ["8 bit"] | nene | CC0 | <https://opengameart.org/content/boss-battle-2-8-bit> | `docs/licenses/music/BossBattleNo2-opengameart-org.png` | 2026-10-16 |
| `assets/music/crow-mans-stage.mp3` (from `crow-man .ogg`) | "Crow Man's Stage" (file: Track 01 (Crow Man's Stage) FAST) | Spring Spring (page notice: "Composer: Spring Instruments: Threxx") | CC0 | <https://opengameart.org/content/crow-mans-stage> | `docs/licenses/music/crow-man-opengameart-org.png` | 2026-10-16 |
| `assets/music/iced-village.mp3` (from `8_bit_iced_village_lofi.mp3`; trimmed to a loop, see below) | Iced Village (8 Bit Lofi Hip Hop) | TAD | CC0 (the page offers CC-BY 4.0 or CC0; used under CC0) | <https://opengameart.org/content/iced-village-8-bit-lofi-hip-hop> | `docs/licenses/music/8-bit-iced-village-opengameart-org.png` | 2026-10-16 |

**Iced Village trim (0.5.1, 2026-10-16).** The full 7:17 track was too
large for iPhone memory once decoded (about 150 MB), so the shipped file
is its first 2:24.000 (48 bars at 80 BPM, ending on a phrase boundary),
with the 20 ms after the cut blended into the first 20 ms so the loop
wraps without a click. A modification of a CC0 work; the original download
is unchanged. Exact cut points are in `scripts/convert-music.sh`.
