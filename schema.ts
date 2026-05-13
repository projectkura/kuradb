import { defineColumn, defineSchema, defineTable } from './lib/orm';

export const users = defineTable('public', 'users', {
  id: defineColumn('id', 'uuid', { primaryKey: true }),
  username: defineColumn('username', 'string'),
  email: defineColumn('email', 'string'),
  passwordHash: defineColumn('password_hash', 'string'),
  createdAt: defineColumn('created_at', 'date'),
  updatedAt: defineColumn('updated_at', 'date'),
  deletedAt: defineColumn('deleted_at', 'date', { nullable: true }),
});

export const posts = defineTable('public', 'posts', {
  id: defineColumn('id', 'uuid', { primaryKey: true }),
  userId: defineColumn('user_id', 'uuid'),
  title: defineColumn('title', 'string'),
  content: defineColumn('content', 'string'),
  published: defineColumn('published', 'boolean', { nullable: true }),
  createdAt: defineColumn('created_at', 'date'),
});

export const comments = defineTable('public', 'comments', {
  id: defineColumn('id', 'uuid', { primaryKey: true }),
  postId: defineColumn('post_id', 'uuid'),
  userId: defineColumn('user_id', 'uuid'),
  content: defineColumn('content', 'string'),
  createdAt: defineColumn('created_at', 'date'),
});

export const schema = defineSchema('public', {
  users,
  posts,
  comments,
});
