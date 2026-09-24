import { useState, type FormEvent } from 'react'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/primitives'
import { ErrorBanner } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/form'
import { useAuth } from '@/store/auth'
import { isTelegram } from '@/lib/telegram'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const { login } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!username.trim()) errors.username = 'Loginni kiriting'
    if (!password) errors.password = 'Parolni kiriting'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (!validate()) return

    setLoading(true)
    try {
      await login(username.trim(), password)
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        setFieldErrors(error.fieldErrors)
      } else {
        setFormError('Kutilmagan xatolik yuz berdi')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            ◆
          </span>
          <div>
            <h1 className={styles.title}>Savdo platformasi</h1>
            <p className={styles.subtitle}>Diller va administrator kabineti</p>
          </div>
        </div>

        {isTelegram && (
          <p className={styles.note}>
            Mijozlar uchun ilova Telegram orqali avtomatik ochiladi. Bu sahifa diller va
            administratorlar uchun.
          </p>
        )}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {formError && <ErrorBanner message={formError} onClose={() => setFormError(null)} />}

          <Field label="Login" error={fieldErrors.username} required>
            {(id, invalid) => (
              <Input
                id={id}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                invalid={invalid}
                autoComplete="username"
                autoFocus
                placeholder="masalan: diller1"
              />
            )}
          </Field>

          <Field label="Parol" error={fieldErrors.password} required>
            {(id, invalid) => (
              <Input
                id={id}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                invalid={invalid}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            )}
          </Field>

          <Button type="submit" variant="primary" size="lg" block loading={loading}>
            Kirish
          </Button>
        </form>
      </div>
    </div>
  )
}
