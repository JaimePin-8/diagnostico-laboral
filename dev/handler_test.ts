import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createHandler, type Fila, type Store } from '../supabase/functions/diagnosticar/handler.ts';

const ORIGEN = 'https://jaimepin-8.github.io';
const valido = {
  horas: 10, fin: 'dom', salario: 9000, periodo: 'm', zona: 'g', horasExtra: 'no',
  horasExtraSemana: null, descanso: true, descansoMin: 30, trato: 'av'
};

function montar(opciones: { fallaGuardar?: boolean; max?: number } = {}) {
  const filas: Fila[] = [];
  const store: Store = {
    contar: (hash) => Promise.resolve(filas.filter((f) => f.ip_hash === hash).length),
    guardar: (fila) => opciones.fallaGuardar ? Promise.reject(new Error('db caída')) : (filas.push(fila), Promise.resolve())
  };
  const handler = createHandler({
    store,
    env: { allowedOrigins: [ORIGEN], ipSalt: 'sal-de-prueba', maxPorVentana: opciones.max ?? 3, ventanaMin: 10 }
  });
  return { filas, handler };
}

const post = (cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  new Request('https://x.supabase.co/functions/v1/diagnosticar', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGEN, 'x-forwarded-for': '1.2.3.4', ...cabeceras },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
  });

Deno.test('respuesta válida: 200, diagnóstico y CORS solo para el origen autorizado', async () => {
  const { handler, filas } = montar();
  const res = await handler(post(valido));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('access-control-allow-origin'), ORIGEN);
  const cuerpo = await res.json();
  assert(typeof cuerpo.puntaje === 'number' && Array.isArray(cuerpo.alertas));
  assertEquals(filas.length, 1);
});

Deno.test('lo guardado es anónimo: sin IP en claro ni campos fuera del esquema', async () => {
  const { handler, filas } = montar();
  await handler(post({ ...valido, puesto: 'Gerente', nombre: 'Ana', correo: 'a@b.c' }));
  const guardado = JSON.stringify(filas[0]);
  assert(!guardado.includes('1.2.3.4') && !guardado.includes('Gerente') && !guardado.includes('Ana'));
  assertEquals(filas[0].ip_hash.length, 64);
  assertEquals(Object.keys(filas[0]).sort(), [
    'descanso_min', 'estado', 'fin_semana', 'horas_dia', 'horas_extra', 'horas_extra_semana',
    'ip_hash', 'puntaje', 'salario_diario', 'trato', 'zona'
  ]);
});

Deno.test('preflight de un origen autorizado', async () => {
  const { handler } = montar();
  const res = await handler(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: ORIGEN } }));
  assertEquals(res.status, 204);
  assertEquals(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
});

Deno.test('origen no autorizado: 403 sin guardar nada', async () => {
  const { handler, filas } = montar();
  const res = await handler(post(valido, { origin: 'https://sitio-malicioso.com' }));
  assertEquals(res.status, 403);
  assertEquals(res.headers.get('access-control-allow-origin'), null);
  assertEquals(filas.length, 0);
  await res.body?.cancel();
});

Deno.test('método, tipo de contenido, JSON y tamaño inválidos', async () => {
  const { handler } = montar();
  const get = await handler(new Request('https://x/f', { method: 'GET', headers: { origin: ORIGEN } }));
  assertEquals(get.status, 405);
  await get.body?.cancel();
  const texto = await handler(post('hola', { 'content-type': 'text/plain' }));
  assertEquals(texto.status, 415);
  await texto.body?.cancel();
  const roto = await handler(post('{no es json'));
  assertEquals(roto.status, 400);
  await roto.body?.cancel();
  const grande = await handler(post({ ...valido, relleno: 'x'.repeat(5000) }));
  assertEquals(grande.status, 413);
  await grande.body?.cancel();
});

Deno.test('datos inválidos: 400 con el campo señalado', async () => {
  const { handler, filas } = montar();
  const res = await handler(post({ ...valido, horas: 99, salario: -5 }));
  assertEquals(res.status, 400);
  const cuerpo = await res.json();
  assertEquals(cuerpo.error, 'datos_invalidos');
  assert(cuerpo.campos.horas && cuerpo.campos.salario);
  assertEquals(filas.length, 0);
});

Deno.test('límite de uso por IP: la cuarta petición recibe 429', async () => {
  const { handler } = montar({ max: 3 });
  for (let i = 0; i < 3; i++) {
    const ok = await handler(post(valido));
    assertEquals(ok.status, 200);
    await ok.body?.cancel();
  }
  const res = await handler(post(valido));
  assertEquals(res.status, 429);
  assert(res.headers.get('retry-after'));
  await res.body?.cancel();
  // Otra IP no se ve afectada.
  const otra = await handler(post(valido, { 'x-forwarded-for': '9.9.9.9' }));
  assertEquals(otra.status, 200);
  await otra.body?.cancel();
});

Deno.test('si falla la base de datos al guardar, la persona aún recibe su diagnóstico', async () => {
  const { handler } = montar({ fallaGuardar: true });
  const res = await handler(post(valido));
  assertEquals(res.status, 200);
  await res.body?.cancel();
});
