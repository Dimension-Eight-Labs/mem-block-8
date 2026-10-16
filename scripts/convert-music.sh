#!/usr/bin/env bash
# scripts/convert-music.sh - Rebuild assets/music/*.mp3 from the source audio.
#
# The source files live in assets/music/originals/ (gitignored, local only;
# each track's license screenshot is in docs/licenses/music/ and its credit
# in CREDITS.md). This script never modifies them; it writes new files.
#
# Settings, and why:
#   - MP3, 128 kbps CBR, 44.1 kHz: plays everywhere (including iOS WebKit),
#     small enough to cache offline, transparent enough for chiptune.
#   - Mono only when the source is mono (or effectively mono); the stereo
#     sources all carry real stereo content, so they stay stereo.
#   - Leading and trailing silence trimmed (peak below -60 dBFS) so the
#     track loops without a gap. The music player loops the whole file.
#   - ffmpeg's MP3 writer adds a LAME/Info header recording the encoder
#     delay and padding. Browsers that honour it decode exactly the
#     original samples; for those that do not, js/audio/music.js knows each
#     track's true length in samples ("frames", printed below) and computes
#     loop points that skip the padding. So after re-running this script,
#     copy the printed frame counts into the TRACKS table in
#     js/audio/music.js.
#
# Loops shorter than the source (optional 4th and 5th fields): some tracks
# are too long to keep decoded on a phone (decoded audio is about 10 MB a
# minute in stereo). Those are cut to a loop: the output is the first
# LOOP_END samples (44.1 kHz, counted after the silence trim), chosen on a
# bar or phrase boundary so the jump back to the start is musical. To make
# the wrap seamless, the XFADE samples that follow the cut in the source
# are faded out over the first XFADE samples of the output (which fade in).
# The first output sample is then the source's sample right after the cut,
# so playback runs on from the last sample to the first with no step; the
# blend is short enough to be heard as part of the downbeat.
#
#   Iced Village: 80 BPM exactly (one 4/4 bar = 3.000 s = 132300 samples),
#   with the bar grid starting at the first sample. Cut after bar 48, the
#   end of the main section's 8-bar phrase: 144.000 s = 2:24.000 =
#   6350400 samples. The loop then drops back into the filtered intro,
#   just as the full track drops from its main section into its filtered
#   breakdown at 1:36. Crossfade 882 samples (20 ms): without it the wrap
#   jumps by 0.14 of full scale (a click).
#
# Adding or replacing a track: put the source in assets/music/originals/,
# add a line to TRACKS below (source file | output name | channels, plus
# loop end and crossfade in samples for a loop cut), run this script, then
# add the track to js/audio/music.js and CREDITS.md.
#
# Usage: scripts/convert-music.sh [output name ...]
#   With names (e.g. iced-village), only those tracks are rebuilt.
#
# Requires ffmpeg and ffprobe (Debian/Ubuntu: sudo apt install ffmpeg).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/music/originals"
OUT="$ROOT/assets/music"

# source file in originals/ | output name (no extension) | channels
#   [| loop end in samples | crossfade in samples]
TRACKS=(
  'Project 2 marioish.mp3|free-run|2'
  'The Hero.ogg|the-hero|2'
  'newbattle.wav|battle-theme|1'
  'pixel_sprinter.wav|pixel-sprinter|2'
  'boss_battle_#2.WAV|boss-battle-2|2'
  'crow-man .ogg|crow-mans-stage|1'
  '8_bit_iced_village_lofi.mp3|iced-village|2|6350400|882'
)

# Peak detection trims exactly at the first and last audible sample.
TRIM='silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0:detection=peak'
TRIM_BOTH="$TRIM,areverse,$TRIM,areverse"

command -v ffmpeg >/dev/null || { echo 'ffmpeg not found: sudo apt install ffmpeg' >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Whether a track was asked for on the command line (all, with no arguments).
wanted() {
  [ "$#" -le 1 ] && return 0
  local name="$1"; shift
  for want in "$@"; do [ "$want" = "$name" ] && return 0; done
  return 1
}

printf '%-22s %10s %10s\n' 'track' 'frames' 'bytes'
for entry in "${TRACKS[@]}"; do
  IFS='|' read -r source name channels loop_end xfade <<<"$entry"
  wanted "$name" "$@" || continue
  wav="$WORK/$name.wav"
  # 1. Trim and resample to a lossless intermediate, to measure its length exactly.
  ffmpeg -nostdin -v error -y -i "$SRC/$source" -af "$TRIM_BOTH" \
    -ar 44100 -ac "$channels" -c:a pcm_s16le "$wav"
  if [ -n "${loop_end:-}" ]; then
    # 1b. Cut to a loop (see the top of this file): head fades in while the
    # samples after the cut fade out over it, then the rest up to the cut.
    full="$WORK/$name-full.wav"
    mv "$wav" "$full"
    ffmpeg -nostdin -v error -y -i "$full" -filter_complex "\
[0:a]asplit=3[h][b][t];\
[h]atrim=start_sample=0:end_sample=$xfade,asetpts=PTS-STARTPTS,afade=t=in:ss=0:ns=$xfade:curve=tri[head];\
[t]atrim=start_sample=$loop_end:end_sample=$((loop_end + xfade)),asetpts=PTS-STARTPTS,afade=t=out:ss=0:ns=$xfade:curve=tri[tail];\
[head][tail]amix=inputs=2:normalize=0[blend];\
[b]atrim=start_sample=$xfade:end_sample=$loop_end,asetpts=PTS-STARTPTS[body];\
[blend][body]concat=n=2:v=0:a=1[out]" \
      -map '[out]' -c:a pcm_s16le "$wav"
  fi
  frames=$(ffprobe -v error -select_streams a:0 -show_entries stream=duration_ts -of csv=p=0 "$wav")
  # 2. Encode. -map_metadata -1 drops the source tags (they are in CREDITS.md).
  ffmpeg -nostdin -v error -y -i "$wav" -map_metadata -1 \
    -c:a libmp3lame -b:a 128k -ar 44100 -ac "$channels" "$OUT/$name.mp3"
  printf '%-22s %10s %10s\n' "$name" "$frames" "$(stat -c %s "$OUT/$name.mp3")"
done
