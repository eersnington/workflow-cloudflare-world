'use workflow';

import { createClient } from '@supabase/supabase-js';
import { db } from '@/db';
import { usersTable } from '@/db/schema';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export async function exampleWorkflow(args: { userId: string }) {
  'use workflow';

  await db.select().from(usersTable);

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', args.userId)
    .single();

  return { data };
}
