// Interfaz del diagnóstico. Las reglas de la LFT se calculan en el servidor (función "diagnosticar").
const API = window.APP_CONFIG && window.APP_CONFIG.API_URL;
const $ = id => document.getElementById(id);
const val = n => document.querySelector('input[name="' + n + '"]:checked').value;
const mx = n => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CAMPOS = { horas: 'e-horas', salario: 'e-sal', horasExtraSemana: 'e-hxs' };

// Construye nodos con textContent (nunca innerHTML) para que ningún texto se interprete como HTML.
function el(tag, cls, ...hijos) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  hijos.filter(Boolean).forEach(h => n.append(h));
  return n;
}

function sync() {
  $('qhx').hidden = val('hx') === 'nh';
  $('qdes').hidden = val('des') === 'no';
}
document.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', sync));

function leer() {
  const hxs = $('hxs').value;
  return {
    horas: parseFloat($('horas').value),
    fin: val('fin'),
    salario: parseFloat($('sal').value),
    periodo: $('per').value,
    zona: $('zona').value,
    horasExtra: val('hx'),
    horasExtraSemana: val('hx') !== 'nh' && hxs !== '' ? parseFloat(hxs) : null,
    descanso: val('des') === 'si',
    descansoMin: parseInt($('min').value, 10),
    trato: val('tr')
  };
}

function limpiarErrores() {
  Object.values(CAMPOS).concat('e-gen').forEach(id => { $(id).textContent = ''; });
}

function mostrarErrores(campos) {
  Object.keys(campos).forEach(k => { if (CAMPOS[k]) $(CAMPOS[k]).textContent = campos[k]; });
  const primero = Object.keys(campos).map(k => CAMPOS[k]).find(Boolean);
  if (primero) $(primero).closest('.q').scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function validarLocal(d) {
  const e = {};
  if (!(d.horas >= 0.5 && d.horas <= 24)) e.horas = 'Ingresa las horas diarias (de 0.5 a 24).';
  if (!(d.salario > 0)) e.salario = 'Ingresa tu salario.';
  if (d.horasExtraSemana !== null && !(d.horasExtraSemana >= 0 && d.horasExtraSemana <= 100)) e.horasExtraSemana = 'Ingresa un valor entre 0 y 100.';
  return e;
}

async function consultar(datos) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
      signal: ctrl.signal,
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    });
    const cuerpo = await res.json().catch(() => ({}));
    return { status: res.status, cuerpo };
  } finally {
    clearTimeout(t);
  }
}

const NIVEL = { g: 'Cumple', y: 'Revisar', r: 'Grave' };

function hallazgo(nivel, h) {
  return el('div', 'it ' + nivel,
    el('span', 'tag', NIVEL[nivel]),
    el('b', null, h.titulo),
    el('p', null, h.detalle),
    el('span', 'ref', h.ref));
}

function seccion(titulo, hijos, vacio) {
  const s = el('section', 'card sec', el('h2', null, titulo));
  if (hijos.length) hijos.forEach(h => s.append(h));
  else s.append(el('p', 'vacio', vacio));
  return s;
}

function pintar(r, puesto) {
  const out = $('out');
  const anillo = el('div', 'ring ' + r.estado.nivel, el('div', null, el('strong', null, String(r.puntaje)), el('span', null, 'de 100')));
  anillo.style.setProperty('--p', r.puntaje);
  const resumen = el('div', 'card resumen', anillo,
    el('div', null,
      el('p', 'estado ' + r.estado.nivel, r.estado.etiqueta),
      puesto ? el('p', 'dato', 'Puesto: ', el('b', null, puesto)) : null,
      el('p', 'dato', 'Salario diario equivalente: ', el('b', null, mx(r.salarioDiario)))));

  const recs = el('ol');
  r.recomendaciones.forEach(x => recs.append(el('li', null, x)));
  const acciones = el('div', 'acciones');
  const otro = el('button', 'alt', 'Hacer otro diagnóstico');
  otro.type = 'button';
  otro.onclick = () => { out.hidden = true; $('f').hidden = false; window.scrollTo(0, 0); $('puesto').focus({ preventScroll: true }); };
  const imprimir = el('button', 'alt', 'Imprimir o guardar en PDF');
  imprimir.type = 'button';
  imprimir.onclick = () => window.print();
  acciones.append(otro, imprimir);

  out.replaceChildren(
    resumen,
    seccion('Puntos a favor', r.fortalezas.map(h => hallazgo('g', h)), 'No se identificaron cumplimientos claros con los datos ingresados.'),
    seccion('Alertas e irregularidades', r.alertas.map(a => hallazgo(a.nivel, a)), 'No se detectaron irregularidades.'),
    el('section', 'card sec', el('h2', null, 'Recomendaciones'), recs),
    acciones);
  $('f').hidden = true;
  out.hidden = false;
  window.scrollTo(0, 0);
  out.focus({ preventScroll: true });
}

$('f').addEventListener('submit', async ev => {
  ev.preventDefault();
  limpiarErrores();
  const datos = leer();
  const locales = validarLocal(datos);
  if (Object.keys(locales).length) return mostrarErrores(locales);

  const boton = $('go');
  boton.disabled = true;
  boton.textContent = 'Calculando...';
  try {
    const { status, cuerpo } = await consultar(datos);
    if (status === 200) pintar(cuerpo, $('puesto').value.trim());
    else if (status === 400 && cuerpo.campos) mostrarErrores(cuerpo.campos);
    else if (status === 429) $('e-gen').textContent = 'Has enviado muchas solicitudes seguidas. Espera unos minutos e inténtalo de nuevo.';
    else $('e-gen').textContent = 'No fue posible calcular tu diagnóstico. Inténtalo de nuevo en unos momentos.';
  } catch {
    $('e-gen').textContent = 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  } finally {
    boton.disabled = false;
    boton.textContent = 'Ver mi diagnóstico';
  }
});

sync();
