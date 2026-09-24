import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { Badge, Button } from '@/components/ui/primitives'
import { ConfirmDialog, EmptyState, ErrorBanner, ErrorState, Modal, SkeletonList } from '@/components/ui/feedback'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form'
import { DataTable, PageHeader, Pagination, SearchInput, Toolbar, type Column } from '@/components/ui/data'
import { money, number } from '@/lib/format'
import { useToast } from '@/store/toast'
import type { Product } from '@/lib/types'
import styles from '@/styles/pages.module.css'

const PAGE_SIZE = 20
const UNITS = ['dona', 'kg', 'litr', 'quti', 'pachka', 'tray', 'blok']

interface FormState {
  category_id: string
  name: string
  description: string
  price: string
  unit: string
  min_quantity: string
  image_url: string | null
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  category_id: '',
  name: '',
  description: '',
  price: '',
  unit: 'dona',
  min_quantity: '1',
  image_url: null,
  is_active: true,
}

export default function AdminProducts() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: ({ signal }) => api.admin.categories(signal),
  })

  const productsQuery = useQuery({
    queryKey: ['admin', 'products', search, categoryFilter, activeFilter, page],
    queryFn: ({ signal }) =>
      api.admin.products(
        {
          q: search || undefined,
          category_id: categoryFilter ? Number(categoryFilter) : undefined,
          is_active: activeFilter === '' ? undefined : activeFilter === 'true',
          page,
          size: PAGE_SIZE,
        },
        signal,
      ),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
  }

  const close = () => {
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

  const payload = () => ({
    category_id: Number(form.category_id),
    name: form.name.trim(),
    description: form.description.trim() || null,
    price: Number(form.price),
    unit: form.unit,
    min_quantity: Number(form.min_quantity) || 1,
    image_url: form.image_url,
    is_active: form.is_active,
  })

  const createProduct = useMutation({
    mutationFn: () => api.admin.createProduct(payload()),
    onSuccess: () => {
      toast.success('Mahsulot yaratildi')
      close()
      refresh()
    },
    onError,
  })

  const updateProduct = useMutation({
    mutationFn: () => api.admin.updateProduct(editing!.id, payload()),
    onSuccess: () => {
      toast.success('Mahsulot yangilandi')
      close()
      refresh()
    },
    onError,
  })

  const deleteProduct = useMutation({
    mutationFn: (product: Product) => api.admin.deleteProduct(product.id),
    onSuccess: () => {
      toast.success('Mahsulot o‘chirildi')
      setDeleting(null)
      refresh()
    },
    onError: (error) => {
      setDeleting(null)
      toast.error(error instanceof ApiError ? error.message : 'O‘chirib bo‘lmadi')
    },
  })

  const uploadImage = useMutation({
    mutationFn: (file: File) => api.admin.uploadImage(file),
    onSuccess: (result) => {
      setForm((current) => ({ ...current, image_url: result.url }))
      toast.success('Rasm yuklandi')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Rasmni yuklab bo‘lmadi')
    },
  })

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!form.category_id) next.category_id = 'Kategoriyani tanlang'
    if (form.name.trim().length < 2) next.name = 'Kamida 2 belgi'
    if (!form.price || Number(form.price) < 0) next.price = 'Narxni kiriting'
    if (!form.min_quantity || Number(form.min_quantity) < 1) next.min_quantity = 'Kamida 1'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (!validate()) return
    if (creating) createProduct.mutate()
    else updateProduct.mutate()
  }

  const openCreate = () => {
    setCreating(true)
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      category_id: categoryFilter || String(categoriesQuery.data?.[0]?.id ?? ''),
    })
    setErrors({})
    setFormError(null)
  }

  const openEdit = (product: Product) => {
    setEditing(product)
    setCreating(false)
    setForm({
      category_id: String(product.category_id),
      name: product.name,
      description: product.description ?? '',
      price: String(product.price),
      unit: product.unit,
      min_quantity: String(product.min_quantity),
      image_url: product.image_url,
      is_active: product.is_active,
    })
    setErrors({})
    setFormError(null)
  }

  const data = productsQuery.data
  const categories = categoriesQuery.data ?? []
  const saving = createProduct.isPending || updateProduct.isPending
  const noCategories = categoriesQuery.isSuccess && categories.length === 0

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Mahsulot',
      primary: true,
      render: (product) => (
        <div className={styles.cellStack}>
          <span className={styles.cellStrong}>{product.name}</span>
          <span className={styles.cellMuted}>{product.category_name ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Narx',
      align: 'right',
      render: (product) => (
        <span className={styles.cellStrong}>
          {money(product.price)}
          <span className={styles.cellMuted}> / {product.unit}</span>
        </span>
      ),
    },
    {
      key: 'min',
      header: 'Min. miqdor',
      align: 'right',
      render: (product) => `${number(product.min_quantity)} ${product.unit}`,
    },
    {
      key: 'status',
      header: 'Holat',
      render: (product) =>
        product.is_active ? (
          <Badge tone="success" dot>
            Sotuvda
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            Yashirilgan
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: 'Amallar',
      render: (product) => (
        <div className={styles.actionsCell}>
          <Button size="sm" onClick={() => openEdit(product)}>
            Tahrirlash
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDeleting(product)}>
            O‘chirish
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Mahsulotlar"
        subtitle={data ? `${data.total} ta mahsulot` : 'Yuklanmoqda…'}
        action={
          <Button variant="primary" onClick={openCreate} disabled={noCategories}>
            + Yangi mahsulot
          </Button>
        }
      />

      {noCategories && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBanner message="Avval kamida bitta kategoriya yarating — mahsulot kategoriyasiz bo‘lmaydi." />
        </div>
      )}

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          placeholder="Mahsulot nomi yoki tavsifi"
        />
        <div style={{ minWidth: 190 }}>
          <Select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value)
              setPage(1)
            }}
            aria-label="Kategoriya bo‘yicha filtr"
          >
            <option value="">Barcha kategoriyalar</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <div style={{ minWidth: 160 }}>
          <Select
            value={activeFilter}
            onChange={(event) => {
              setActiveFilter(event.target.value as '' | 'true' | 'false')
              setPage(1)
            }}
            aria-label="Holat bo‘yicha filtr"
          >
            <option value="">Barcha holatlar</option>
            <option value="true">Sotuvda</option>
            <option value="false">Yashirilgan</option>
          </Select>
        </div>
      </Toolbar>

      {productsQuery.isPending && <SkeletonList rows={5} height={64} />}

      {productsQuery.isError && (
        <ErrorState error={productsQuery.error} onRetry={() => productsQuery.refetch()} />
      )}

      {productsQuery.isSuccess && data && data.items.length === 0 && (
        <EmptyState
          icon="📦"
          title={
            search || categoryFilter || activeFilter ? 'Hech narsa topilmadi' : 'Hali mahsulot yo‘q'
          }
          description={
            search || categoryFilter || activeFilter
              ? 'Filtrlarni o‘zgartirib ko‘ring.'
              : 'Mijozlar ko‘rishi uchun birinchi mahsulotni qo‘shing.'
          }
          action={
            search || categoryFilter || activeFilter ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setCategoryFilter('')
                  setActiveFilter('')
                }}
              >
                Filtrlarni tozalash
              </Button>
            ) : (
              <Button variant="primary" onClick={openCreate} disabled={noCategories}>
                + Yangi mahsulot
              </Button>
            )
          }
        />
      )}

      {productsQuery.isSuccess && data && data.items.length > 0 && (
        <>
          <DataTable columns={columns} rows={data.items} rowKey={(product) => product.id} />
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
        </>
      )}

      {/* ---------- Forma ---------- */}
      <Modal
        open={creating || editing !== null}
        title={creating ? 'Yangi mahsulot' : `${editing?.name} — tahrirlash`}
        onClose={close}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={saving}>
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
            <div className={styles.formFull}>
              <Field label="Nomi" error={errors.name} required>
                {(id, invalid) => (
                  <Input
                    id={id}
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    invalid={invalid}
                    placeholder="Masalan: Tuxum C1"
                    autoFocus
                  />
                )}
              </Field>
            </div>

            <Field label="Kategoriya" error={errors.category_id} required>
              {(id, invalid) => (
                <Select
                  id={id}
                  value={form.category_id}
                  onChange={(event) => setForm({ ...form, category_id: event.target.value })}
                  invalid={invalid}
                >
                  <option value="">Tanlang…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Narx (so‘m)" error={errors.price} required>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.price}
                  onChange={(event) =>
                    setForm({ ...form, price: event.target.value.replace(/\D/g, '') })
                  }
                  invalid={invalid}
                  inputMode="numeric"
                  placeholder="1500"
                />
              )}
            </Field>

            <Field label="O‘lchov birligi" error={errors.unit} required>
              {(id, invalid) => (
                <Select
                  id={id}
                  value={form.unit}
                  onChange={(event) => setForm({ ...form, unit: event.target.value })}
                  invalid={invalid}
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label="Minimal miqdor"
              error={errors.min_quantity}
              required
              hint="Shundan kam buyurtma qabul qilinmaydi"
            >
              {(id, invalid) => (
                <Input
                  id={id}
                  value={form.min_quantity}
                  onChange={(event) =>
                    setForm({ ...form, min_quantity: event.target.value.replace(/\D/g, '') })
                  }
                  invalid={invalid}
                  inputMode="numeric"
                />
              )}
            </Field>

            <div className={styles.formFull}>
              <Field label="Tavsif" error={errors.description}>
                {(id, invalid) => (
                  <Textarea
                    id={id}
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    invalid={invalid}
                    rows={3}
                    maxLength={2000}
                  />
                )}
              </Field>
            </div>

            <div className={styles.formFull}>
              <Field label="Rasm" error={errors.image_url} hint="JPEG, PNG yoki WEBP · 5 MB gacha">
                {() => (
                  <div className={styles.imagePreview}>
                    {form.image_url ? (
                      <img className={styles.imageBox} src={form.image_url} alt="Mahsulot rasmi" />
                    ) : (
                      <span className={styles.imagePlaceholder} aria-hidden="true">
                        📷
                      </span>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        onClick={() => fileRef.current?.click()}
                        loading={uploadImage.isPending}
                      >
                        {form.image_url ? 'Almashtirish' : 'Rasm yuklash'}
                      </Button>
                      {form.image_url && (
                        <Button
                          variant="ghost"
                          onClick={() => setForm({ ...form, image_url: null })}
                        >
                          Olib tashlash
                        </Button>
                      )}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className={styles.hiddenInput}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) uploadImage.mutate(file)
                        // Bir xil faylni qayta tanlash ishlashi uchun
                        event.target.value = ''
                      }}
                    />
                  </div>
                )}
              </Field>
            </div>

            <div className={styles.formFull}>
              <Switch
                checked={form.is_active}
                onChange={(value) => setForm({ ...form, is_active: value })}
                label="Mijozlarga ko‘rsatilsin (sotuvda)"
              />
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Mahsulotni o‘chirish"
        message={`"${deleting?.name}" katalogdan olib tashlanadi. Eski buyurtmalarda u o‘z nomi va narxi bilan saqlanib qoladi.`}
        confirmLabel="O‘chirish"
        danger
        loading={deleteProduct.isPending}
        onConfirm={() => {
          if (deleting) deleteProduct.mutate(deleting)
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
