"""dealer platform domain: diller, shop, category, product, order items

Revision ID: a7c3d9e1b4f2
Revises: 5df820a6ebba
Create Date: 2026-09-20 10:00:00.000000

Mavjud ma'lumotlar saqlanadi:
* ADMIN rolidagi userlar DILLER'ga o'tkaziladi (enum qiymati o'chirilmaydi);
* eski bitta mahsulotli ("tuxum") buyurtmalar `order_items` qatoriga ko'chiriladi,
  statuslar: yangi -> PENDING, topshirildi -> DELIVERED, bekor qilindi -> CANCELLED.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a7c3d9e1b4f2'
down_revision: Union[str, Sequence[str], None] = '5df820a6ebba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ORDER_STATUS = postgresql.ENUM('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED', name='order_status', create_type=False)
CANCELLED_BY = postgresql.ENUM('CLIENT', 'DILLER', 'SUPERADMIN', name='cancelled_by', create_type=False)


def upgrade() -> None:
    # ---- USERS ----
    # Yangi enum qiymati ishlatilishidan oldin alohida commit qilinishi kerak
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'DILLER'")

    op.add_column('users', sa.Column('telegram_id', sa.BigInteger(), nullable=True))
    op.add_column('users', sa.Column('full_name', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('phone', sa.String(length=50), nullable=True))
    op.add_column('users', sa.Column('is_blocked', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.alter_column('users', 'email', existing_type=sa.String(length=255), nullable=True)
    op.create_index('ix_users_telegram_id', 'users', ['telegram_id'], unique=True)

    op.execute("UPDATE users SET role = 'DILLER' WHERE role = 'ADMIN'")
    # Eski refresh tokenlar ochiq matnda edi: xeshlangan formatga o'tish uchun bekor qilinadi
    op.execute("UPDATE users SET refresh_token = NULL")

    # ---- DILLER PROFILES / SHOPS ----
    op.create_table(
        'diller_profiles',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('company_name', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('region', sa.String(length=255), nullable=True),
        sa.Column('work_hours', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )
    op.create_table(
        'shops',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('diller_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['diller_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_shops_owner_id', 'shops', ['owner_id'], unique=True)
    op.create_index('ix_shops_diller_id', 'shops', ['diller_id'], unique=False)

    # ---- CATALOG ----
    op.create_table(
        'categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'products',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('price', sa.BigInteger(), nullable=False),
        sa.Column('unit', sa.String(length=20), server_default='dona', nullable=False),
        sa.Column('min_quantity', sa.Integer(), server_default='1', nullable=False),
        sa.Column('image_url', sa.String(length=500), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_products_category_id', 'products', ['category_id'], unique=False)
    op.create_index('ix_products_name', 'products', ['name'], unique=False)

    # ---- ORDERS ----
    op.execute("CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED')")
    op.execute("CREATE TYPE cancelled_by AS ENUM ('CLIENT', 'DILLER', 'SUPERADMIN')")

    op.add_column('orders', sa.Column('shop_id', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('user_id', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('diller_id', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('status_new', ORDER_STATUS, nullable=True))
    op.add_column('orders', sa.Column('delivery_address', sa.Text(), nullable=True))
    op.add_column('orders', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('orders', sa.Column('longitude', sa.Float(), nullable=True))
    op.add_column('orders', sa.Column('note', sa.Text(), nullable=True))
    op.add_column('orders', sa.Column('total_amount', sa.BigInteger(), server_default='0', nullable=False))
    op.add_column('orders', sa.Column('cancelled_by', CANCELLED_BY, nullable=True))
    op.add_column('orders', sa.Column('reject_reason', sa.Text(), nullable=True))
    op.add_column('orders', sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True))

    op.execute("""
        UPDATE orders SET
            status_new = (CASE status::text
                WHEN 'new' THEN 'PENDING'
                WHEN 'bajar' THEN 'DELIVERED'
                ELSE 'CANCELLED' END)::order_status,
            delivered_at = CASE WHEN status::text = 'bajar' THEN updated_at END,
            cancelled_at = CASE WHEN status::text = 'cancel' THEN updated_at END
    """)

    # Eski buyurtmalarning mahsuloti uchun katalogda "Tuxum" yaratiladi
    op.execute("""
        INSERT INTO categories (name, sort_order, is_active, is_deleted, created_at, updated_at)
        SELECT 'Tuxum', 0, true, false, now(), now()
        WHERE EXISTS (SELECT 1 FROM orders)
    """)
    op.execute("""
        INSERT INTO products (category_id, name, price, unit, min_quantity, is_active, is_deleted, created_at, updated_at)
        SELECT (SELECT id FROM categories WHERE name = 'Tuxum' ORDER BY id LIMIT 1),
               'Tuxum', 0, 'dona', 1, true, false, now(), now()
        WHERE EXISTS (SELECT 1 FROM orders)
    """)

    op.create_table(
        'order_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=True),
        sa.Column('product_name', sa.String(length=255), nullable=False),
        sa.Column('unit', sa.String(length=20), nullable=False),
        sa.Column('unit_price', sa.BigInteger(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('line_total', sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_order_items_order_id', 'order_items', ['order_id'], unique=False)

    op.execute("""
        INSERT INTO order_items (order_id, product_id, product_name, unit, unit_price, quantity, line_total)
        SELECT o.id, (SELECT id FROM products WHERE name = 'Tuxum' ORDER BY id LIMIT 1),
               'Tuxum', 'dona', 0, o.quantity, 0
        FROM orders o
    """)

    op.drop_column('orders', 'status')
    op.alter_column('orders', 'status_new', new_column_name='status', nullable=False)
    op.drop_column('orders', 'product_name')
    op.drop_column('orders', 'quantity')
    op.execute("DROP TYPE product")
    op.execute("DROP TYPE orderstatus")

    op.alter_column('orders', 'customer_telegram_id', existing_type=sa.BigInteger(), nullable=True)
    op.alter_column('orders', 'customer_name', existing_type=sa.String(length=255), nullable=True)

    op.create_foreign_key('fk_orders_shop_id', 'orders', 'shops', ['shop_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_orders_user_id', 'orders', 'users', ['user_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_orders_diller_id', 'orders', 'users', ['diller_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_orders_shop_id', 'orders', ['shop_id'], unique=False)
    op.create_index('ix_orders_user_id', 'orders', ['user_id'], unique=False)
    op.create_index('ix_orders_diller_id', 'orders', ['diller_id'], unique=False)
    op.create_index('ix_orders_status', 'orders', ['status'], unique=False)
    op.create_index('ix_orders_created_at', 'orders', ['created_at'], unique=False)


def downgrade() -> None:
    """Eski sxemaga qaytish: yangi domen ma'lumotlari (do'kon, katalog) yo'qoladi,
    buyurtmalar esa eski bitta mahsulotli ko'rinishga keltiriladi."""
    op.drop_index('ix_orders_created_at', table_name='orders')
    op.drop_index('ix_orders_status', table_name='orders')
    op.drop_index('ix_orders_diller_id', table_name='orders')
    op.drop_index('ix_orders_user_id', table_name='orders')
    op.drop_index('ix_orders_shop_id', table_name='orders')
    op.drop_constraint('fk_orders_diller_id', 'orders', type_='foreignkey')
    op.drop_constraint('fk_orders_user_id', 'orders', type_='foreignkey')
    op.drop_constraint('fk_orders_shop_id', 'orders', type_='foreignkey')

    op.execute("CREATE TYPE product AS ENUM ('tuxum')")
    op.execute("CREATE TYPE orderstatus AS ENUM ('new', 'bajar', 'cancel')")
    op.add_column('orders', sa.Column('product_name', postgresql.ENUM('tuxum', name='product', create_type=False),
                                      server_default='tuxum', nullable=False))
    op.add_column('orders', sa.Column('quantity', sa.Integer(), server_default='1', nullable=False))
    op.add_column('orders', sa.Column('status_old', postgresql.ENUM('new', 'bajar', 'cancel', name='orderstatus',
                                                                     create_type=False), nullable=True))
    op.execute("""
        UPDATE orders o SET
            quantity = GREATEST(COALESCE((SELECT SUM(i.quantity) FROM order_items i WHERE i.order_id = o.id), 1), 1),
            status_old = (CASE o.status::text
                WHEN 'DELIVERED' THEN 'bajar'
                WHEN 'CANCELLED' THEN 'cancel'
                ELSE 'new' END)::orderstatus
    """)
    op.drop_column('orders', 'status')
    op.alter_column('orders', 'status_old', new_column_name='status', nullable=False)
    op.alter_column('orders', 'product_name', server_default=None)
    op.alter_column('orders', 'quantity', server_default=None)

    op.execute("UPDATE orders SET customer_name = COALESCE(customer_name, 'Noma''lum')")
    op.execute("UPDATE orders SET customer_telegram_id = COALESCE(customer_telegram_id, 0)")
    op.alter_column('orders', 'customer_name', existing_type=sa.String(length=255), nullable=False)
    op.alter_column('orders', 'customer_telegram_id', existing_type=sa.BigInteger(), nullable=False)

    for column in ('cancelled_at', 'delivered_at', 'confirmed_at', 'reject_reason', 'cancelled_by', 'total_amount',
                   'note', 'longitude', 'latitude', 'delivery_address', 'diller_id', 'user_id', 'shop_id'):
        op.drop_column('orders', column)

    op.drop_table('order_items')
    op.drop_table('products')
    op.drop_table('categories')
    op.drop_table('shops')
    op.drop_table('diller_profiles')
    op.execute("DROP TYPE order_status")
    op.execute("DROP TYPE cancelled_by")

    # Postgres enum qiymatini o'chirib bo'lmaydi: DILLER qiymati enum'da qoladi, userlar ADMIN'ga qaytariladi
    op.execute("UPDATE users SET role = 'ADMIN' WHERE role = 'DILLER'")
    op.execute("UPDATE users SET email = username || '@downgraded.invalid' WHERE email IS NULL")
    op.drop_index('ix_users_telegram_id', table_name='users')
    op.alter_column('users', 'email', existing_type=sa.String(length=255), nullable=False)
    op.drop_column('users', 'is_blocked')
    op.drop_column('users', 'phone')
    op.drop_column('users', 'full_name')
    op.drop_column('users', 'telegram_id')
