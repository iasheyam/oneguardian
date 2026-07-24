import { pgTable, uuid, text, boolean, real, timestamp } from 'drizzle-orm/pg-core'

export const markers = pgTable('markers', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        text('name').notNull(),
  description: text('description'),
  category:    text('category').notNull().default('Other'),
  riskLevel:   text('risk_level').notNull().default('low'),
  latitude:    real('latitude').notNull(),
  longitude:   real('longitude').notNull(),
  enabled:     boolean('enabled').notNull().default(true),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
