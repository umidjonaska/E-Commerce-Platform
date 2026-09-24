import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { Badge, Button } from '@/components/ui/primitives'
import { ConfirmDialog, EmptyState, ErrorBanner, ErrorState, Modal, SkeletonList } from '@/components/ui/feedback'
import { Field, Input, Select } from '@/components/ui/form'
import { DataTable, PageHeader, Pagination, SearchInput, Toolbar, type Column } from '@/components/ui/data'
import { date, number, telHref } from '@/lib/format'
import { useToast } from '@/store/toast'
import type { AdminDiller } from '@/lib/types'
import styles from '@/styles/pages.module.css'

const PAGE_SIZE = 20

interface FormState {
  username: string
  password: string
  full_name: string
  phone: string
  telegram_id: string
  company_name: string
  region: string
  work_hours: string
}

const EMPTY_FORM: FormState = {
  username: '',
  password: '',
  full_name: '',
  phone: '',
  telegram_id: '',
  company_name: '',
  region: '',
  work_hours: '',
}

export default function AdminDillers() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [blocked, setBlocked] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)

  const [editing, setEditing] = useState<AdminDiller | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<AdminDiller | null>(null)

  const dillersQuery = useQuery({
    queryKey: ['admin', 'dillers', search, blocked, page],
    queryFn: ({ signal }) =>
      api.admin.dillers(
        {
          q: search || undefined,
          blocked: blocked === '' ? undefined : blocked === 'true',
          page,
          size: PAGE_SIZE,
        },
        signal,
      ),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dillers'] })
  }

  const closeForm = () => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setFormError(null)
  }

  const onError = (error: unknown) => {
    if (error instanceof ApiError) {
      setFormError(error.message)
      setErrors(error.fieldErrors)
    } else {
      setFormError('Kutilmagan xatolik yuz berdi')
    }
  }

  const createDiller = useMutation({
    mutationFn: () =>
      api.admin.createDiller({
        username: form.username.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        telegram_id: form.telegram_id.trim() ? Number(form.telegram_id.trim()) : null,
        company_name: form.company_name.trim() || null,
        region: form.region.trim() || null,
        work_hours: form.work_hours.trim() || null,
      }),
    onSuccess: (diller) => {
      toast.success(`Diller "${diller.full_name ?? diller.username}" yaratildi`)
      closeForm()
      refresh()
    },
    onError,
  })

  const updateDiller = useMutation({
    mutationFn: () =>
      api.admin.updateDiller(editing!.id, {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        telegram_id: form.telegram_id.trim() ? Number(form.telegram_id.trim()) : null,
        company_name: form.company_name.trim() || null,
        region: form.region.trim() || null,
        work_hours: form.work_hours.trim() || null,
        ...(form.password ? { password: form.password } : {}),
      }),
    onSuccess: () => {
      toast.success('Diller ma’lumotlari yangilandi')
      closeForm()
      refresh()
    },
    onError,
  })

  const toggleBlock = useMutation({
    mutationFn: (diller: AdminDiller) =>
      diller.is_blocked ? api.admin.unblockDiller(diller.id) : api.admin.blockDiller(diller.id),
    onSuccess: (diller) => {
      toast.success(diller.is_blocked ? 'Diller bloklandi' : 'Diller blokdan chiqarildi');
      setToggling(null)
      refresh()
    },
    onError: (error) => {
      setToggling(null)
      toast.error(error instanceof ApiError ? error.message : 'Amalni bajarib bo‘lmadi')
    },
  })

  const validate = (isCreate: boolean): boolean => {
    const next: Record<string, string> = {}
    if (isCreate) {
      if (!/^[A-Za-z0-9_.\-]{3,}$/.test(form.username.trim())) {
        next.username = 'Kamida 3 belgi: harf, raqam, _ . -'
      }
      if (form.password.length < 8) next.password = 'Kamida 8 belgi'
    } else if (form.password && form.password.length < 8) {
      next.password = 'Kamida 8 belgi'
    }
    if (form.full_name.trim().length < 2) next.full_name = 'Ismni kiriting'
    if (form.telegram_id.trim() && !/^\d+$/.test(form.telegram_id.trim())) {
      next.telegram_id = 'Faqat raqam'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const isCreate = creating
    if (!validate(isCreate)) return
    if (isCreate) createDiller.mutate()
    else updateDiller.mutate()
  }

  const openEdit = (diller: AdminDiller) => {
    setEditing(diller)
    setCreating(false)
    setErrors({})
    setFormError(null)
    setForm({
      username: diller.username,
      password: '',
      full_name: diller.full_name ?? '',
      phone: diller.phone ?? '',
      telegram_id: diller.telegram_id ? String(diller.telegram_id) : '',
      company_name: diller.company_name ?? '',
      region: diller.region ?? '',
      work_hours: diller.work_hours ?? '',
    })
  }

  const data = dillersQuery.data
  const saving = createDiller.isPending || updateDiller.isPending

  const columns: Column<AdminDiller>[] = [
    {
      key: 'name',
      header: 'Diller',
      primary: true,
      render: (diller) => (
        <div className={styles.cellStack}>
          <span className={styles.cellStrong}>
            {diller.company_name || diller.full_name || diller.username}
          </span>
          <span className={styles.cellMuted}>@{diller.username}</span>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Aloqa',
      render: (diller) => (
        <div className={styles.cellStack}>
          {diller.phone ? (
            <a
              className={styles.link}
              href={telHref(diller.phone) ?? undefined}
              onClick={(event) => event.stopPropagation()}
            >
              {diller.phone}
            </a>
          ) : (
            <span className={styles.cellMuted}>—</span>
          )}
          {diller.telegram_id && (
            <span className={styles.cellMuted}>TG: {diller.telegram_id}</span>
          )}
        </div>
      ),
    },
    { key: 'region', header: 'Hudud', render: (diller) => diller.region ?? '—' },
    {
      key: 'shops',
      header: 'Mijozlar',
      align: 'right',
      render: (diller) => number(diller.shops_count),
    },
    {
      key: 'orders',
      header: 'Buyurtma',
      align: 'right',
      render: (diller) => number(diller.orders_count),
    },
    {
      key: 'status',
      header: 'Holat',
      render: (diller) =>
        diller.is_blocked ? (
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
      render: (diller) => <span className={styles.cellMuted}>{date(diller.created_at)}</span>,
    },
    {
      key: 'actions',
      header: 'Amallar',
      render: (diller) => (
        <div
          className={styles.actionsCell}
          onClick={(event) => event.stopPropagation()}
          role="presentation"
        >
          <Button size="sm" onClick={() => openEdit(diller)}>
            Tahrirlash
          </Button>
          <Button
            size="sm"
            variant={diller.is_blocked ? 'success' : 'danger'}
            onClick={() => setToggling(diller)}
          >
            {diller.is_blocked ? 'Blokdan chiqarish' : 'Bloklash'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Dillerlar"
        subtitle={data ? `${data.total} ta diller` : 'Yuklanmoqda…'}
        action={
          <Button
            variant="primary"
            onClick={() => {
              setCreating(true)
              setEditing(null)
              setForm(EMPTY_FORM)
              setErrors({})
              setFormError(null)
            }}
          >
            + Yangi diller
          </Button>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          placeholder="Nom, login, telefon yoki hudud"
        />
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

      {dillersQuery.isPending && <SkeletonList rows={5} height={68} />}

      {dillersQuery.isError && (
        <ErrorState error={dillersQuery.error} onRetry={() => dillersQuery.refetch()} />
      )}

      {dillersQuery.isSuccess && data && data.items.length === 0 && (
        <EmptyState
          icon="🚚"
          title={search || blocked ? 'Hech narsa topilmadi' : 'Hali diller yo‘q'}
          description={
            search || blocked
              ? 'Filtrlarni o‘zgartirib ko‘ring.'
              : 'Birinchi dillerni qo‘shing — mijozlar unga biriktiriladi.'
          }
          action={
            search || blocked ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setBlocked('')
                }}
              >
                Filtrlarni tozalash
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setCreating(true)}>
                + Yangi diller
              </Button>
            )
          }
        />
      )}

      {dillersQuery.isSuccess && data && data.items.length > 0 && (
        <>
          <DataTable columns={columns} rows={data.items} rowKey={(diller) => diller.id} />
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
        </>
      )}

      {/* ---------- Forma ---------- */}
      <Modal
        open={creating || editing !== null}
        title={creating ? 'Yangi diller' : `${editing?.username} — tahrirlash`}
        onClose={closeForm}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Bekor qilish
            </Button>
            <Button variant="primary" onClick={submit} loading={saving}>
              {creating ? 'Yaratish' : 'Saqlash'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} noValidate>
          {formError && <ErrorBanner message={formError} onClose={() => setFormError(null)} />}

          <div className={styles.formGrid} style={{ marginTop: formError ? 16 : 0 }}>
            <Field label="Login" error={errors.username} required={creating}>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  invalid={invalid}
                  disabled={!creating}
                  autoComplete="off"
                  placeholder="diller1"
                />
              )}
            </Field>

            <Field
              label={creating ? 'Parol' : 'Yangi parol'}
              error={errors.password}
              required={creating}
              hint={creating ? 'Kamida 8 belgi' : 'Bo‘sh qoldirsangiz o‘zgarmaydi'}
            >
              {(id, invalid) => (
                <Input
                  id={id}
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  invalid={invalid}
                  autoComplete="new-password"
                />
              )}
            </Field>

            <Field label="To‘liq ism" error={errors.full_name} required>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.full_name}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                  invalid={invalid}
                />
              )}
            </Field>

            <Field label="Telefon" error={errors.phone}>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  invalid={invalid}
                  type="tel"
                  placeholder="+998901234567"
                />
              )}
            </Field>

            <Field label="Kompaniya nomi" error={errors.company_name}>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.company_name}
                  onChange={(event) => setForm({ ...form, company_name: event.target.value })}
                  invalid={invalid}
                  placeholder="Mijozlarga shu nom ko‘rinadi"
                />
              )}
            </Field>

            <Field label="Hudud" error={errors.region}>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.region}
                  onChange={(event) => setForm({ ...form, region: event.target.value })}
                  invalid={invalid}
                  placeholder="Toshkent"
                />
              )}
            </Field>

            <Field label="Ish vaqti" error={errors.work_hours}>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.work_hours}
                  onChange={(event) => setForm({ ...form, work_hours: event.target.value })}
                  invalid={invalid}
                  placeholder="09:00 - 18:00"
                />
              )}
            </Field>

            <Field
              label="Telegram ID"
              error={errors.telegram_id}
              hint="Buyurtma xabarlari shu chatga boradi"
            >
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.telegram_id}
                  onChange={(event) => setForm({ ...form, telegram_id: event.target.value })}
                  invalid={invalid}
                  inputMode="numeric"
                  placeholder="123456789"
                />
              )}
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.is_blocked ? 'Blokdan chiqarish' : 'Dillerni bloklash'}
        message={
          toggling?.is_blocked
            ? `${toggling.full_name ?? toggling.username} yana tizimga kira oladi va buyurtma qabul qiladi.`
            : `${toggling?.full_name ?? toggling?.username} tizimga kira olmaydi va unga yangi buyurtma tushmaydi. Mijozlari boshqa dillerga o‘tkazilmaydi.`
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
