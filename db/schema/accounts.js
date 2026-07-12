import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users.js'

export const accounts = pgTable('accounts', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  type:         text('type').notNull().default('Corporate'), // Corporate | Family | Government
  industry:     text('industry'),
  status:       text('status').notNull().default('active'), // active | inactive | suspended
  contactName:  text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  logoKey:      text('logo_key'), // S3 object key
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const principals = pgTable('principals', {
  id:              uuid('id').primaryKey().defaultRandom(),
  accountId:       uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId:          uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name:            text('name').notNull(),
  role:            text('role'),
  phone:           text('phone'),
  email:           text('email'),
  status:          text('status').notNull().default('normal'), // normal | warning | duress | offline
  photoKey:        text('photo_key'), // S3 object key
  // medical
  dob:             text('dob'),
  height:          text('height'),
  bloodGroup:      text('blood_group'),
  allergies:       text('allergies'),
  conditions:      text('conditions'),
  medications:     text('medications'),
  // emergency contact
  emergContactName:     text('emerg_contact_name'),
  emergContactPhone:    text('emerg_contact_phone'),
  emergContactRelation: text('emerg_contact_relation'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const vehicles = pgTable('vehicles', {
  id:         uuid('id').primaryKey().defaultRandom(),
  accountId:  uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  callsign:   text('callsign').notNull(),
  photoKey:   text('photo_key'), // S3 object key
  make:       text('make'),
  model:      text('model'),
  plate:      text('plate'),
  armorLevel: text('armor_level'),
  status:     text('status').notNull().default('normal'), // normal | warning | duress | offline
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const groups = pgTable('groups', {
  id:        uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const groupMembers = pgTable('group_members', {
  groupId:     uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  principalId: uuid('principal_id').references(() => principals.id, { onDelete: 'cascade' }),
  vehicleId:   uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'cascade' }),
})

export const devices = pgTable('devices', {
  id:              uuid('id').primaryKey().defaultRandom(),
  principalId:     uuid('principal_id').references(() => principals.id, { onDelete: 'cascade' }),
  vehicleId:       uuid('vehicle_id').references(() => vehicles.id,    { onDelete: 'cascade' }),
  name:            text('name').notNull(),
  type:            text('type').notNull().default('gps'), // gps | camera | alert | radio | phone | other
  model:           text('model'),
  serial:          text('serial'),
  imei:            text('imei'),
  firmware:        text('firmware'),
  status:          text('status').notNull().default('online'), // online | offline
  traccarDeviceId: text('traccar_device_id'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
