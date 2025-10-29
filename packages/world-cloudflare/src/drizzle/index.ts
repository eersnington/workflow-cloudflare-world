import type { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';
import * as Schema from './schema.js';

export { Schema };

export type Drizzle = ReturnType<typeof createClient>;
export function createClient(db: D1Database) {
  return drizzle(db, { schema: Schema });
}
