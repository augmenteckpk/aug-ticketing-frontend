import {
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type MutableRefObject,
  type Ref,
  forwardRef,
  useCallback,
  useRef,
} from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'

const TEXTAREA_SHELL =
  'relative w-full min-w-0 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm transition-[box-shadow,border-color] focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500'

const INNER_TEXTAREA_RESET =
  'block w-full resize-y border-0 bg-transparent px-3 py-2 pr-12 text-sm text-slate-900 shadow-none outline-none ring-0 placeholder:text-slate-400 focus:border-0 focus:ring-0 focus-visible:ring-0 disabled:cursor-not-allowed [color-scheme:inherit]'

function mergeRefs<E extends Element | null>(...refs: Array<Ref<E> | undefined>) {
  return (node: E | null) => {
    for (const r of refs) {
      if (!r) continue
      if (typeof r === 'function') r(node)
      else (r as MutableRefObject<E | null>).current = node
    }
  }
}

export type SpeechTextareaProps = ComponentPropsWithoutRef<'textarea'> & {
  speechLang?: string
  enableSpeech?: boolean
  shellClassName?: string
}

export const SpeechTextarea = forwardRef<HTMLTextAreaElement, SpeechTextareaProps>(function SpeechTextarea(
  { className = '', shellClassName = '', speechLang, enableSpeech = true, disabled, readOnly, onChange, value, ...rest },
  ref,
) {
  const showMic = enableSpeech && !disabled && !readOnly

  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const sessionBaseRef = useRef('')
  const valueRef = useRef(value)
  valueRef.current = value

  const applyTranscript = useCallback(
    (full: string) => {
      if (!onChange) return
      const base = sessionBaseRef.current
      const merged = [base, full].filter((s) => s != null && String(s).trim() !== '').join(' ').trim()
      onChange({ target: { value: merged } } as ChangeEvent<HTMLTextAreaElement>)
    },
    [onChange],
  )

  const { isListening, isSupported, startListening, stopListening } = useSpeechRecognition({
    lang: speechLang,
    onTranscript: (full) => applyTranscript(full),
  })

  const onMicClick = () => {
    if (isListening) {
      stopListening()
      return
    }
    const domVal = innerRef.current?.value ?? ''
    sessionBaseRef.current = valueRef.current !== undefined && valueRef.current !== null ? String(valueRef.current) : domVal
    startListening()
  }

  if (!showMic || !isSupported) {
    return (
      <textarea
        ref={ref}
        className={className}
        disabled={disabled}
        readOnly={readOnly}
        onChange={onChange}
        value={value}
        {...rest}
      />
    )
  }

  return (
    <div
      className={`${TEXTAREA_SHELL} ${shellClassName} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`.trim()}
      data-speech-field="textarea"
    >
      <textarea
        ref={mergeRefs(innerRef, ref)}
        className={`${INNER_TEXTAREA_RESET} ${className} !rounded-none !border-0 !shadow-none !ring-0 focus:!ring-0 focus-visible:!ring-0`}
        disabled={disabled}
        readOnly={readOnly}
        onChange={onChange}
        value={value}
        {...rest}
      />
      <button
        type="button"
        onClick={onMicClick}
        className={
          `absolute right-2 top-2 z-[1] flex size-8 items-center justify-center rounded-md border border-slate-200/90 bg-white/95 text-slate-500 shadow-sm ` +
          `backdrop-blur-[2px] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-red-700 ` +
          `${isListening ? 'border-red-200 bg-red-50 text-red-700' : ''} ` +
          `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-red-500`
        }
        aria-label={isListening ? 'Stop dictation' : 'Dictate text'}
        aria-pressed={isListening}
        title={isListening ? 'Stop dictation' : 'Dictate'}
      >
        {isListening ? <MicOff className="size-4" strokeWidth={2} aria-hidden /> : <Mic className="size-4" strokeWidth={2} aria-hidden />}
      </button>
    </div>
  )
})

