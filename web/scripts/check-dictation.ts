/**
 * Replays speech-recognition result sequences through `joinTranscripts` (no microphone needed).
 * The Android sequence is what a real phone produced on Sep 28, reconstructed from its output
 * ("we we we need we need we need rice…"): Chrome re-sent the utterance so far as each final result.
 * Run from web/:  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-dictation.ts
 */
import {joinTranscripts, type Utterances} from '../src/app/ask/transcript.ts'

const PHONE_SCREENSHOT =
  'we we we need we need we need rice we need rice we need rice and we need rice and milk we need rice and milk we need rice and milk we need rice and milk for we need rice and milk for the week'
const SENTENCE = 'we need rice and milk for the week'
const ANDROID = [
  'we', 'we', 'we need', 'we need', 'we need rice', 'we need rice', 'we need rice and',
  'we need rice and milk', 'we need rice and milk', 'we need rice and milk',
  'we need rice and milk for', 'we need rice and milk for the week',
]

let failures = 0
function check(name: string, got: string, want: string) {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      got:  ${got}\n      want: ${want}`}`)
}

/** Every event's `results` list in a session → the text shown after each event. */
function replay(events: string[][], utterances: Utterances): string[] {
  return events.map((results) => joinTranscripts(results, utterances))
}

// 0. The reconstruction is right: the old code (append every final result) gives the phone's text.
check('old code reproduces the phone screenshot', ANDROID.join(' '), PHONE_SCREENSHOT)

// 1. Android, results list grows with cumulative "finals" (one utterance per tap).
const growing = replay(ANDROID.map((_, k) => ANDROID.slice(0, k + 1)), 'one')
check('android, growing list: final text', growing.at(-1)!, SENTENCE)
check('android, growing list: never shows a repeat', String(growing.every((text, k) => text === ANDROID[k])), 'true')

// 2. Android, one result replaced in place on every event.
check('android, replaced result', replay(ANDROID.map((text) => [text]), 'one').at(-1)!, SENTENCE)

// 3. Android revises an earlier word while you speak.
check('android, revised word', joinTranscripts(['we need rise', 'we need rice and milk'], 'one'), 'we need rice and milk')

// 4. Android sends the last final twice.
check('android, duplicated final', joinTranscripts([SENTENCE, SENTENCE], 'one'), SENTENCE)

// 5. Desktop Chrome, continuous: separate phrases, the last one still interim.
const desktop = replay(
  [['we need'], ['we need rice'], ['we need rice', ' and milk'], ['we need rice', ' and milk for the week']],
  'many',
)
check('desktop, separate phrases', desktop.at(-1)!, SENTENCE)
check('desktop, live text', desktop.join(' | '), 'we need | we need rice | we need rice and milk | we need rice and milk for the week')

// 6. Desktop: two sentences that start with the same word are both kept.
check('desktop, same first word kept', joinTranscripts(['I need rice.', ' I also need milk.'], 'many'), 'I need rice. I also need milk.')

// 7. Desktop, in case a browser re-sends like Android does (Safari has been reported to): still no repeats.
check('desktop, cumulative re-sends', joinTranscripts(ANDROID, 'many'), SENTENCE)

// 8. Words are never changed: punctuation and capitals come through as the recognizer sent them.
check('words kept as recognized', joinTranscripts(['We need rice,', 'We need rice, and milk.'], 'one'), 'We need rice, and milk.')

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
