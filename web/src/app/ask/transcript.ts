/**
 * Turns one speech-recognition session's results into one transcript. Pure (no React, no browser
 * APIs): the dictation hook uses it, and `web/scripts/check-dictation.ts` replays sequences through it.
 *
 * Why: Chrome on Android sends the whole utterance so far as each new result and marks them final
 * ("we", "we need", "we need rice"…). Appending every final result, like the classic Web Speech demo,
 * printed "we we we need we need we need rice…" on a real phone (Sep 28). So the text is rebuilt from
 * ALL of the session's results on every event, and a result that re-sends the previous one replaces
 * it instead of being added. Nothing is reworded: every word shown is a word the recognizer returned.
 */

/**
 * - 'one': the session holds one utterance (Vouch asks Android for exactly that), so every result is
 *   a newer guess at the same words: the latest wins when it starts with the same word.
 * - 'many': results are separate phrases (desktop Chrome and Safari, continuous mode). Only a re-send
 *   of the previous phrase (the same words, possibly longer, or a near copy of a long phrase) replaces it.
 */
export type Utterances = 'one' | 'many'

type Part = {shown: string[]; keys: string[]}

/** Letters and digits only, lowercased, so "Rice," and "rice" compare equal. */
function keyOf(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function isPrefix(short: string[], long: string[]): boolean {
  return short.length <= long.length && short.every((word, index) => word === long[index])
}

/** Word-level edit distance (substitutions, insertions, deletions). */
function distance(a: string[], b: string[]): number {
  let previous = Array.from({length: b.length + 1}, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)))
    }
    previous = current
  }
  return previous[b.length]
}

/** Does `next` re-send `previous` (the same words so far, maybe revised, maybe longer)? */
function resends(previous: string[], next: string[], utterances: Utterances): boolean {
  if (previous[0] !== next[0]) return false
  if (utterances === 'one') return true
  if (next.length < previous.length) return false
  const head = next.slice(0, previous.length)
  if (isPrefix(previous, head)) return true
  return previous.length >= 4 && distance(previous, head) <= Math.floor(previous.length / 4)
}

export function joinTranscripts(transcripts: readonly string[], utterances: Utterances): string {
  const parts: Part[] = []
  for (const transcript of transcripts) {
    const shown = transcript.trim().split(/\s+/).filter(Boolean)
    if (shown.length === 0) continue
    const part: Part = {shown, keys: shown.map(keyOf)}
    const last = parts.at(-1)
    if (!last) {
      parts.push(part)
    } else if (resends(last.keys, part.keys, utterances)) {
      parts[parts.length - 1] = part
    } else if (utterances === 'many' && isPrefix(part.keys, last.keys)) {
      // An older, shorter copy of the previous phrase: keep the longer one.
    } else {
      parts.push(part)
    }
  }
  return parts.map((part) => part.shown.join(' ')).join(' ')
}
