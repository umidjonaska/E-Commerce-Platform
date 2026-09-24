import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { setClosingConfirmation } from '@/lib/telegram'
import type { Product } from '@/lib/types'

const STORAGE_KEY = 'dp_cart_v1'

/**
 * Savatda mahsulotning ko'rinishi uchun nusxa saqlanadi, lekin YAKUNIY NARXNI
 * doim backend hisoblaydi. Savat sahifasi ochilganda ma'lumotlar serverdan
 * qayta tekshiriladi (narx o'zgargan yoki mahsulot olib qo'yilgan bo'lishi mumkin).
 */
export interface CartLine {
  product_id: number
  quantity: number
  name: string
  price: number
  unit: string
  min_quantity: number
  image_url: string | null
}

interface CartApi {
  lines: CartLine[]
  count: number
  /** Taxminiy summa — yakuniy summani server tasdiqlaydi */
  subtotal: number
  add: (product: Product, quantity: number) => void
  setQuantity: (productId: number, quantity: number) => void
  remove: (productId: number) => void
  clear: () => void
  quantityOf: (productId: number) => number
  /** Serverdan kelgan ro'yxat asosida savatni yangilaydi; yo'qolganlarni qaytaradi */
  reconcile: (products: Product[]) => string[]
  replaceAll: (lines: CartLine[]) => void
}

const CartContext = createContext<CartApi | null>(null)

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (line): line is CartLine =>
        line &&
        typeof line.product_id === 'number' &&
        typeof line.quantity === 'number' &&
        line.quantity > 0,
    )
  } catch {
    return []
  }
}

function save(lines: CartLine[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  } catch {
    /* xotira to'la yoki bloklangan bo'lsa savat faqat sessiya davomida yashaydi */
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load)

  useEffect(() => {
    save(lines)
    // Savat bo'sh bo'lmasa, Mini App tasodifan yopilib ketmasligi uchun tasdiq so'raladi
    setClosingConfirmation(lines.length > 0)
  }, [lines])

  const add = useCallback((product: Product, quantity: number) => {
    setLines((current) => {
      const existing = current.find((line) => line.product_id === product.id)
      const snapshot = {
        name: product.name,
        price: product.price,
        unit: product.unit,
        min_quantity: product.min_quantity,
        image_url: product.image_url,
      }
      if (existing) {
        return current.map((line) =>
          line.product_id === product.id
            ? { ...line, ...snapshot, quantity: line.quantity + quantity }
            : line,
        )
      }
      return [...current, { product_id: product.id, quantity, ...snapshot }]
    })
  }, [])

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.product_id !== productId)
        : current.map((line) => (line.product_id === productId ? { ...line, quantity } : line)),
    )
  }, [])

  const remove = useCallback((productId: number) => {
    setLines((current) => current.filter((line) => line.product_id !== productId))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const replaceAll = useCallback((next: CartLine[]) => setLines(next), [])

  const reconcile = useCallback((products: Product[]) => {
    const byId = new Map(products.map((product) => [product.id, product]))
    const removed: string[] = []

    setLines((current) => {
      const next: CartLine[] = []
      for (const line of current) {
        const product = byId.get(line.product_id)
        if (!product) {
          removed.push(line.name)
          continue
        }
        next.push({
          ...line,
          name: product.name,
          price: product.price,
          unit: product.unit,
          min_quantity: product.min_quantity,
          image_url: product.image_url,
          quantity: Math.max(line.quantity, product.min_quantity),
        })
      }
      return next
    })

    return removed
  }, [])

  const value = useMemo<CartApi>(() => {
    const count = lines.reduce((sum, line) => sum + line.quantity, 0)
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
    return {
      lines,
      count,
      subtotal,
      add,
      setQuantity,
      remove,
      clear,
      replaceAll,
      reconcile,
      quantityOf: (productId) =>
        lines.find((line) => line.product_id === productId)?.quantity ?? 0,
    }
  }, [lines, add, setQuantity, remove, clear, replaceAll, reconcile])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartApi {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart faqat CartProvider ichida ishlaydi')
  return context
}
