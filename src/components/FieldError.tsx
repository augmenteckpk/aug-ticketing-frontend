type Props = {
  message?: string | null;
  id?: string;
}

export function FieldError({ message, id }: Props) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-red-600" role="alert">
      {message}
    </p>
  )
}

/** Border/ring for invalid inputs — add next to ui.input */
export const invalidInputClass = 'border-red-400 focus:border-red-500 focus:ring-red-500/20'

