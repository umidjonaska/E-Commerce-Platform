import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import styles from './form.module.css'

/* ------------------------------------------------------------------ */
/* Field — label + xato + izoh                                         */
/* ------------------------------------------------------------------ */

interface FieldProps {
  label: string
  error?: string | null
  hint?: ReactNode
  required?: boolean
  children: (id: string, invalid: boolean) => ReactNode
}

export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId()
  const invalid = Boolean(error)

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required && <span className={styles.required} aria-hidden="true"> *</span>}
      </label>
      {children(id, invalid)}
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'prefix'> {
  invalid?: boolean
  prefix?: ReactNode
}

export function Input({ invalid = false, prefix, ...rest }: InputProps) {
  if (prefix) {
    return (
      <div className={`${styles.inputWrap} ${invalid ? styles.invalid : ''}`}>
        <span className={styles.prefix}>{prefix}</span>
        <input className={styles.bareInput} aria-invalid={invalid || undefined} {...rest} />
      </div>
    )
  }
  return (
    <input
      className={`${styles.input} ${invalid ? styles.invalid : ''}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
}

export function Textarea({
  invalid = false,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & { invalid?: boolean }) {
  return (
    <textarea
      className={`${styles.textarea} ${invalid ? styles.invalid : ''}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
}

export function Select({
  invalid = false,
  children,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & { invalid?: boolean }) {
  return (
    <div className={styles.selectWrap}>
      <select
        className={`${styles.select} ${invalid ? styles.invalid : ''}`}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <span className={styles.selectArrow} aria-hidden="true">
        ▾
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Switch                                                              */
/* ------------------------------------------------------------------ */

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <label className={`${styles.switch} ${disabled ? styles.switchDisabled : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={styles.switchInput}
      />
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchThumb} />
      </span>
      <span className={styles.switchLabel}>{label}</span>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Miqdor tanlagich                                                    */
/* ------------------------------------------------------------------ */

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 100000,
  step = 1,
  unit,
  size = 'md',
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  size?: 'sm' | 'md'
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))

  return (
    <div className={`${styles.stepper} ${size === 'sm' ? styles.stepperSm : ''}`}>
      <button
        type="button"
        className={styles.stepperBtn}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label="Kamaytirish"
      >
        −
      </button>
      <input
        className={styles.stepperInput}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '')
          // Bo'sh maydonga ruxsat bermaymiz: minimal qiymatga qaytariladi
          onChange(digits ? clamp(Number(digits)) : min)
        }}
        aria-label="Miqdor"
      />
      {unit && <span className={styles.stepperUnit}>{unit}</span>}
      <button
        type="button"
        className={styles.stepperBtn}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label="Ko'paytirish"
      >
        +
      </button>
    </div>
  )
}
