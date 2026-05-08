// Generates a short majestic-fanfare WAV for the splash screen.
// Run with: node scripts/genIntroWav.js
// Output: assets/sounds/intro.wav (mono, 22050 Hz, 16-bit PCM)
//
// This produces a brief brass-stack ascent (C major triad rising into a sus chord)
// with a slight tremolo and decay envelope. Bundled at build time so audio
// works fully offline and we don't depend on any external CDN.

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;
const DURATION_S = 2.6;
const totalSamples = Math.floor(SAMPLE_RATE * DURATION_S);

// Helper: a slightly-detuned brass-y sawtooth-ish stacked sine partials
function brassVoice(freq, t) {
  // fundamental + harmonics (1, 2, 3, 4, 5)
  const harmonics = [
    [1.0, 1.0],
    [2.0, 0.45],
    [3.0, 0.28],
    [4.0, 0.18],
    [5.0, 0.10],
    [6.0, 0.06],
  ];
  let v = 0;
  for (const [m, a] of harmonics) {
    v += Math.sin(2 * Math.PI * freq * m * t) * a;
  }
  // light slow tremolo
  v *= 1 + 0.06 * Math.sin(2 * Math.PI * 5 * t);
  return v;
}

// Note frequencies (Hz) — C major triad ascending then resolving to a fanfare sus chord
// C4=261.63, E4=329.63, G4=392.00, C5=523.25
const NOTES = [
  { freq: 261.63, start: 0.0, end: 0.55 }, // C4
  { freq: 329.63, start: 0.4, end: 1.0 }, // E4
  { freq: 392.0, start: 0.8, end: 1.5 }, // G4
  { freq: 523.25, start: 1.2, end: 2.6 }, // C5 — held into the finale
  { freq: 392.0, start: 1.4, end: 2.6 }, // G4 (chord support)
  { freq: 329.63, start: 1.6, end: 2.6 }, // E4 (chord support)
  { freq: 261.63, start: 1.8, end: 2.6 }, // C4 (chord support)
];

// ADSR-ish envelope per note
function envelope(t, start, end) {
  if (t < start || t > end) return 0;
  const dur = end - start;
  const local = t - start;
  const attack = Math.min(0.05, dur * 0.1);
  const release = Math.min(0.4, dur * 0.4);
  if (local < attack) return local / attack;
  const releaseStart = dur - release;
  if (local > releaseStart) {
    return Math.max(0, 1 - (local - releaseStart) / release);
  }
  return 1;
}

// Generate samples
const buf = new Int16Array(totalSamples);
let peak = 0;
for (let i = 0; i < totalSamples; i++) {
  const t = i / SAMPLE_RATE;
  let mix = 0;
  for (const note of NOTES) {
    const env = envelope(t, note.start, note.end);
    if (env <= 0) continue;
    mix += brassVoice(note.freq, t) * env;
  }
  // master envelope: gentle fade-in 0..0.04s and fade-out 2.4..2.6s
  const masterIn = Math.min(1, t / 0.04);
  const masterOut = Math.max(0, 1 - Math.max(0, t - 2.4) / 0.2);
  mix *= masterIn * masterOut;
  if (Math.abs(mix) > peak) peak = Math.abs(mix);
  buf[i] = mix; // temporary — normalized below
}
// Normalize to ~80% of int16 range
const target = 0.78 * 32767;
const scale = peak > 0 ? target / peak : 1;
for (let i = 0; i < totalSamples; i++) {
  const t = i / SAMPLE_RATE;
  let mix = 0;
  for (const note of NOTES) {
    const env = envelope(t, note.start, note.end);
    if (env <= 0) continue;
    mix += brassVoice(note.freq, t) * env;
  }
  const masterIn = Math.min(1, t / 0.04);
  const masterOut = Math.max(0, 1 - Math.max(0, t - 2.4) / 0.2);
  mix *= masterIn * masterOut * scale;
  let v = Math.round(mix);
  if (v > 32767) v = 32767;
  if (v < -32768) v = -32768;
  buf[i] = v;
}

// WAV header
const dataSize = buf.length * 2;
const header = Buffer.alloc(44);
let p = 0;
header.write('RIFF', p);
p += 4;
header.writeUInt32LE(36 + dataSize, p);
p += 4;
header.write('WAVE', p);
p += 4;
header.write('fmt ', p);
p += 4;
header.writeUInt32LE(16, p);
p += 4; // PCM chunk size
header.writeUInt16LE(1, p);
p += 2; // PCM format
header.writeUInt16LE(1, p);
p += 2; // mono
header.writeUInt32LE(SAMPLE_RATE, p);
p += 4;
header.writeUInt32LE(SAMPLE_RATE * 2, p);
p += 4; // byte rate
header.writeUInt16LE(2, p);
p += 2; // block align
header.writeUInt16LE(16, p);
p += 2; // bits per sample
header.write('data', p);
p += 4;
header.writeUInt32LE(dataSize, p);

const dataBuf = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
const out = Buffer.concat([header, dataBuf]);
const outPath = path.join(__dirname, '..', 'assets', 'sounds', 'intro.wav');
fs.writeFileSync(outPath, out);
console.log(
  `Wrote ${outPath} — ${out.length} bytes, ${DURATION_S}s @ ${SAMPLE_RATE} Hz mono`
);
