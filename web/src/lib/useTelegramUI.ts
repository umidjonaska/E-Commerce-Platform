import { useEffect, useRef } from 'react'
import { webApp } from './telegram'

/**
 * Telegram MainButton'ni boshqaradi.
 *
 * `visible=false` bo'lsa tugma yashiriladi. Komponent yo'q bo'lganda tugma
 * o'chiriladi, shuning uchun sahifalar orasida "osilib qolmaydi".
 */
export function useMainButton(options: {
  text: string
  visible: boolean
  loading?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const { text, visible, loading = false, disabled = false, onClick } = options

  // onClick har renderda yangilanadi — handlerni qayta bog'lamaslik uchun ref
  const handlerRef = useRef(onClick)
  handlerRef.current = onClick

  useEffect(() => {
    const button = webApp?.MainButton
    if (!button) return

    const handle = () => handlerRef.current()
    button.onClick(handle)
    return () => {
      button.offClick(handle)
      button.hide()
      button.hideProgress()
    }
  }, [])

  useEffect(() => {
    const button = webApp?.MainButton
    if (!button) return

    if (!visible) {
      button.hide()
      return
    }

    button.setText(text)
    button.show()

    if (loading) button.showProgress(false)
    else button.hideProgress()

    if (disabled || loading) button.disable()
    else button.enable()
  }, [text, visible, loading, disabled])
}

/**
 * Telegram BackButton'ni boshqaradi. `onBack` berilmasa tugma ko'rsatilmaydi.
 */
export function useBackButton(onBack: (() => void) | null) {
  const handlerRef = useRef(onBack)
  handlerRef.current = onBack

  useEffect(() => {
    const button = webApp?.BackButton
    if (!button) return

    const handle = () => handlerRef.current?.()
    button.onClick(handle)
    return () => {
      button.offClick(handle)
      button.hide()
    }
  }, [])

  useEffect(() => {
    const button = webApp?.BackButton
    if (!button) return
    if (onBack) button.show()
    else button.hide()
  }, [onBack])
}
