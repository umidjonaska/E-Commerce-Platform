import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { Badge, Button } from '@/components/ui/primitives'
import { ConfirmDialog, EmptyState, ErrorBanner, ErrorState, Modal, SkeletonList } from '@/components/ui/feedback'
import { Field, Input, Switch } from '@/components/ui/form'
import { DataTable, PageHeader, type Column } from '@/components/ui/data'
import { date, number } from '@/lib/format'
import { useToast } from '@/store/toast'
import type { Category } from '@/lib/types'
import styles from '@/styles/pages.module.css'

export default function AdminCategories() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: ({ signal }) => api.admin.categories(signal),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
    void queryClient.invalidateQueries({ queryKey: ['categories'] })
  }

  const close = () => {
    setCreating(false)
    setEditing(null)
    setName('')
    setSortOrder('0')
    setIsActive(true)
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

  const createCategory = useMutation({
    mutationFn: () =>
      api.admin.createCategory({
        name: name.trim(),
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
      }),
    onSuccess: () => {
      toast.success('Kategoriya yaratildi')
      close()
      refresh()
    },
    onError,
  })

  const updateCategory = useMutation({
    mutationFn: () =>
      api.admin.updateCategory(editing!.id, {
        name: name.trim(),
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
      }),
    onSuccess: () => {
      toast.success('Kategoriya yangilandi')
      close()
      refresh()
    },
    onError,
  })

  const deleteCategory = useMutation({
    mutationFn: (category: Category) => api.admin.deleteCategory(category.id),
    onSuccess: () => {
      toast.success('Kategoriya o‘chirildi')
      setDeleting(null)
      refresh()
    },
    onError: (error) => {
      setDeleting(null)
      toast.error(error instanceof ApiError ? error.message : 'O‘chirib bo‘lmadi')
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const next: Record<string, string> = {}
    if (name.trim().length < 2) next.name = 'Kamida 2 belgi'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    if (creating) createCategory.mutate()
    else updateCategory.mutate()
  }

  const openEdit = (category: Category) => {
    setEditing(category)
    setCreating(false)
    setName(category.name)
    setSortOrder(String(category.sort_order))
    setIsActive(category.is_active)
    setErrors({})
    setFormError(null)
  }

  const saving = createCategory.isPending || updateCategory.isPending
  const data = categoriesQuery.data

  const columns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Nomi',
      primary: true,
      render: (category) => <span className={styles.cellStrong}>{category.name}</span>,
    },
    {
      key: 'products',
      header: 'Mahsulotlar',
      align: 'right',
      render: (category) => number(category.products_count),
    },
    {
      key: 'sort',
      header: 'Tartib',
      align: 'right',
      render: (category) => number(category.sort_order),
    },
    {
      key: 'status',
      header: 'Holat',
      render: (category) =>
        category.is_active ? (
          <Badge tone="success" dot>
            Faol
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            Yashirilgan
          </Badge>
        ),
    },
    {
      key: 'created',
      header: 'Yaratilgan',
      hideOnMobile: true,
      render: (category) => <span className={styles.cellMuted}>{date(category.created_at)}</span>,
    },
    {
      key: 'actions',
      header: 'Amallar',
      render: (category) => (
        <div className={styles.actionsCell}>
          <Button size="sm" onClick={() => openEdit(category)}>
            Tahrirlash
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDeleting(category)}>
            O‘chirish
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Kategoriyalar"
        subtitle={data ? `${data.length} ta kategoriya` : 'Yuklanmoqda…'}
        action={
          <Button
            variant="primary"
            onClick={() => {
              setCreating(true)
              setEditing(null)
              setName('')
              setSortOrder('0')
              setIsActive(true)
              setErrors({})
              setFormError(null)
            }}
          >
            + Yangi kategoriya
          </Button>
        }
      />

      {categoriesQuery.isPending && <SkeletonList rows={4} height={60} />}

      {categoriesQuery.isError && (
        <ErrorState error={categoriesQuery.error} onRetry={() => categoriesQuery.refetch()} />
      )}

      {categoriesQuery.isSuccess && data && data.length === 0 && (
        <EmptyState
          icon="🗂️"
          title="Hali kategoriya yo‘q"
          description="Mahsulot qo‘shish uchun avval kategoriya yarating."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              + Yangi kategoriya
            </Button>
          }
        />
      )}

      {categoriesQuery.isSuccess && data && data.length > 0 && (
        <DataTable columns={columns} rows={data} rowKey={(category) => category.id} />
      )}

      <Modal
        open={creating || editing !== null}
        title={creating ? 'Yangi kategoriya' : 'Kategoriyani tahrirlash'}
        onClose={close}
        size="sm"
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: formError ? 16 : 0 }}>
            <Field label="Nomi" error={errors.name} required>
              {(id, invalid) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  invalid={invalid}
                  placeholder="Masalan: Sut mahsulotlari"
                  autoFocus
                />
              )}
            </Field>

            <Field
              label="Tartib raqami"
              error={errors.sort_order}
              hint="Kichik raqam yuqorida turadi"
            >
              {(id, invalid) => (
                <Input
                  id={id}
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value.replace(/\D/g, ''))}
                  invalid={invalid}
                  inputMode="numeric"
                />
              )}
            </Field>

            <Switch
              checked={isActive}
              onChange={setIsActive}
              label="Mijozlarga ko‘rsatilsin"
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Kategoriyani o‘chirish"
        message={
          deleting && deleting.products_count > 0
            ? `"${deleting.name}" ichida ${deleting.products_count} ta mahsulot bor. Avval ularni o‘chiring yoki boshqa kategoriyaga ko‘chiring.`
            : `"${deleting?.name}" o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.`
        }
        confirmLabel="O‘chirish"
        danger
        loading={deleteCategory.isPending}
        onConfirm={() => {
          if (deleting) deleteCategory.mutate(deleting)
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
