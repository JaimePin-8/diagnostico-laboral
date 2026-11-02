// Punto de entrada de la función "diagnosticar" en Supabase.
import { createHandler } from './handler.ts';
import { pgStore } from './store_pg.ts';

const need = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Falta la variable ${k}`);
  return v;
};

Deno.serve(createHandler({
  store: pgStore(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY')),
  env: {
    allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://jaimepin-8.github.io').split(',').map((s) => s.trim()),
    ipSalt: need('IP_SALT'),
    maxPorVentana: 60,
    ventanaMin: 10
  }
}));
