import { pgTable, uuid, text, boolean, jsonb, integer, timestamp } from 'drizzle-orm/pg-core'

export const zones = pgTable('zones', {
  id:                uuid('id').primaryKey().defaultRandom(),
  name:              text('name').notNull(),
  description:       text('description'),
  geometry:          jsonb('geometry').notNull(),           // GeoJSON Polygon or MultiPolygon
  riskLevel:         text('risk_level').notNull().default('low'), // low | medium | high | critical
  enabled:           boolean('enabled').notNull().default(true),
  traccarGeofenceId: integer('traccar_geofence_id'),        // null = not yet synced to Traccar
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
