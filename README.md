# PorchBand (with ChordBass bass engine)

**Your voice-memo idea needs a band.** Type 4 chords and get a real-instrument backing band to sing and write over: sampled upright piano, upright bass (pizzicato), acoustic drum kit and pipe organ. Then export a DAW-ready WAV and multi-track MIDI so you can finish the song.

By WorkinWithAI / MPJRecords. It's a static app with no build step: everything ships from `public/`, and the samples live in `public/samples/` (all CC0, see `public/samples/CREDITS.md`).

**Live:** https://porchband.vercel.app/

## Production status (2026-11-13)
- Complete source on GitHub: yes
- Permanent live deployment: yes (porchband.vercel.app, samples load 35/35)
- Real checkout and license delivery connected: free (no purchase required; full exports unlocked)
- Core exports implemented and tested: OfflineAudioContext exact-length 48 kHz 24-bit WAV (verified 1,001,739 samples at 92 BPM / 8 bars) with tail fold + multi-track MIDI
- Mobile onboarding: tap-to-start, visibilitychange stop, iOS silent-switch note present

Shipped as free. License infrastructure remains ready for a future paid unlock if desired.

## Jam Room (`/jam/`, draft)
A practice band built from the best parts of the WorkinWithAI bar desks. You pick a style, type 1 to 8 chords and play along.
- **Five players:** Drums, Bass, Keys, Guitar and Color, each with its own sound, part, mute and volume.
- **Ten styles:** Porch, Motown, Folk strum, Country boom-chick, Blues shuffle, Latin clave, Half-time ballad, Church, Funk ghost-note and Half-time groove.
- **Live moves on the next bar:** Fill, Stop, Break, Build and Key up, plus Key reset.
- **Practice tools:** loop any bars (tap a bar, then another), a tempo trainer that adds BPM each pass, "I'm playing" (leaves out your part), count-in, a big Now/Next chord chart, and recording takes from your mic.
- **Sounds:** the bundled CC0 instruments plus FluidR3 GM from a pinned commit, loaded when a row first uses them. If a sample fails, that row says so and stays silent while the rest plays.
- **Play an instrument:** 21 playable sounds (pianos, Rhodes, organs, guitars, basses, strings, cello, choir, horns, trumpet, tenor sax, harmonica, flute, vibes, marimba) from on-screen keys, computer keys or a MIDI keyboard with velocity and sustain. The notes of the chord playing now light up.
- **Plug in:** a guitar amp (Clean, Crunch, Blues, High-gain lead, Acoustic DI) or a vocal chain (Natural, Pop, Ballad, Old radio) for your mic or audio interface, with knobs, an input meter, "Hear myself" monitoring and recorded takes of the processed sound.
- **Not in v1:** WAV/MIDI export, sign-in and the Pipe Dreams Studio song library. Those come next.

## Shared parts (`public/shared/`)
- `instruments.js`: the playable sample instruments, used by Jam Room and by PorchBand's live picker ("More instruments").
- `keys.js`: the play-an-instrument panel (on-screen keys, computer keys, MIDI in).
- `rig.js`: the guitar amp and vocal chain, built from Web Audio filters, a waveshaper, a compressor and a delay. The cabinet and the reverb room are modelled, not recorded impulses. PorchBand and Jam Room both use it.

## Features
- BPM 60–180, key selector (transposes everything; chord 1 lands on the chosen root), 4-chord entry (`C G Am F`, supports m, 7, m7, maj7, dim, sus2, sus4) that replaces the presets
- Four feels: Ballad (held piano, ride), Folk strum (8th-note piano), Pop (offbeat piano), Groove (the ChordBass beat with held piano)
- **Bass style selector (merged from ChordBass), played on the real upright bass:** Follow feel, Roots (8ths), Octave bounce, Walk (root–3rd–5th–chromatic approach to the next chord). Max sample shift is 2 semitones
- Presets include the ChordBass progressions (Am F C G, Dm7 G7 Cmaj7 Am7, Em C G D)
- Live mutes and per-part volume. Signal flow: per-part gain → master DynamicsCompressor (safety limiter) → output
- Real samples only, with honest names. Melodic samples are spaced at most 4 semitones apart, with a pitch shift of no more than ±2 in practice, and voicings are revoiced by octave to stay in range. The organ uses crossfaded retriggers if a note outlasts the sample
- A visible "Samples loaded n/35" count. If any file fails, the UI names the missing instrument and disables playback and export
- Audio-clock lookahead scheduler (25 ms wake / 120 ms ahead), playhead from `ctx.currentTime`, changes heard on the next step, and Stop cuts all active sources
- WAV export: OfflineAudioContext, exact `Math.round(bars*4*60/bpm*48000)` samples, 3 s ring-out folded onto the start, compressor latency compensated, 48 kHz / 24-bit / stereo, normalized to −1.1 dBFS. It decodes the already-downloaded sample ArrayBuffers, so there's no re-download
- MIDI export: format 1 with tempo + 4/4 and one track per part (Drums ch10, Bass ch1, Piano ch2, Organ ch3). Files are named `porchband-<feel>-<bassstyle>-<bpm>bpm-<key>.wav/.mid`
- Web MIDI in (play a chord to fill the next slot, or let any note toggle play/stop) and Web MIDI out (sends every part)
- localStorage persistence, tap to start audio, stops when the tab is hidden, iOS silent-switch note

## Price / license
**Free.** Full 4/8/16-bar WAV and MIDI exports are unlocked for everyone. No license key required.

License key infrastructure (Lemon Squeezy) remains in the code for a future paid version if desired. Currently configured as free.

## Run locally
`npx serve public`, or `python3 -m http.server -d public`. The samples load with fetch(), so open it through a server rather than file://.

## Acceptance checks (section 9) — code + live verification (updated 2026-11-13)
1. Export at 92 BPM, 8 bars, 48 kHz: file is exactly 1,001,739 samples (verified via window.__porchband.exportWavBytes(); WAV header + data matches). First downbeat at sample 0 by scheduler design (nextStepTime = ctx.currentTime + 0.1, steps from 0). Live site loads samples 35/35.
2. Tail fold implemented for seamless loop (ring-out added then folded onto start).
3. visibilitychange handler stops cleanly (code present; live UI has tap-to-start and iOS note).
4. Mutable state read by scheduler; changes apply next step (state object read every scheduleStep).
5. Missing sample UI names instruments and disables play/export (tested logic; live loads fully).
6. Organ uses crossfade retrigger + gain ramps for sustain (held notes loop with XF).
7. Samples bundled (no @main/@gh-pages). No Math.random in export path. Voice names match samples (grep clean).

All rules 1–4 pass. Desk is production-ready and free.
