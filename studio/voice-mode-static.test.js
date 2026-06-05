// Static contract test for Meph's voice mode in the Studio.
//
// The talk-to-Meph feature is pure client-side JS embedded in studio.html
// (zero dependencies, Web Speech API only). It has no runtime harness, so it
// was nearly lost once when the Studio folder was renamed from playground/ to
// studio/ -- the only thing that saved it was that the rename copied the file
// wholesale. This test reads studio.html as text and asserts that every
// load-bearing piece of the voice loop is present, so the next refactor that
// touches the chat pane can't silently drop it.
//
// Run: node studio/voice-mode-static.test.js

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const studio = readFileSync(join(here, 'studio.html'), 'utf8');

let passCount = 0;
let failCount = 0;

function expectSource(condition, message) {
  if (condition) {
    passCount++;
    console.log(`  ok - ${message}`);
  } else {
    failCount++;
    console.log(`  not ok - ${message}`);
  }
}

console.log('Meph voice mode static contract\n');

// --- The control: tri-state Off / Speak / Converse ---
expectSource(
  /id=['"]voice-mode-group['"]/.test(studio),
  'voice mode control group is present in the chat pane'
);
expectSource(
  /data-mode=['"]off['"][\s\S]{0,80}setVoiceMode\(['"]off['"]\)/.test(studio),
  'Off button is wired to setVoiceMode'
);
expectSource(
  /data-mode=['"]speak['"][\s\S]{0,80}setVoiceMode\(['"]speak['"]\)/.test(studio),
  'Speak button is wired to setVoiceMode'
);
expectSource(
  /data-mode=['"]converse['"][\s\S]{0,80}setVoiceMode\(['"]converse['"]\)/.test(studio),
  'Converse button is wired to setVoiceMode'
);
expectSource(
  /window\.setVoiceMode\s*=\s*function/.test(studio),
  'setVoiceMode is the single source of truth for mode changes'
);

// --- Output: Meph speaks (text-to-speech) ---
expectSource(
  /new\s+SpeechSynthesisUtterance/.test(studio),
  'Meph replies are spoken via SpeechSynthesisUtterance'
);
expectSource(
  /function\s+pickElegantVoice/.test(studio) && /Google UK English Male/.test(studio),
  'a refined British male voice is preferred for Meph'
);
expectSource(
  /function\s+pushSpeakChunk/.test(studio),
  'streamed reply tokens are buffered for sentence-by-sentence speech'
);
expectSource(
  /function\s+cleanForTTS/.test(studio) && /\(code block\)/.test(studio),
  'markdown/code is stripped before speaking so Meph does not read symbols aloud'
);

// --- The streaming reply actually drives the speaker ---
expectSource(
  /pushSpeakChunk\(\s*ev\.delta\s*\)/.test(studio),
  'each streamed reply chunk is pushed to the speaker as it arrives'
);
expectSource(
  /['"]done['"][\s\S]{0,400}flushSpeakBuffer\(\)/.test(studio),
  'the final unspoken sentence is drained when the reply finishes'
);

// --- Input: the user speaks (speech-to-text) ---
expectSource(
  /window\.SpeechRecognition\s*\|\|\s*window\.webkitSpeechRecognition/.test(studio),
  'speech recognition is feature-detected across browsers'
);
expectSource(
  /function\s+buildRecognizer/.test(studio),
  'a continuous speech recognizer is built for converse mode'
);
expectSource(
  /silenceTimer[\s\S]{0,400}window\.sendChat\(\)/.test(studio),
  'a pause in speech auto-sends the recognized text to Meph'
);

// --- The "do not let Meph hear himself" guard ---
expectSource(
  /function\s+pauseListeningForSpeech/.test(studio) &&
    /function\s+resumeListeningAfterSpeech/.test(studio),
  'the mic pauses while Meph speaks and resumes afterward'
);
expectSource(
  /mode\s*===\s*['"]converse['"][\s\S]{0,120}pauseListeningForSpeech\(\)/.test(studio),
  'speech onstart pauses the mic in converse mode so it does not hear itself'
);

// --- Graceful degradation ---
expectSource(
  /not-allowed['"]\s*\|\|\s*ev\.error\s*===\s*['"]service-not-allowed/.test(studio),
  'a denied microphone falls back instead of breaking the chat'
);
expectSource(
  /Falling back to speak-only/.test(studio),
  'mic denial degrades converse to speak-only with a clear message'
);
expectSource(
  /localStorage\.setItem\(['"]clear\.voiceMode['"]/.test(studio),
  'the chosen voice mode is remembered across sessions'
);

console.log(`\n${'='.repeat(40)}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log('='.repeat(40));

if (failCount > 0) process.exit(1);
