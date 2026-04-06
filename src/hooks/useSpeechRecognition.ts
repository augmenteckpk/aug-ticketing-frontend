import { useCallback, useEffect, useRef, useState } from 'react'
import { toastError, toastWarning } from '../lib/toast'

export type UseSpeechRecognitionOptions = {
  onTranscript?: (fullTranscript: string, finalTranscript: string, interimTranscript: string) => void
  lang?: string
  continuous?: boolean
  interimResults?: boolean
}

function pickLang(requested?: string) {
  if (requested?.trim()) return requested
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language
  return 'en-US'
}

/**
 * Browser Web Speech API (Chrome / Edge / Safari). Requires HTTPS or localhost.
 * Uses a ref for onTranscript so the recognition instance is not recreated every render.
 */
export function useSpeechRecognition({
  onTranscript,
  lang: langProp,
  continuous = true,
  interimResults = true,
}: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef('')
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  const lang = pickLang(langProp)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Ctor) {
      setIsSupported(false)
      return
    }

    setIsSupported(true)
    const recognition = new Ctor()
    recognition.continuous = continuous
    recognition.interimResults = interimResults
    recognition.lang = lang

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (!res?.[0]) continue
        const transcript = res[0].transcript
        if (res.isFinal) finalTranscript += transcript + ' '
        else interimTranscript += transcript
      }

      if (finalTranscript) transcriptRef.current += finalTranscript

      const cb = onTranscriptRef.current
      if (cb) {
        const base = transcriptRef.current.trim()
        const full =
          base + (interimTranscript ? (base ? ' ' : '') + interimTranscript : '')
        cb(full.trim(), finalTranscript.trim(), interimTranscript)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false)
      setError(event.error)

      switch (event.error) {
        case 'no-speech':
          toastWarning('No speech detected. Try again or speak closer to the mic.')
          break
        case 'audio-capture':
          toastError('No microphone found. Check your device.', 'Microphone')
          break
        case 'not-allowed':
          toastError('Microphone permission denied. Allow access in the browser bar.', 'Microphone')
          break
        case 'network':
          toastError('Speech recognition needs a network connection in some browsers.', 'Network')
          break
        case 'aborted':
          return
        default:
          toastWarning(`Speech recognition: ${event.error}`)
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      transcriptRef.current = ''
    }

    recognitionRef.current = recognition

    return () => {
      try {
        recognitionRef.current?.stop()
      } catch {
        /* ignore */
      }
      recognitionRef.current = null
    }
  }, [lang, continuous, interimResults])

  const startListening = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec) {
      toastError('Speech recognition is not supported in this browser.', 'Voice input')
      return
    }
    if (isListening) return

    try {
      transcriptRef.current = ''
      setError(null)
      rec.start()
      setIsListening(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('already started')) setIsListening(true)
      else toastError(e, 'Failed to start voice recognition')
    }
  }, [isListening])

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec || !isListening) return
    try {
      rec.stop()
      setIsListening(false)
      transcriptRef.current = ''
    } catch (e) {
      console.error(e)
      setIsListening(false)
    }
  }, [isListening])

  const toggleListening = useCallback(() => {
    if (isListening) stopListening()
    else startListening()
  }, [isListening, startListening, stopListening])

  const resetTranscript = useCallback(() => {
    transcriptRef.current = ''
  }, [])

  return {
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
  }
}
