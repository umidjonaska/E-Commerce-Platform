import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PrimaryAction, Screen } from '../components/Screen'
import { Button } from '@/components/ui/primitives'
import { ErrorState, LoadingBlock } from '@/components/ui/feedback'
import { QuantityStepper } from '@/components/ui/form'
import { money, number } from '@/lib/format'
import { haptic } from '@/lib/telegram'
import { useToast } from '@/store/toast'
import { useCart } from '../cart'
import styles from './ProductPage.module.css'

export default function ProductPage() {
  const { productId } = useParams<{ productId: string }>()
  const id = Number(productId)
  const navigate = useNavigate()
  const cart = useCart()
  const toast = useToast()

  const productQuery = useQuery({
    queryKey: ['product', id],
    queryFn: ({ signal }) => api.product(id, signal),
    enabled: Number.isFinite(id),
  })

  const product = productQuery.data
  const inCart = cart.quantityOf(id)
  const [quantity, setQuantity] = useState(1)

  // Mahsulot yuklangach minimal miqdordan boshlaymiz (yoki savatdagi miqdordan)
  useEffect(() => {
    if (!product) return
    setQuantity(inCart > 0 ? inCart : product.min_quantity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id])

  if (!Number.isFinite(id)) {
    return (
      <Screen title="Mahsulot" back>
        <ErrorState error={new Error('Mahsulot topilmadi')} />
      </Screen>
    )
  }

  if (productQuery.isPending) {
    return (
      <Screen back>
        <LoadingBlock label="Mahsulot yuklanmoqda…" />
      </Screen>
    )
  }

  if (productQuery.isError || !product) {
    return (
      <Screen title="Mahsulot" back>
        <ErrorState error={productQuery.error} onRetry={() => productQuery.refetch()} />
      </Screen>
    )
  }

  const total = product.price * quantity
  const belowMin = quantity < product.min_quantity

  const addToCart = () => {
    if (belowMin) {
      haptic.error()
      toast.error(`Minimal miqdor: ${number(product.min_quantity)} ${product.unit}`)
      return
    }

    if (inCart > 0) {
      cart.setQuantity(product.id, quantity)
      toast.success('Savatdagi miqdor yangilandi')
    } else {
      cart.add(product, quantity)
      toast.success('Mahsulot savatga qo‘shildi')
    }
    navigate(-1)
  }

  return (
    <Screen back>
      <div className={styles.hero}>
        {product.image_url ? (
          <img className={styles.image} src={product.image_url} alt={product.name} />
        ) : (
          <div className={styles.imageFallback} aria-hidden="true">
            📦
          </div>
        )}
      </div>

      <div className={styles.info}>
        {product.category_name && (
          <span className={styles.category}>{product.category_name}</span>
        )}
        <h1 className={styles.name}>{product.name}</h1>
        <p className={styles.price}>
          {money(product.price)} <span className={styles.unit}>/ {product.unit}</span>
        </p>

        {product.description && <p className={styles.description}>{product.description}</p>}

        {product.min_quantity > 1 && (
          <p className={styles.minNote}>
            Minimal buyurtma: <strong>{number(product.min_quantity)} {product.unit}</strong>
          </p>
        )}
      </div>

      <div className={styles.quantityBlock}>
        <span className={styles.quantityLabel}>Miqdor</span>
        <QuantityStepper
          value={quantity}
          onChange={setQuantity}
          min={1}
          max={100000}
          unit={product.unit}
        />
      </div>

      <div className={styles.totalRow}>
        <span>Jami</span>
        <strong className={belowMin ? styles.totalInvalid : ''}>{money(total)}</strong>
      </div>

      {belowMin && (
        <p className={styles.warning}>
          Minimal miqdordan kam. Kamida {number(product.min_quantity)} {product.unit} kerak.
        </p>
      )}

      {inCart > 0 && (
        <div className={styles.inCartNote}>
          <span>
            Savatda: <strong>{number(inCart)} {product.unit}</strong>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              cart.remove(product.id)
              toast.info('Savatdan olib tashlandi')
              navigate(-1)
            }}
          >
            Olib tashlash
          </Button>
        </div>
      )}

      <PrimaryAction
        label={inCart > 0 ? 'Miqdorni yangilash' : 'Savatga qo‘shish'}
        onClick={addToCart}
        disabled={belowMin}
        hint={
          <>
            <span>{number(quantity)} {product.unit}</span>
            <strong>{money(total)}</strong>
          </>
        }
      />
    </Screen>
  )
}
