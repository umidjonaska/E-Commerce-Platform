import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { Badge, Button, InfoRow } from '@/components/ui/primitives'
import { ConfirmDialog, EmptyState, ErrorBanner, ErrorState, Modal, SkeletonList } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { DataTable, PageHeader, Pagination, SearchInput, Toolbar, type Column } from '@/components/ui/data'
import { date, mapHref, money, number, telHref } from '@/lib/format'
import { useToast } from '@/store/toast'
import type { AdminUser } from '@/lib/types'
import styles from '@/styles/pages.module.css'

const PAGE_SIZE = 20

export default function AdminUsers() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [dillerFilter, setDillerFilter] = useState('')
  const [blocked, setBlocked] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)

  const [viewing, setViewing] = useState<AdminUser | null>(null)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [reassigning, setReassigning] = useState<AdminUser | null>(null)
  const [toggling, setToggling] = useState<AdminUser | null>(null)

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    shop_name: '',
    shop_phone: '',
    address: '',
  })
  const [newDillerId, setNewDillerId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', search, dillerFilter, blocked, page],
    queryFn: ({ signal }) =>
      api.admin.users(
        {
          q: search || undefined,
          diller_id: dillerFilter ? Number(dillerFilter) : undefined,
          blocked: blocked === '' ? undefined : blocked === 'true',
          page,
          size: PAGE_SIZE,
        },
        signal,
      ),
  })

  // Filtr va biriktirish uchun dillerlar ro'yxati
  const dillersQuery = useQuery({
    queryKey: ['admin', 'dillers', 'all-for-select'],
    queryFn: ({ signal }) => api.admin.dillers({ size: 100 }, signal),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  const closeEdit = () => {
    setEditing(null)
    setErrors({})
    setFormError(null)
  }

  const updateUser = useMutation({
    mutationFn: () =>
      api.admin.updateUser(editing!.id, {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        shop_name: form.shop_name.trim(),
        shop_phone: form.shop_phone.trim() || null,
        address: form.address.trim() || null,
      }),
    onSuccess: (user) => {
      toast.success('Mijoz ma’lumotlari yangilandi')
      setViewing((current) => (current && current.id === user.id ? user : current))
      closeEdit()
      refresh()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFormError(error.message)
        setErrors(error.fieldErrors)
      } else {
        setFormError('Kutilmagan xatolik yuz berdi')
      }
    },
  })

  const reassign = useMutation({
    mutationFn: () => api.admin.reassignUser(reassigning!.id, Number(newDillerId)),
    onSuccess: (user) => {
      toast.success(`Mijoz "${user.shop?.diller?.name ?? 'yangi diller'}"ga o‘tkazildi`)
      setViewing((current) => (current && current.id === user.id ? user : current))
      setReassigning(null)
      setNewDillerId('')
      refresh()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'O‘tkazib bo‘lmadi')
    },
  })

  const toggleBlock = useMutation({
    mutationFn: (user: AdminUser) =>
      user.is_blocked ? api.admin.unblockUser(user.id) : api.admin.blockUser(user.id),
    onSuccess: (user) => {
      toast.success(user.is_blocked ? 'Mijoz bloklandi' : 'Mijoz blokdan chiqarildi')
      setViewing((current) => (current && current.id === user.id ? user : current))
      setToggling(null)
      refresh()
    },
    onError: (error) => {
      setToggling(null)
      toast.error(error instanceof ApiError ? error.message : 'Amalni bajarib bo‘lmadi')
    },
  })

  const openEdit = (user: AdminUser) => {
    setEditing(user)
    setErrors({})
    setFormError(null)
    setForm({
      full_name: user.full_name ?? '',
      phone: user.phone ?? '',
      shop_name: user.shop?.name ?? '',
      shop_phone: user.shop?.phone ?? '',
      address: user.shop?.address ?? '',
    })
  }

  const submitEdit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const next: Record<string, string> = {}
    if (form.full_name.trim().length < 2) next.full_name = 'Ismni kiriting'
    if (form.shop_name.trim().length < 2) next.shop_name = 'Do‘kon nomini kiriting'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    updateUser.mutate()
  }

  const data = usersQuery.data
  const dillers = dillersQuery.data?.items ?? []

  const columns: Column<AdminUser>[] = [
    {
      key: 'shop',
      header: 'Do‘kon',
      primary: true,
      render: (user) => (
        <div className={styles.cellStack}>
          <span className={styles.cellStrong}>{user.shop?.name ?? '—'}</span>
          <span className={styles.cellMuted}>{user.full_name ?? user.username}</span>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Telefon',
      render: (user) => {
        const phone = user.shop?.phone ?? user.phone
        return phone ? (
          <a
            className={styles.link}
            href={telHref(phone) ?? undefined}
            onClick={(event) => event.stopPropagation()}
          >
            {phone}
          </a>
        ) : (
          '—'
        )
      },
    },
    {
      key: 'diller',
      header: 'Diller',
      render: (user) =>
        user.shop?.diller ? (
          user.shop.diller.name
        ) : (
          <Badge tone="warning">Biriktirilmagan</Badge>
        ),
    },
    {
      key: 'orders',
      header: 'Buyurtma',
      align: 'right',
      render: (user) => number(user.orders_count),
    },
    {
      key: 'spent',
      header: 'Xaridlar',
      align: 'right',
      render: (user) => <span className={styles.cellStrong}>{money(user.total_spent)}</span>,
    },
    {
      key: 'status',
      header: 'Holat',
      render: (user) =>
        user.is_blocked ? (
          <Badge tone="danger" dot>
            Bloklangan
          </Badge>
        ) : (
          <Badge tone="success" dot>
            Faol
          </Badge>
        ),
    },
    {
      key: 'created',
      header: 'Qo‘shilgan',
      hideOnMobile: true,
      render: (user) => <span className={styles.cellMuted}>{date(user.created_at)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Mijozlar va do‘konlar"
        subtitle={data ? `${data.total} ta do‘kon` : 'Yuklanmoqda…'}
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          placeholder="Do‘kon, ism, telefon yoki manzil"
        />
        <div style={{ minWidth: 190 }}>
          <Select
            value={dillerFilter}
            onChange={(event) => {
              setDillerFilter(event.target.value)
              setPage(1)
            }}
            aria-label="Diller bo‘yicha filtr"
          >
            <option value="">Barcha dillerlar</option>
            {dillers.map((diller) => (
              <option key={diller.id} value={diller.id}>
                {diller.company_name || diller.full_name || diller.username}
              </option>
            ))}
          </Select>
        </div>
        <div style={{ minWidth: 160 }}>
          <Select
            value={blocked}
            onChange={(event) => {
              setBlocked(event.target.value as '' | 'true' | 'false')
              setPage(1)
            }}
            aria-label="Holat bo‘yicha filtr"
          >
            <option value="">Barcha holatlar</option>
            <option value="false">Faqat faol</option>
            <option value="true">Faqat bloklangan</option>
          </Select>
        </div>
      </Toolbar>

      {usersQuery.isPending && <SkeletonList rows={5} height={68} />}

      {usersQuery.isError && (
        <ErrorState error={usersQuery.error} onRetry={() => usersQuery.refetch()} />
      )}

      {usersQuery.isSuccess && data && data.items.length === 0 && (
        <EmptyState
          icon="🏪"
          title={search || dillerFilter || blocked ? 'Hech narsa topilmadi' : 'Hali mijoz yo‘q'}
          description={
            search || dillerFilter || blocked
              ? 'Filtrlarni o‘zgartirib ko‘ring.'
              : 'Mijozlar Telegram ilovasi orqali ro‘yxatdan o‘tadi.'
          }
          action={
            search || dillerFilter || blocked ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setDillerFilter('')
                  setBlocked('')
                }}
              >
                Filtrlarni tozalash
              </Button>
            ) : undefined
          }
        />
      )}

      {usersQuery.isSuccess && data && data.items.length > 0 && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(user) => user.id}
            onRowClick={(user) => setViewing(user)}
          />
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
        </>
      )}

      {/* ---------- Tafsilot ---------- */}
      <Modal
        open={viewing !== null}
        title={viewing?.shop?.name ?? 'Mijoz'}
        onClose={() => setViewing(null)}
        size="md"
        footer={
          viewing && (
            <>
              <Button onClick={() => openEdit(viewing)}>Tahrirlash</Button>
              <Button
                onClick={() => {
                  setReassigning(viewing)
                  setNewDillerId(viewing.shop?.diller ? String(viewing.shop.diller.id) : '')
                }}
              >
                Dillerni o‘zgartirish
              </Button>
              <Button
                variant={viewing.is_blocked ? 'success' : 'danger'}
                onClick={() => setToggling(viewing)}
              >
                {viewing.is_blocked ? 'Blokdan chiqarish' : 'Bloklash'}
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className={styles.infoList}>
            <InfoRow label="Do‘kon">{viewing.shop?.name ?? '—'}</InfoRow>
            <InfoRow label="Mas’ul shaxs">{viewing.full_name ?? '—'}</InfoRow>
            <InfoRow label="Login">{viewing.username}</InfoRow>
            <InfoRow label="Telefon" href={telHref(viewing.shop?.phone ?? viewing.phone)}>
              {viewing.shop?.phone ?? viewing.phone ?? '—'}
            </InfoRow>
            <InfoRow label="Manzil">{viewing.shop?.address ?? '—'}</InfoRow>
            {mapHref(viewing.shop?.latitude ?? null, viewing.shop?.longitude ?? null) && (
              <InfoRow
                label="Lokatsiya"
                href={mapHref(viewing.shop?.latitude ?? null, viewing.shop?.longitude ?? null)}
              >
                Xaritada ochish ↗
              </InfoRow>
            )}
            <InfoRow label="Diller">{viewing.shop?.diller?.name ?? 'Biriktirilmagan'}</InfoRow>
            <InfoRow label="Telegram ID">{viewing.telegram_id ?? '—'}</InfoRow>
            <InfoRow label="Buyurtmalar">{number(viewing.orders_count)}</InfoRow>
            <InfoRow label="Jami xaridlar">{money(viewing.total_spent)}</InfoRow>
            <InfoRow label="Ro‘yxatdan o‘tgan">{date(viewing.created_at)}</InfoRow>
          </div>
        )}
      </Modal>

      {/* ---------- Tahrirlash ---------- */}
      <Modal
        open={editing !== null}
        title="Mijozni tahrirlash"
        onClose={closeEdit}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={closeEdit} disabled={updateUser.isPending}>
              Bekor qilish
            </Button>
            <Button variant="primary" onClick={submitEdit} loading={updateUser.isPending}>
              Saqlash
            </Button>
          </>
        }
      >
        <form onSubmit={submitEdit} noValidate>
          {formError && <ErrorBanner message={formError} onClose={() => setFormError(null)} />}
          <div className={styles.formGrid} style={{ marginTop: formError ? 16 : 0 }}>
            <Field label="Mas’ul shaxs" error={errors.full_name} required>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.full_name}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                  invalid={invalid}
                />
              )}
            </Field>
            <Field label="Shaxsiy telefon" error={errors.phone}>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  invalid={invalid}
                  type="tel"
                />
              )}
            </Field>
            <Field label="Do‘kon nomi" error={errors.shop_name} required>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.shop_name}
                  onChange={(event) => setForm({ ...form, shop_name: event.target.value })}
                  invalid={invalid}
                />
              )}
            </Field>
            <Field label="Do‘kon telefoni" error={errors.shop_phone}>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.shop_phone}
                  onChange={(event) => setForm({ ...form, shop_phone: event.target.value })}
                  invalid={invalid}
                  type="tel"
                />
              )}
            </Field>
            <div className={styles.formFull}>
              <Field label="Manzil" error={errors.address}>
                {(id, invalid) => (
                  <Textarea
                    id={id}
                    value={form.address}
                    onChange={(event) => setForm({ ...form, address: event.target.value })}
                    invalid={invalid}
                    rows={2}
                  />
                )}
              </Field>
            </div>
          </div>
        </form>
      </Modal>

      {/* ---------- Dillerni o'zgartirish ---------- */}
      <Modal
        open={reassigning !== null}
        title="Dillerni o‘zgartirish"
        onClose={() => setReassigning(null)}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReassigning(null)} disabled={reassign.isPending}>
              Bekor qilish
            </Button>
            <Button
              variant="primary"
              loading={reassign.isPending}
              disabled={!newDillerId || newDillerId === String(reassigning?.shop?.diller?.id ?? '')}
              onClick={() => reassign.mutate()}
            >
              O‘tkazish
            </Button>
          </>
        }
      >
        <p style={{ marginBottom: 16, fontSize: 'var(--fs-md)', color: 'var(--c-text-secondary)' }}>
          <strong>{reassigning?.shop?.name}</strong> boshqa dillerga o‘tkaziladi. Ochiq
          buyurtmalar ham yangi dillerga o‘tadi va ikkala tomonga xabar yuboriladi.
        </p>
        <Field label="Yangi diller" required>
          {(id) => (
            <Select
              id={id}
              value={newDillerId}
              onChange={(event) => setNewDillerId(event.target.value)}
            >
              <option value="">Tanlang…</option>
              {dillers
                .filter((diller) => !diller.is_blocked)
                .map((diller) => (
                  <option key={diller.id} value={diller.id}>
                    {diller.company_name || diller.full_name || diller.username}
                    {diller.id === reassigning?.shop?.diller?.id ? ' (hozirgi)' : ''}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      </Modal>

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.is_blocked ? 'Blokdan chiqarish' : 'Mijozni bloklash'}
        message={
          toggling?.is_blocked
            ? `${toggling.shop?.name ?? toggling.username} yana ilovaga kira oladi.`
            : `${toggling?.shop?.name ?? toggling?.username} ilovaga kira olmaydi va buyurtma bera olmaydi.`
        }
        confirmLabel={toggling?.is_blocked ? 'Blokdan chiqarish' : 'Bloklash'}
        danger={!toggling?.is_blocked}
        loading={toggleBlock.isPending}
        onConfirm={() => {
          if (toggling) toggleBlock.mutate(toggling)
        }}
        onClose={() => setToggling(null)}
      />
    </>
  )
}
