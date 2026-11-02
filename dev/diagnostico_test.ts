import { assert, assertEquals } from 'jsr:@std/assert@1';
import { diagnosticar, type Respuestas, validar } from '../supabase/functions/diagnosticar/diagnostico.ts';

const base: Respuestas = {
  horas: 8, fin: 'no', salario: 12000, periodo: 'm', zona: 'g',
  horasExtra: 'nh', horasExtraSemana: null, descanso: true, descansoMin: 30, trato: 'si'
};
const titulos = (r: ReturnType<typeof diagnosticar>) => r.alertas.map((a) => a.titulo);

Deno.test('situación en regla: 100 puntos y sin alertas', () => {
  const r = diagnosticar(base);
  assertEquals(r.puntaje, 100);
  assertEquals(r.estado.nivel, 'g');
  assertEquals(r.alertas.length, 0);
  assert(r.recomendaciones.some((x) => x.includes('vas bien')));
});

Deno.test('horas extra sin pago es falta grave y limita el puntaje a 74', () => {
  const r = diagnosticar({ ...base, horas: 10, horasExtra: 'no' });
  assert(titulos(r).includes('Horas extra sin pago (falta grave)'));
  assert(r.puntaje <= 74);
});

Deno.test('jornada con horas extra declaradas como inexistentes', () => {
  const r = diagnosticar({ ...base, horas: 10, horasExtra: 'nh' });
  assert(titulos(r).includes('Horas extra no reconocidas'));
});

Deno.test('más de 3 horas extra al día es alerta grave', () => {
  const r = diagnosticar({ ...base, horas: 12, horasExtra: 'si' });
  assertEquals(r.alertas[0].nivel, 'r');
  assert(titulos(r).includes('Más de 3 horas extra al día'));
});

Deno.test('más de 9 horas extra a la semana pide revisar el pago triple', () => {
  const r = diagnosticar({ ...base, horas: 10, horasExtra: 'si', horasExtraSemana: 12 });
  assert(titulos(r).includes('Revisa el pago triple'));
});

Deno.test('hasta 9 horas extra pagadas pide verificar pago doble', () => {
  const r = diagnosticar({ ...base, horas: 10, horasExtra: 'si', horasExtraSemana: 6 });
  assert(titulos(r).includes('Verifica que sea pago doble'));
});

Deno.test('sin descanso y descanso corto', () => {
  assert(titulos(diagnosticar({ ...base, descanso: false, descansoMin: 0 })).includes('Sin descanso durante la jornada'));
  assert(titulos(diagnosticar({ ...base, descansoMin: 15 })).includes('Descanso menor a 30 minutos'));
});

Deno.test('trabajar sábado y domingo: sin descanso semanal y prima dominical', () => {
  const t = titulos(diagnosticar({ ...base, fin: 'ambos' }));
  assert(t.includes('Posible falta de día de descanso semanal'));
  assert(t.includes('Prima dominical'));
});

Deno.test('solo sábado conserva un día de descanso', () => {
  const r = diagnosticar({ ...base, fin: 'sab' });
  assertEquals(r.alertas.length, 0);
  assert(r.fortalezas.some((f) => f.titulo === 'Día de descanso semanal'));
});

Deno.test('salario por debajo del mínimo; la zona fronteriza tiene otro mínimo', () => {
  assert(titulos(diagnosticar({ ...base, salario: 5000 })).includes('Salario por debajo del mínimo'));
  assert(!titulos(diagnosticar({ ...base, salario: 12000, zona: 'g' })).includes('Salario por debajo del mínimo'));
  assert(titulos(diagnosticar({ ...base, salario: 12000, zona: 'f' })).includes('Salario por debajo del mínimo'));
});

Deno.test('conversión de periodos de pago', () => {
  assertEquals(diagnosticar({ ...base, salario: 400, periodo: 'd' }).salarioDiario, 400);
  assertEquals(diagnosticar({ ...base, salario: 6000, periodo: 'q' }).salarioDiario, 400);
  assertEquals(diagnosticar({ ...base, salario: 12160, periodo: 'm' }).salarioDiario, 400);
});

Deno.test('jornada reducida: el mínimo es proporcional', () => {
  assert(!titulos(diagnosticar({ ...base, horas: 4, salario: 5000 })).includes('Salario por debajo del mínimo'));
  assert(titulos(diagnosticar({ ...base, horas: 4, salario: 3000 })).includes('Salario por debajo del mínimo'));
});

Deno.test('mal trato es alerta grave, trato irregular es advertencia', () => {
  assertEquals(diagnosticar({ ...base, trato: 'no' }).alertas[0].nivel, 'r');
  assertEquals(diagnosticar({ ...base, trato: 'av' }).alertas[0].nivel, 'y');
});

Deno.test('el puntaje nunca sale de 0 a 100 y las alertas graves van primero', () => {
  const r = diagnosticar({
    horas: 14, fin: 'ambos', salario: 3000, periodo: 'm', zona: 'f', horasExtra: 'no',
    horasExtraSemana: null, descanso: false, descansoMin: 0, trato: 'no'
  });
  assert(r.puntaje >= 0 && r.puntaje <= 100);
  assertEquals(r.estado.nivel, 'r');
  const niveles = r.alertas.map((a) => a.nivel).join('');
  assert(niveles.includes('r') && !/y.*r/.test(niveles), niveles);
});

Deno.test('validar acepta datos correctos', () => {
  const v = validar({ ...base, horasExtra: 'si', horasExtraSemana: 5 });
  assert(v.ok);
});

Deno.test('validar ignora horas extra semanales si no hace horas extra', () => {
  const v = validar({ ...base, horasExtra: 'nh', horasExtraSemana: 5 });
  assert(v.ok && v.datos.horasExtraSemana === null);
});

Deno.test('validar rechaza tipos, rangos y opciones inválidas', () => {
  const malos: unknown[] = [
    null, [], 'texto', 5,
    { ...base, horas: '8' }, { ...base, horas: 0 }, { ...base, horas: 25 }, { ...base, horas: NaN },
    { ...base, salario: -1 }, { ...base, salario: 0 }, { ...base, salario: 1e12 }, { ...base, salario: '12000' },
    { ...base, fin: 'lunes' }, { ...base, periodo: 'x' }, { ...base, zona: 'z' },
    { ...base, horasExtra: 'tal vez' }, { ...base, trato: '' },
    { ...base, horasExtra: 'si', horasExtraSemana: 500 }, { ...base, horasExtra: 'si', horasExtraSemana: -2 },
    { ...base, descanso: 'si' }, { ...base, descansoMin: 7 }
  ];
  for (const m of malos) assertEquals(validar(m).ok, false, JSON.stringify(m));
});
