import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, unique } from 'drizzle-orm/pg-core'
import { users } from './users.js'

export const triggers = pgTable('triggers', {
  id:              uuid('id').primaryKey().defaultRandom(),
  name:            text('name').notNull(),
  triggerType:     text('trigger_type').notNull(),
  severity:        text('severity').notNull(), // 'advisory' | 'warning' | 'red_alert'
  conditions:      jsonb('conditions').notNull().default({}),
  unitType:        text('unit_type').notNull().default('both'), // 'vehicle' | 'principal' | 'both'
  source:          text('source').notNull(), // 'device' | 'server' | 'scheduled'
  isUniversal:     boolean('is_universal').notNull().default(false),
  isSystem:        boolean('is_system').notNull().default(false),
  enabled:         boolean('enabled').notNull().default(true),
  cooldownSeconds: integer('cooldown_seconds'), // null = use system default per severity; 0 = always fire
  createdBy:       uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const triggerUnits = pgTable('trigger_units', {
  id:        uuid('id').primaryKey().defaultRandom(),
  triggerId: uuid('trigger_id').notNull().references(() => triggers.id, { onDelete: 'cascade' }),
  unitId:    uuid('unit_id').notNull(),
  unitType:  text('unit_type').notNull(), // 'vehicle' | 'principal'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('uq_trigger_unit').on(t.triggerId, t.unitId, t.unitType),
])

export const alerts = pgTable('alerts', {
  id:             uuid('id').primaryKey().defaultRandom(),
  triggerId:      uuid('trigger_id').references(() => triggers.id, { onDelete: 'set null' }),
  unitId:         uuid('unit_id').notNull(),
  unitType:       text('unit_type').notNull(),
  severity:       text('severity').notNull(),
  position:       jsonb('position').notNull().default({}),
  status:         text('status').notNull().default('active'),
  isSimulation:   boolean('is_simulation').notNull().default(false),
  acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  resolvedBy:     uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt:     timestamp('resolved_at', { withTimezone: true }),
  notes:          text('notes'),
  firedAt:        timestamp('fired_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
