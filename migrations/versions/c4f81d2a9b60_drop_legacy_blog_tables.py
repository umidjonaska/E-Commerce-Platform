"""drop legacy blog tables (posts, comments, media)

Revision ID: c4f81d2a9b60
Revises: a7c3d9e1b4f2
Create Date: 2026-09-24 17:00:00.000000

Eski blog loyihasidan qolgan jadvallar. Dealer platformada ular umuman
ishlatilmaydi, tegishli kod ham olib tashlandi.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4f81d2a9b60'
down_revision: Union[str, Sequence[str], None] = 'a7c3d9e1b4f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # comments -> posts ga bog'langan, shuning uchun avval u o'chiriladi
    op.drop_index('ix_posts_title', table_name='posts', if_exists=True)
    op.drop_table('comments')
    op.drop_table('media')
    op.drop_table('posts')

    op.execute("DROP TYPE IF EXISTS media_status_enum")
    op.execute("DROP TYPE IF EXISTS media_type_enum")


def downgrade() -> None:
    """Jadvallarni qaytaradi (ma'lumotlar tiklanmaydi)."""
    op.create_table(
        'posts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=False),
        sa.Column('likes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['author_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_posts_title', 'posts', ['title'])

    op.create_table(
        'comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    media_type = sa.Enum('image', 'video', 'audio', name='media_type_enum')
    media_status = sa.Enum('uploading', 'processing', 'uploaded', 'failed', 'deleted',
                           name='media_status_enum')
    op.create_table(
        'media',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('path', sa.String(length=500), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('type', media_type, nullable=False),
        sa.Column('size', sa.BigInteger(), nullable=False),
        sa.Column('thumbnail', sa.String(length=500), nullable=True),
        sa.Column('duration', sa.Integer(), nullable=True),
        sa.Column('resolution', sa.String(length=50), nullable=True),
        sa.Column('bitrate', sa.Integer(), nullable=True),
        sa.Column('status', media_status, nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
