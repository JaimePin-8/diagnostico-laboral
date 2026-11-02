// Acceso a Postgres con la llave de servicio, que solo existe dentro de Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Fila, Store } from './handler.ts';

export function pgStore(url: string, serviceKey: string): Store {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async contar(ipHash, desde) {
      const { count, error } = await db
        .from('respuestas')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('creado', desde.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    async guardar(fila: Fila) {
      const { error } = await db.from('respuestas').insert(fila);
      if (error) throw error;
    }
  };
}
