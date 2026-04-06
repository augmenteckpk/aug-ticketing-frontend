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

const NO_MIC_TYPES = new Set([
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
  'file',
  'hidden',
  'checkbox',
  'radio',
  'range',
  'color',
  'password',
  'number',
  'submit',
  'button',
  'image',
  'reset',
])

/** Matches staff field chrome; borders live on the shell, not the inner input */
const FIELD_SHELL =
  'flex w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm transition-[box-shadow,border-color] focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500'

const INNER_INPUT_RESET =
  'min-h-0 min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-slate-900 shadow-none outline-none ring-0 placeholder:text-slate-400 focus:border-0 focus:ring-0 focus-visible:ring-0 disabled:cursor-not-allowed [color-scheme:inherit]'

function mergeRefs<E extends Element | null>(...refs: Array<Ref<E> | undefined>) {
  return (node: E | null) => {
    for (const r of refs) {
      if (!r) continue
      if (typeof r === 'function') r(node)
      else (r as MutableRefObject<E | null>).current = node
    }
  }
}

export type SpeechInputProps = ComponentPropsWithoutRef<'input'> & {
  speechLang?: string
  enableSpeech?: boolean
  /** Extra classes on the outer bordered shell (e.g. rounded-xl on login). */
  shellClassName?: string
}

/**
 * Text-like `<input>` with optional dictation (Web Speech API). Mic is omitted for
 * passwords, dates, checkboxes, files, etc.
 */
export const SpeechInput = forwardRef<HTMLInputElement, SpeechInputProps>(function SpeechInput(
  { className = '', shellClassName = '', speechLang, enableSpeech = true, disabled, readOnly, onChange, value, type, ...rest },
  ref,
) {
  const typeStr = type ?? 'text'
  const showMic = enableSpeech && !disabled && !readOnly && !NO_MIC_TYPES.has(typeStr)

  const innerRef = useRef<HTMLInputElement | null>(null)
  const sessionBaseRef = useRef('')
  const valueRef = useRef(value)
  valueRef.current = value

  const applyTranscript = useCallback(
    (full: string) => {
      if (!onChange) return
      const base = sessionBaseRef.current
      const merged = [base, full].filter((s) => s != null && String(s).trim() !== '').join(' ').trim()
      onChange({ target: { value: merged } } as ChangeEvent<HTMLInputElement>)
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
      <input
        ref={ref}
        type={type}
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
      className={`${FIELD_SHELL} ${shellClassName} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`.trim()}
      data-speech-field="input"
    >
      <input
        ref={mergeRefs(innerRef, ref)}
        type={type}
        className={`${INNER_INPUT_RESET} ${className} !rounded-none !border-0 !shadow-none !ring-0 focus:!ring-0 focus-visible:!ring-0`}
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
          `flex shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50/90 px-2.5 text-slate-500 transition-colors ` +
          `hover:bg-slate-100 hover:text-cyan-700 ` +
          `${isListening ? 'bg-cyan-50 text-cyan-700' : ''} ` +
          `focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-500`
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
