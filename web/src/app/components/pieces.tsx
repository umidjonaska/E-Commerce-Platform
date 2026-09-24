import { Link } from 'react-router-dom'
import { StatusBadge } from '@/components/ui/primitives'
import { dateTime, money, number } from '@/lib/format'
import type { Order, Product } from '@/lib/types'
import styles from './pieces.module.css'

/** Mahsulot rasmi yoki o'rniga chiziladigan belgi. */
export function ProductThumb({
  url,
  name,
  size = 56,
}: {
  url: string | null
  name: string
  size?: number
}) {
  if (!url) {
    return (
      <span
        className={styles.thumbFallback}
        style={{ width: size, height: size, fontSize: Math.round(size / 2.4) }}
        aria-hidden="true"
      >
        📦
      </span>
    )
  }
  return (
    <img
      className={styles.thumb}
      src={url}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      onError={(event) => {
        // Rasm o'chirilgan bo'lsa ham layout buzilmasligi kerak
        event.currentTarget.style.display = 'none'
      }}
    />
  )
}

export function ProductRow({
  product,
  right,
  to,
}: {
  product: Product
  right?: React.ReactNode
  to?: string
}) {
  const content = (
    <>
      <ProductThumb url={product.image_url} name={product.name} />
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{product.name}</span>
        <span className={styles.rowMeta}>
          {money(product.price)} / {product.unit}
        </span>
        {product.min_quantity > 1 && (
          <span className={styles.rowHint}>
            Minimal: {number(product.min_quantity)} {product.unit}
          </span>
        )}
      </span>
      {right && <span className={styles.rowRight}>{right}</span>}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={styles.row}>
        {content}
      </Link>
    )
  }
  return <div className={styles.row}>{content}</div>
}

export function OrderCard({ order }: { order: Order }) {
  return (
    <Link to={`/app/orders/${order.id}`} className={styles.orderCard}>
      <div className={styles.orderTop}>
        <span className={styles.orderId}>Buyurtma #{order.id}</span>
        <StatusBadge status={order.status} size="sm" />
      </div>

      <div className={styles.orderItems}>
        {order.items.slice(0, 2).map((item) => (
          <span key={item.id} className={styles.orderItem}>
            {item.product_name} · {number(item.quantity)} {item.unit}
          </span>
        ))}
        {order.items.length > 2 && (
          <span className={styles.orderMore}>va yana {order.items.length - 2} ta mahsulot</span>
        )}
      </div>

      <div className={styles.orderBottom}>
        <span className={styles.orderDate}>{dateTime(order.created_at)}</span>
        <span className={styles.orderTotal}>{money(order.total_amount)}</span>
      </div>
    </Link>
  )
}
