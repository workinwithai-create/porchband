# PorchBand

**Your voice-memo idea needs a band.** Type 4 chords and get a real-instrument backing band to sing and write over: sampled upright piano, upright bass (pizzicato), acoustic drum kit and pipe organ. Then export a DAW-ready WAV and multi-track MIDI so you can finish the song.

By WorkinWithAI / MPJRecords. It's a static app with no build step: everything ships from `public/`, and the samples live in `public/samples/` (all CC0, see `public/samples/CREDITS.md`).

## Features
- BPM 60–180, key selector (transposes everything; chord 1 lands on the chosen root), 4-chord entry (`C G Am F`, supports m, 7, m7, maj7, dim, sus2, sus4) that replaces the presets
- Three feels: Ballad (held piano, ride cymbal, half-note bass), Folk strum (8th-note piano, root–fifth bass), Pop (offbeat piano, 8th-note bass)
- Live mutes and per-part volume. Signal flow: per-part gain → master DynamicsCompressor (safety limiter) → output
- Real samples only, with honest names. Melodic samples are spaced at most 4 semitones apart, with a pitch shift of no more than ±2 in practice, and voicings are revoiced by octave to stay in range. The organ uses crossfaded retriggers if a note outlasts the sample
- A visible "Samples loaded n/35" count. If any file fails, the UI names the missing instrument and disables playback and export
- Audio-clock lookahead scheduler (25 ms wake / 120 ms ahead), playhead from `ctx.currentTime`, changes heard on the next step, and Stop cuts all active sources
- WAV export: OfflineAudioContext, exact `Math.round(bars*4*60/bpm*48000)` samples, 3 s ring-out folded onto the start, compressor latency compensated, 48 kHz / 24-bit / stereo, normalized to −1.1 dBFS. It decodes the already-downloaded sample ArrayBuffers, so there's no re-download
- MIDI export: format 1 with tempo + 4/4 and one track per part (Drums ch10, Bass ch1, Piano ch2, Organ ch3). Files are named `porchband-<feel>-<bpm>bpm-<key>.wav/.mid`
- Web MIDI in (play a chord to fill the next slot, or let any note toggle play/stop) and Web MIDI out (sends every part)
- localStorage persistence, tap to start audio, stops when the tab is hidden, iOS silent-switch note

## Price / license
**$12 one-time** on Lemon Squeezy (license keys). The free demo includes every feel, playback, MIDI export, MIDI I/O and 4-bar WAV export. A license key, checked in the browser against `https://api.lemonsqueezy.com/v1/licenses/validate`, unlocks 8 and 16-bar WAV export. It's a static app, so the gate works on the honor system.

## Run locally
`npx serve public`, or `python3 -m http.server -d public`. The samples load with fetch(), so open it through a server rather than file://.
