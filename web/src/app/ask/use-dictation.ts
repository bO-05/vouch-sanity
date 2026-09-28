'use client'

import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react'
import {joinTranscripts, type Utterances} from './transcript'

/**
 * Voice input through the browser's own speech recognition (Web Speech API).
 * Chrome, Edge and Safari support it; Firefox doesn't, so typing always works too.
 * The words appear in the story box as they're recognized, and the requester reviews them before
 * submitting. Vouch never rewrites them.
 *
 * Android: Chrome's continuous mode re-sends results there (see transcript.ts), so each tap records
 * one utterance and stops at a pause; tapping again adds more.
 */

type Alternative = {transcript: string}
type Result = {isFinal: boolean; length: number; [index: number]: Alternative}
type ResultEvent = {results: {length: number; [index: number]: Result}}
type ErrorEvent = {error: string}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: ResultEvent) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionConstructor = new () => Recognition

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent)
}

/** BCP 47 locales for the languages Vouch offers. */
const SPEECH_LOCALES: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  uk: 'uk-UA',
  fr: 'fr-FR',
  pt: 'pt-BR',
  ar: 'ar-SA',
  tl: 'fil-PH',
  id: 'id-ID',
  sw: 'sw-KE',
}

function describeError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was blocked. Allow it in the address bar, or type instead.'
    case 'no-speech':
      return 'No speech was heard. Try again, closer to the microphone.'
    case 'audio-capture':
      return 'No microphone was found.'
    case 'network':
      return "Speech recognition needs a network connection (your browser's speech service is online)."
    case 'language-not-supported':
      return "This browser can't recognize speech in that language. Please type instead."
    case 'aborted':
      return ''
    default:
      return `Speech recognition stopped (${code}).`
  }
}

const noSubscription = () => () => {}

/**
 * `onText` gets the whole text of the current recording session (final and interim words) every time
 * it changes. The caller shows it after whatever was in the box when the session started.
 */
export function useDictation(language: string, onText: (sessionText: string) => void) {
  const supported = useSyncExternalStore(
    noSubscription,
    () => recognitionConstructor() !== null,
    () => false,
  )
  const stopsAtPause = useSyncExternalStore(noSubscription, isAndroid, () => false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)

  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  useEffect(() => () => recognition.current?.abort(), [])

  const stop = useCallback(() => recognition.current?.stop(), [])

  const start = useCallback(() => {
    const Constructor = recognitionConstructor()
    if (!Constructor) return
    recognition.current?.abort()
    const instance = new Constructor()
    const utterances: Utterances = isAndroid() ? 'one' : 'many'
    instance.lang = SPEECH_LOCALES[language] ?? navigator.language
    instance.continuous = utterances === 'many'
    instance.interimResults = true
    instance.onresult = (event) => {
      if (recognition.current !== instance) return
      // Rebuilt from every result of the session, not just the new ones, so re-sent results replace.
      const transcripts: string[] = []
      for (let i = 0; i < event.results.length; i++) transcripts.push(event.results[i]?.[0]?.transcript ?? '')
      const text = joinTranscripts(transcripts, utterances)
      if (text) onTextRef.current(text)
    }
    instance.onerror = (event) => {
      if (recognition.current !== instance) return
      const message = describeError(event.error)
      if (message) setError(message)
    }
    instance.onend = () => {
      // An aborted older session must not switch off the new one.
      if (recognition.current !== instance) return
      recognition.current = null
      setListening(false)
    }
    setError(null)
    try {
      instance.start()
      recognition.current = instance
      setListening(true)
    } catch (startError) {
      setError(`Couldn't start speech recognition: ${startError instanceof Error ? startError.message : 'unknown error'}`)
    }
  }, [language])

  return {supported, stopsAtPause, listening, error, start, stop}
}
