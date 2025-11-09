import { drizzle } from 'drizzle-orm/d1';
import * as Schema from './schema.js';

export { Schema };

export type Drizzle = ReturnType<typeof createClient>;
export function createClient(d1: D1Database) {
  return drizzle(d1, { schema: Schema });
}
