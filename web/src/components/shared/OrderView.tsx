import type { ReactNode } from 'react'
import { StatusBadge } from '@/components/ui/primitives'
import { CANCELLED_BY_LABELS, dateTime, mapHref, money, number, telHref } from '@/lib/format'
import type { Order } from '@/lib/types'
import styles from './OrderView.module.css'

/** Buyurtmaning to'liq ko'rinishi — diller va superadmin panellarida bir xil ishlatiladi. */
export function OrderView({ order, actions }: { order: Order; actions?: ReactNode }) {
  const location = mapHref(order.latitude, order.longitude)
  const phone = telHref(order.customer_phone)

  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>Buyurtma #{order.id}</h3>
          <p className={styles.time}>{dateTime(order.created_at)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {order.status === 'cancelled' && (
        <div className={styles.cancelled}>
          <strong>
            {order.cancelled_by ? CANCELLED_BY_LABELS[order.cancelled_by] : 'Bekor qilindi'}
          </strong>
          {order.reject_reason && <p>Sabab: {order.reject_reason}</p>}
          {order.cancelled_at && <p className={styles.dim}>{dateTime(order.cancelled_at)}</p>}
        </div>
      )}

      {/* ---------- Mijoz ---------- */}
      <section className={styles.block}>
        <h4 className={styles.blockTitle}>Mijoz</h4>
        <dl className={styles.grid}>
          <div>
            <dt>Do‘kon</dt>
            <dd>{order.shop_name ?? '—'}</dd>
          </div>
          <div>
            <dt>Mas’ul shaxs</dt>
            <dd>{order.customer_name ?? '—'}</dd>
          </div>
          <div>
            <dt>Telefon</dt>
            <dd>
              {phone ? (
                <a className={styles.link} href={phone}>
                  {order.customer_phone}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Manzil</dt>
            <dd className={styles.wrap}>{order.delivery_address ?? '—'}</dd>
          </div>
          {location && (
            <div>
              <dt>Lokatsiya</dt>
              <dd>
                <a className={styles.link} href={location} target="_blank" rel="noreferrer">
                  Xaritada ochish ↗
                </a>
              </dd>
            </div>
          )}
          {order.diller_name && (
            <div>
              <dt>Diller</dt>
              <dd>{order.diller_name}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* ---------- Mahsulotlar ---------- */}
      <section className={styles.block}>
        <h4 className={styles.blockTitle}>Mahsulotlar ({order.items.length})</h4>
        <div className={styles.itemsWrap}>
          <table className={styles.items}>
            <thead>
              <tr>
                <th>Nomi</th>
                <th className={styles.right}>Miqdor</th>
                <th className={styles.right}>Narx</th>
                <th className={styles.right}>Summa</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className={styles.wrap}>{item.product_name}</td>
                  <td className={styles.right}>
                    {number(item.quantity)} {item.unit}
                  </td>
                  <td className={styles.right}>{money(item.unit_price)}</td>
                  <td className={`${styles.right} ${styles.strong}`}>{money(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className={styles.right}>
                  Jami
                </td>
                <td className={`${styles.right} ${styles.total}`}>{money(order.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {order.note && (
        <section className={styles.block}>
          <h4 className={styles.blockTitle}>Mijoz izohi</h4>
          <p className={styles.note}>{order.note}</p>
        </section>
      )}

      {/* ---------- Vaqtlar ---------- */}
      <section className={styles.block}>
        <h4 className={styles.blockTitle}>Vaqtlar</h4>
        <dl className={styles.grid}>
          <div>
            <dt>Yaratilgan</dt>
            <dd>{dateTime(order.created_at)}</dd>
          </div>
          {order.confirmed_at && (
            <div>
              <dt>Qabul qilingan</dt>
              <dd>{dateTime(order.confirmed_at)}</dd>
            </div>
          )}
          {order.delivered_at && (
            <div>
              <dt>Yetkazilgan</dt>
              <dd>{dateTime(order.delivered_at)}</dd>
            </div>
          )}
        </dl>
      </section>

      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}
