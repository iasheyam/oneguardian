import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as usersSchema    from './schema/users.js'
import * as accountsSchema from './schema/accounts.js'
import * as alertsSchema   from './schema/alerts.js'
import * as plansSchema    from './schema/plans.js'
import * as zonesSchema    from './schema/zones.js'
const schema = { ...usersSchema, ...accountsSchema, ...alertsSchema, ...plansSchema, ...zonesSchema }

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

export const db = drizzle(pool, { schema })
export * from './schema/users.js'
export * from './schema/accounts.js'
export * from './schema/plans.js'
export * from './schema/zones.js'
