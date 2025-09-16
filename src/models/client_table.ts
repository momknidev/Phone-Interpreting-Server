import { relations } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, text } from 'drizzle-orm/pg-core';

export const Client = pgTable('clients', {
  id: uuid('id').primaryKey(),
  first_name: varchar('first_name'),
  last_name: varchar('last_name'),
  email: text('email').notNull().unique(),
  password: varchar('password'),
  role: varchar('role'),
  phone: varchar('phone'),
  type: text('type'),
  status: varchar('status').default('active'),
  avatar_url: varchar('avatar_url'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at')
    .notNull()
    .$onUpdate(() => new Date()),
});

export const clientPhones = pgTable('client_phones', {
  id: uuid('id').primaryKey(),
  client_id: uuid('client_id')
    .notNull()
    .references(() => Client.id, { onDelete: 'cascade' }),
  phone: varchar('phone_number').notNull(),
  label: varchar('phone_label'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at')
    .notNull()
    .$onUpdate(() => new Date()),
});

export const clientRelations = relations(Client, ({ many }) => ({
  client_phones: many(clientPhones),
}));

export const clientPhonesRelations = relations(clientPhones, ({ one }) => ({
  client: one(Client, {
    fields: [clientPhones.client_id],
    references: [Client.id],
  }),
}));
