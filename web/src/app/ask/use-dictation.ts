'use client'

import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react'

/**
 * Voice input through the browser's own speech recognition (Web Speech API).
 * Chrome, Edge and Safari support it; Firefox doesn't, so typing always works too.
 * The transcript lands in the story box, where the requester reviews it before submitting.
 * Vouch never rewrites it.
 */

type Alternative = {transcript: string}
type Result = {isFinal: boolean; length: number; [index: number]: Alternative}
type ResultEvent = {resultIndex: number; results: {length: number; [index: number]: Result}}
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

export function useDictation(language: string, onFinalText: (text: string) => void) {
  const supported = useSyncExternalStore(
    noSubscription,
    () => recognitionConstructor() !== null,
    () => false,
  )
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const onFinal = useRef(onFinalText)

  useEffect(() => {
    onFinal.current = onFinalText
  }, [onFinalText])

  useEffect(() => () => recognition.current?.abort(), [])

  const stop = useCallback(() => recognition.current?.stop(), [])

  const start = useCallback(() => {
    const Constructor = recognitionConstructor()
    if (!Constructor) return
    recognition.current?.abort()
    const instance = new Constructor()
    instance.lang = SPEECH_LOCALES[language] ?? navigator.language
    instance.continuous = true
    instance.interimResults = true
    instance.onresult = (event) => {
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          if (text.trim()) onFinal.current(text.trim())
        } else {
          pending += text
        }
      }
      setInterim(pending)
    }
    instance.onerror = (event) => {
      const message = describeError(event.error)
      if (message) setError(message)
    }
    instance.onend = () => {
      setListening(false)
      setInterim('')
      if (recognition.current === instance) recognition.current = null
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

  return {supported, listening, interim, error, start, stop}
}
