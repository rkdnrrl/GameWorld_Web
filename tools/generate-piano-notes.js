#!/usr/bin/env node
/**
 * 피아노 음 24개 (C3 ~ B4, MIDI 48~71) WAV 파일 생성기.
 *
 * 실행:
 *   node tools/generate-piano-notes.js
 *
 * 출력:
 *   tools/piano-notes/piano-c3.wav, piano-cs3.wav, piano-d3.wav, ...
 *
 * 외부 의존성 없음 — Node.js fs + Buffer 만 사용. WAV PCM 16-bit mono 44.1kHz.
 *
 * 합성:
 *   - 사인파 fundamental + 4개 harmonic (배수 주파수, 감쇠 amplitude)
 *   - ADSR envelope: 빠른 attack (10ms), decay 150ms, sustain 0.4, release ~2s
 *   - harmonic 별로 다른 decay rate — 고역대가 먼저 사라져 따뜻한 piano 톤
 *   - 살짝 detune 으로 자연스러움
 *
 * 업로드: 24개 파일을 /assets 페이지에서 일괄 드래그·드롭. kind='audio' 자동.
 * 사용: spawn modal "오디오" 탭 또는 prefab 의 sound 컴포넌트에 attach.
 */

const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 44100;
const DURATION_SEC = 2.0;          // 2초 — sustain + release 포함
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SEC);
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;
const VOLUME = 0.7;                // 0~1. 너무 크면 clipping.

// 24음: C3 ~ B4 (MIDI 48~71) — 단음계 (반음 포함)
const NOTE_NAMES = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'];
const START_MIDI = 48;             // C3
const NUM_NOTES = 24;              // 2 octaves

/** MIDI 번호 → 주파수 (Hz). A4=440Hz 기준. */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** MIDI → "c3", "cs3" 등 파일명 안전 표기 */
function midiToNoteName(midi) {
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;  // MIDI 60 = C4
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * 한 음의 PCM 샘플 배열 생성 (Float32, -1 ~ +1 범위).
 * Piano 식 합성: harmonic 배수 + ADSR + 고역 빠른 감쇠.
 */
function synthesizeNote(freq) {
  const samples = new Float32Array(TOTAL_SAMPLES);

  // Harmonic 비중 — 1차 가장 강함, 고역 갈수록 약해짐.
  // 피아노는 보통 2, 3 차 harmonic 이 풍부 (warm tone).
  const harmonics = [
    { mul: 1.0, amp: 1.0,  decayPerSec: 0.8  },  // fundamental
    { mul: 2.0, amp: 0.55, decayPerSec: 1.6  },  // octave
    { mul: 3.0, amp: 0.30, decayPerSec: 2.4  },  // perfect 5th + octave
    { mul: 4.0, amp: 0.15, decayPerSec: 3.5  },  // 2 octaves
    { mul: 5.0, amp: 0.08, decayPerSec: 5.0  },  // higher
  ];

  // ADSR (초 단위)
  const attack  = 0.008;             // 8ms — 피아노 hammer strike
  const decay   = 0.15;              // 150ms — 초반 감쇠
  const sustainLevel = 0.4;          // attack peak 의 40%
  const release = DURATION_SEC - attack - decay;  // 나머지는 자연스러운 release

  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;

    // ADSR amplitude
    let env;
    if (t < attack) {
      env = t / attack;                                                       // 0 → 1
    } else if (t < attack + decay) {
      const x = (t - attack) / decay;
      env = 1 - (1 - sustainLevel) * x;                                       // 1 → sustainLevel
    } else {
      const x = (t - attack - decay) / release;
      env = sustainLevel * Math.exp(-3 * x);                                  // exponential release
    }

    // Harmonic 합산 — 각 harmonic 은 시간에 따라 따로 감쇠
    let sample = 0;
    for (const h of harmonics) {
      const hAmp = h.amp * Math.exp(-h.decayPerSec * t);
      sample += Math.sin(2 * Math.PI * freq * h.mul * t) * hAmp;
    }
    // 정규화 (전체 max amplitude 약 2.08 일 수 있어 살짝 줄임)
    samples[i] = sample * 0.5 * env * VOLUME;
  }

  return samples;
}

/**
 * Float32 [-1, 1] 샘플 → WAV PCM 16-bit mono buffer.
 * 표준 RIFF/WAVE 형식.
 */
function samplesToWavBuffer(samples) {
  const dataSize = samples.length * (BITS_PER_SAMPLE / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);                                                  // chunk size
  buffer.writeUInt16LE(1, 20);                                                   // PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE / 8, 28);        // byte rate
  buffer.writeUInt16LE(CHANNELS * BITS_PER_SAMPLE / 8, 32);                      // block align
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // 16-bit signed PCM samples (little-endian)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const intVal = Math.round(clamped * 32767);
    buffer.writeInt16LE(intVal, 44 + i * 2);
  }

  return buffer;
}

// ── main ────────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, 'piano-notes');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log(`🎹 Generating ${NUM_NOTES} piano notes...`);
console.log(`   Range: MIDI ${START_MIDI} (${midiToNoteName(START_MIDI)}) ~ ${START_MIDI + NUM_NOTES - 1} (${midiToNoteName(START_MIDI + NUM_NOTES - 1)})`);
console.log(`   Format: ${SAMPLE_RATE}Hz mono ${BITS_PER_SAMPLE}-bit PCM, ${DURATION_SEC}s each`);
console.log(`   Output: ${outDir}\n`);

for (let i = 0; i < NUM_NOTES; i++) {
  const midi = START_MIDI + i;
  const freq = midiToFreq(midi);
  const name = midiToNoteName(midi);
  const samples = synthesizeNote(freq);
  const wav = samplesToWavBuffer(samples);
  const filename = `piano-${name}.wav`;
  fs.writeFileSync(path.join(outDir, filename), wav);
  console.log(`  ✓ ${filename}  (${freq.toFixed(2)} Hz, ${(wav.length / 1024).toFixed(1)} KB)`);
}

console.log(`\n✅ Done. ${NUM_NOTES} WAV files in ${outDir}`);
console.log('\nNext: /assets 페이지에서 24개 파일 일괄 드래그·드롭 (kind=audio 자동).');
