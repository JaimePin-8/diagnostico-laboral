// Manejador HTTP de la función "diagnosticar". Recibe sus dependencias para poder probarlo sin red.
import { diagnosticar, validar } from './diagnostico.ts';

export interface Fila {
  ip_hash: string;
  horas_dia: number;
  fin_semana: string;
  salario_diario: number;
  zona: string;
  horas_extra: string;
  horas_extra_semana: number | null;
  descanso_min: number;
  trato: string;
  puntaje: number;
  estado: string;
}

export interface Store {
  contar(ipHash: string, desde: Date): Promise<number>;
  guardar(fila: Fila): Promise<void>;
}

export interface Entorno {
  allowedOrigins: string[];
  ipSalt: string;
  maxPorVentana: number;
  ventanaMin: number;
}

const MAX_CUERPO = 2048;

const hex = async (texto: string) => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export function createHandler({ store, env }: { store: Store; env: Entorno }) {
  const responder = (status: number, cuerpo: unknown, extra: Record<string, string> = {}) =>
    new Response(cuerpo === null ? null : JSON.stringify(cuerpo), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }
    });

  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const permitido = origin !== null && env.allowedOrigins.includes(origin);
    // El navegador solo expone la respuesta a orígenes autorizados; los demás reciben 403.
    if (origin !== null && !permitido) return responder(403, { error: 'origen_no_permitido' });
    const cors: Record<string, string> = permitido
      ? {
        'Access-Control-Allow-Origin': origin!,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
      }
      : {};

    if (req.method === 'OPTIONS') return responder(204, null, cors);
    if (req.method !== 'POST') return responder(405, { error: 'metodo_no_permitido' }, cors);
    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return responder(415, { error: 'tipo_no_soportado' }, cors);
    }
    if (Number(req.headers.get('content-length') ?? 0) > MAX_CUERPO) {
      return responder(413, { error: 'cuerpo_demasiado_grande' }, cors);
    }

    const texto = await req.text();
    if (texto.length > MAX_CUERPO) return responder(413, { error: 'cuerpo_demasiado_grande' }, cors);
    let raw: unknown;
    try {
      raw = JSON.parse(texto);
    } catch {
      return responder(400, { error: 'json_invalido' }, cors);
    }
    const v = validar(raw);
    if (!v.ok) return responder(400, { error: 'datos_invalidos', campos: v.errores }, cors);

    try {
      const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
        'desconocida';
      const ipHash = await hex(`${env.ipSalt}:${ip}`);
      const desde = new Date(Date.now() - env.ventanaMin * 60_000);
      if (await store.contar(ipHash, desde) >= env.maxPorVentana) {
        return responder(429, { error: 'demasiados_intentos' }, { ...cors, 'Retry-After': String(env.ventanaMin * 60) });
      }

      const resultado = diagnosticar(v.datos);
      const d = v.datos;
      try {
        await store.guardar({
          ip_hash: ipHash,
          horas_dia: d.horas,
          fin_semana: d.fin,
          salario_diario: resultado.salarioDiario,
          zona: d.zona,
          horas_extra: d.horasExtra,
          horas_extra_semana: d.horasExtraSemana,
          descanso_min: d.descanso ? d.descansoMin : 0,
          trato: d.trato,
          puntaje: resultado.puntaje,
          estado: resultado.estado.etiqueta
        });
      } catch (e) {
        // Perder el registro estadístico no debe impedir que la persona vea su diagnóstico.
        console.error('No se pudo guardar la respuesta:', e);
      }
      return responder(200, resultado, cors);
    } catch (e) {
      console.error('Error interno:', e);
      return responder(500, { error: 'error_interno' }, cors);
    }
  };
}
