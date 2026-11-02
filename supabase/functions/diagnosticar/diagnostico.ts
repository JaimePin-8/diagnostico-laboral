// Reglas del diagnóstico laboral según la Ley Federal del Trabajo (LFT).
// Sin dependencias ni acceso a red: se usa en la función y en las pruebas.

export type Fin = 'no' | 'sab' | 'dom' | 'ambos';
export type Periodo = 'd' | 'q' | 'm';
export type Zona = 'g' | 'f';
export type HorasExtra = 'si' | 'no' | 'nh';
export type Trato = 'si' | 'av' | 'no';

export interface Respuestas {
  horas: number;
  fin: Fin;
  salario: number;
  periodo: Periodo;
  zona: Zona;
  horasExtra: HorasExtra;
  horasExtraSemana: number | null;
  descanso: boolean;
  descansoMin: number;
  trato: Trato;
}

export interface Hallazgo {
  titulo: string;
  detalle: string;
  ref: string;
}

export interface Alerta extends Hallazgo {
  nivel: 'r' | 'y';
}

export interface Diagnostico {
  puntaje: number;
  estado: { etiqueta: string; nivel: 'g' | 'y' | 'r' };
  salarioDiario: number;
  fortalezas: Hallazgo[];
  alertas: Alerta[];
  recomendaciones: string[];
}

// Salarios mínimos diarios vigentes en 2026 (MXN).
export const SALARIO_MINIMO: Record<Zona, number> = { g: 315.04, f: 440.87 };

const FIN: readonly Fin[] = ['no', 'sab', 'dom', 'ambos'];
const PERIODO: readonly Periodo[] = ['d', 'q', 'm'];
const ZONA: readonly Zona[] = ['g', 'f'];
const HORAS_EXTRA: readonly HorasExtra[] = ['si', 'no', 'nh'];
const TRATO: readonly Trato[] = ['si', 'av', 'no'];
const DESCANSO_MIN = [15, 30, 45, 60, 90, 120];
const SALARIO_MAX = 10_000_000;

export type Validacion =
  | { ok: true; datos: Respuestas }
  | { ok: false; errores: Record<string, string> };

export function validar(raw: unknown): Validacion {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errores: { cuerpo: 'Formato no válido.' } };
  }
  const r = raw as Record<string, unknown>;
  const errores: Record<string, string> = {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const uno = <T extends string>(v: unknown, opciones: readonly T[]) =>
    opciones.includes(v as T) ? (v as T) : null;

  const horas = num(r.horas);
  if (!(horas >= 0.5 && horas <= 24)) errores.horas = 'Ingresa las horas diarias (de 0.5 a 24).';

  const salario = num(r.salario);
  if (!(salario > 0)) errores.salario = 'Ingresa tu salario.';
  else if (salario > SALARIO_MAX) errores.salario = 'El monto es demasiado alto.';

  const fin = uno(r.fin, FIN);
  if (!fin) errores.fin = 'Opción no válida.';
  const periodo = uno(r.periodo, PERIODO);
  if (!periodo) errores.periodo = 'Opción no válida.';
  const zona = uno(r.zona, ZONA);
  if (!zona) errores.zona = 'Opción no válida.';
  const horasExtra = uno(r.horasExtra, HORAS_EXTRA);
  if (!horasExtra) errores.horasExtra = 'Opción no válida.';
  const trato = uno(r.trato, TRATO);
  if (!trato) errores.trato = 'Opción no válida.';

  let horasExtraSemana: number | null = null;
  if (horasExtra && horasExtra !== 'nh' && r.horasExtraSemana !== null && r.horasExtraSemana !== undefined) {
    horasExtraSemana = num(r.horasExtraSemana);
    if (!(horasExtraSemana >= 0 && horasExtraSemana <= 100)) {
      errores.horasExtraSemana = 'Ingresa un valor entre 0 y 100.';
    }
  }

  if (typeof r.descanso !== 'boolean') errores.descanso = 'Opción no válida.';
  let descansoMin = 0;
  if (r.descanso === true) {
    descansoMin = num(r.descansoMin);
    if (!DESCANSO_MIN.includes(descansoMin)) errores.descansoMin = 'Opción no válida.';
  }

  if (Object.keys(errores).length) return { ok: false, errores };
  return {
    ok: true,
    datos: {
      horas, fin: fin!, salario, periodo: periodo!, zona: zona!, horasExtra: horasExtra!,
      horasExtraSemana, descanso: r.descanso as boolean, descansoMin, trato: trato!
    }
  };
}

const mx = (n: number) =>
  '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function diagnosticar(d: Respuestas): Diagnostico {
  const { horas: h, fin, horasExtra: hx, trato: tr } = d;
  const mins = d.descanso ? d.descansoMin : 0;
  const diario = d.periodo === 'd' ? d.salario : d.periodo === 'q' ? d.salario / 15 : d.salario / 30.4;
  const minimo = SALARIO_MINIMO[d.zona];
  const diasFin = fin === 'no' ? 0 : fin === 'ambos' ? 2 : 1;
  const extraDia = Math.max(0, h - 8);
  const extraSem = hx !== 'nh' && d.horasExtraSemana !== null ? d.horasExtraSemana : extraDia * (5 + diasFin);

  let puntaje = 100;
  let grave = false;
  const fortalezas: Hallazgo[] = [];
  const alertas: Alerta[] = [];
  const ok = (titulo: string, detalle: string, ref: string) => fortalezas.push({ titulo, detalle, ref });
  const alerta = (nivel: 'r' | 'y', titulo: string, detalle: string, ref: string, pena = 0) => {
    alertas.push({ nivel, titulo, detalle, ref });
    puntaje -= pena;
  };

  // Jornada
  if (h <= 8) {
    ok('Jornada dentro del límite', `Trabajas ${h} h al día, dentro del máximo de 8 h de la jornada diurna.`, 'Art. 61');
  } else {
    alerta('y', 'Jornada superior a 8 horas',
      `Trabajas ${h} h diarias: las horas que exceden 8 son tiempo extraordinario y deben pagarse como tal.`,
      'Arts. 61 y 66', 15);
    if (extraDia > 3) {
      alerta('r', 'Más de 3 horas extra al día',
        'La ley prohíbe prolongar la jornada más de 3 horas diarias ni más de 3 veces por semana.', 'Art. 66', 10);
    }
  }

  // Descanso durante la jornada
  if (!d.descanso) {
    alerta('r', 'Sin descanso durante la jornada',
      'Cuando la jornada es continua tienes derecho a un descanso mínimo de 30 minutos, que cuenta como tiempo de trabajo si no puedes salir del centro laboral.',
      'Art. 63', 15);
  } else if (mins < 30) {
    alerta('y', 'Descanso menor a 30 minutos', `Tu descanso de ${mins} min es inferior al mínimo legal de 30 minutos.`, 'Art. 63', 10);
  } else {
    ok('Descanso suficiente', `Tu descanso de ${mins >= 120 ? '2 h o más' : mins + ' min'} cumple el mínimo de 30 minutos.`, 'Art. 63');
  }

  // Descanso semanal
  if (fin === 'ambos') {
    alerta('r', 'Posible falta de día de descanso semanal',
      'Si trabajas de lunes a domingo, no gozas del día de descanso semanal obligatorio. Si lo laboras, se paga salario doble adicional al ordinario.',
      'Arts. 69 y 73', 10);
  } else if (fin === 'no') {
    ok('Fines de semana libres', 'No trabajas fines de semana, por lo que se respeta tu descanso semanal.', 'Art. 69');
  } else {
    ok('Día de descanso semanal', 'Trabajas solo un día del fin de semana, por lo que conservas al menos un día de descanso a la semana.', 'Art. 69');
  }

  // Horas extra
  if (extraSem > 0 || hx !== 'nh') {
    if (hx === 'no') {
      grave = true;
      alerta('r', 'Horas extra sin pago (falta grave)',
        'Las horas extra deben pagarse: las primeras 9 a la semana al doble (100% adicional) y las que excedan, al triple (200% adicional). Trabajarlas sin pago vulnera tus derechos.',
        'Arts. 66-68', 25);
    } else if (hx === 'si') {
      ok('Horas extra pagadas', 'Reportas que te pagan el tiempo extra.', 'Art. 67');
      if (extraSem > 9) {
        alerta('y', 'Revisa el pago triple',
          `Con ~${extraSem.toFixed(1)} h extra por semana, las que pasan de 9 deben pagarse al triple, no al doble.`, 'Art. 68', 5);
      } else if (extraSem > 0) {
        alerta('y', 'Verifica que sea pago doble',
          `Tus horas extra (hasta 9 por semana) deben pagarse al doble: tu hora ordinaria (${mx(diario / 8)}) × 2 = ${mx(diario / 8 * 2)} por hora.`,
          'Art. 67');
      }
    } else if (extraDia > 0) {
      grave = true;
      alerta('r', 'Horas extra no reconocidas',
        `Declaras jornadas de ${h} h pero dices no hacer horas extra: las horas que pasan de 8 deben registrarse y pagarse como tiempo extraordinario.`,
        'Arts. 66-68', 20);
    }
  } else {
    ok('Sin tiempo extra', 'No reportas horas extraordinarias.', 'Art. 66');
  }

  // Prima dominical
  if (fin === 'dom' || fin === 'ambos') {
    alerta('y', 'Prima dominical',
      `Por trabajar domingos te corresponde una prima de al menos 25% sobre tu salario diario (${mx(diario * 0.25)} por domingo laborado). Verifica que aparezca en tu recibo.`,
      'Art. 71', 3);
  }

  // Salario mínimo (proporcional si la jornada es menor a 8 h)
  const parcial = h < 8;
  const minimoJornada = parcial ? minimo * h / 8 : minimo;
  if (diario < minimoJornada - 0.005) {
    grave = true;
    alerta('r', 'Salario por debajo del mínimo',
      parcial
        ? `Tu salario equivale a ${mx(diario)} diarios por una jornada de ${h} h; el mínimo proporcional vigente en tu zona es ${mx(minimoJornada)} (mínimo diario: ${mx(minimo)}).`
        : `Tu salario equivale a ${mx(diario)} diarios y el mínimo vigente en tu zona es ${mx(minimo)}. Ningún salario puede ser inferior al mínimo.`,
      'Arts. 90 y 91', 25);
  } else {
    ok('Salario igual o mayor al mínimo',
      `Equivale a ${mx(diario)} diarios; el mínimo vigente es ${mx(minimoJornada)}${parcial ? ' (proporcional a tu jornada)' : ''}.`,
      'Art. 90');
  }

  // Trato
  if (tr === 'si') {
    ok('Buen ambiente laboral', 'Reportas buen trato, factor protector frente al riesgo psicosocial.', 'NOM-035-STPS');
  } else {
    alerta(tr === 'no' ? 'r' : 'y',
      tr === 'no' ? 'Mal trato: posible riesgo psicosocial' : 'Trato irregular en el trabajo',
      (tr === 'no'
        ? 'El maltrato, hostigamiento o acoso laboral es un factor de riesgo psicosocial; tu empresa debe identificarlo, prevenirlo y contar con un mecanismo de quejas. '
        : 'Si el trato inadecuado se repite, podría constituir un factor de riesgo psicosocial. ') +
      'El patrón debe tratarte con respeto y abstenerse de maltrato de palabra o de obra.',
      'NOM-035 · Arts. 3 Bis, 51-II y 132-VI', tr === 'no' ? 15 : 7);
  }

  puntaje = Math.max(0, Math.min(100, Math.round(puntaje)));
  if (grave) puntaje = Math.min(puntaje, 74);
  const estado = puntaje >= 80
    ? { etiqueta: 'En regla', nivel: 'g' as const }
    : puntaje >= 50
    ? { etiqueta: 'Atención', nivel: 'y' as const }
    : { etiqueta: 'Posible violación de derechos', nivel: 'r' as const };

  const recomendaciones = ['Guarda evidencias: recibos de nómina, contrato, registros de entrada/salida, mensajes y testigos.'];
  if (alertas.length) {
    recomendaciones.push(
      'Acércate a la PROFEDET (asesoría gratuita): 800 911 7877 o en profedet.gob.mx.',
      'Antes de demandar, el trámite de conciliación se inicia en el Centro Federal de Conciliación y Registro Laboral o el centro local de tu estado.',
      'Puedes pedir primero a tu empleador, por escrito, la corrección de pagos y horarios.',
      'Actúa con tiempo: las acciones por incumplimiento generalmente prescriben en 1 año (Art. 516).'
    );
  }
  if (tr !== 'si') {
    recomendaciones.push('Solicita a tu empresa el protocolo y buzón de quejas de NOM-035; si hay acoso, denúncialo ante la STPS o la PROFEDET.');
  }
  if (!alertas.length) {
    recomendaciones.push('Sigue verificando tu recibo de nómina y tu contrato periódicamente; vas bien.');
  }

  const orden = { r: 0, y: 1 };
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);

  return {
    puntaje,
    estado,
    salarioDiario: Math.round(diario * 100) / 100,
    fortalezas,
    alertas,
    recomendaciones
  };
}
