import { pgTable, uuid, text, integer, boolean, jsonb, doublePrecision, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { accounts } from './accounts.js'

export const places = pgTable('places', {
  id:                uuid('id').primaryKey().defaultRandom(),
  accountId:         uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name:              text('name').notNull(),
  address:           text('address'),
  mapboxId:          text('mapbox_id'),
  latitude:          doublePrecision('latitude').notNull(),
  longitude:         doublePrecision('longitude').notNull(),
  radius:            integer('radius').notNull().default(150),
  color:             text('color').notNull().default('#2563eb'),
  traccarGeofenceId: integer('traccar_geofence_id'),        // null = not yet synced to Traccar
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const plans = pgTable('plans', {
  id:        uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  type:      text('type').notNull().default('recurring'), // recurring | one_time
  enabled:   boolean('enabled').notNull().default(true),
  notes:     text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const planUnits = pgTable('plan_units', {
  planId:   uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  unitId:   uuid('unit_id').notNull(),
  unitType: text('unit_type').notNull(),  // principal | vehicle
}, t => [primaryKey({ columns: [t.planId, t.unitId] })])

export const planLegs = pgTable('plan_legs', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  planId:              uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  legOrder:            integer('leg_order').notNull().default(0),
  originPlaceId:       uuid('origin_place_id').references(() => places.id, { onDelete: 'set null' }),
  destinationPlaceId:  uuid('destination_place_id').references(() => places.id, { onDelete: 'set null' }),
  daysOfWeek:          jsonb('days_of_week'),   // [0..6], 0 = Sunday; null for one_time plans
  windowStart:         text('window_start'),     // 'HH:MM'; null for one_time plans
  windowEnd:           text('window_end'),       // 'HH:MM'; null for one_time plans
  arrivalAt:           timestamp('arrival_at',   { withTimezone: true }), // null for recurring plans
  departureAt:         timestamp('departure_at', { withTimezone: true }), // null for recurring plans
  createdAt:           timestamp('created_at',   { withTimezone: true }).notNull().defaultNow(),
})
