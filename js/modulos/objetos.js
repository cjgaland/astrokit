/* ==========================================================================
   modulos/objetos.js — Biblioteca · Objetos celestes (#objetos)
   --------------------------------------------------------------------------
   El catálogo de objetos como una enciclopedia de bolsillo:
     · Lista con buscador y filtros (Todos, Galaxias, Nebulosas, Cúmulos,
       Sistema Solar), ordenable por próxima mejor fecha, catálogo o brillo.
     · Ficha de cada objeto (#objetos/m31): datos, consejo, cómo encaja en
       «mi equipo» y sus MEJORES FECHAS desde el lugar del planificador.

   Cómo se eligen las mejores fechas:
     · Cielo profundo: se calculan las próximas 13 noches de Luna nueva (las
       más oscuras de cada mes) y, en cada una, cuántas horas pasa el objeto
       por encima de 30° con noche astronómica. Las mejores son las noches con
       más horas útiles. Se guarda en el dispositivo para no recalcular.
     · Planetas: su próxima oposición (exteriores) o máxima elongación
       (Mercurio y Venus).
     · La Luna: sus próximas fases; los cuartos son los mejores para los cráteres.
   ========================================================================== */

import { cargarJSON, escaparHTML, icono, pestanas, normalizar, resaltar } from '../util.js';
import { leer, guardar } from '../almacen.js';
import * as A from '../calculos/astro.js';
import * as O from '../calculos/optica.js';
import { miEquipo } from '../equipo.js';

const TIPOS = [
  { id: 'todos', texto: 'Todos' },
  { id: 'galaxia', texto: 'Galaxias' },
  { id: 'nebulosa', texto: 'Nebulosas' },
  { id: 'cumulo', texto: 'Cúmulos' },
  { id: 'sistema', texto: 'Sistema Solar' },
];
const ORDENES = [
  { id: 'fecha', texto: 'Próxima mejor fecha' },
  { id: 'catalogo', texto: 'Catálogo' },
  { id: 'brillo', texto: 'Más brillantes' },
];
const NOMBRE_TIPO = {
  'galaxia': 'Galaxia', 'nebulosa-emision': 'Nebulosa de emisión', 'nebulosa-reflexion': 'Nebulosa de reflexión',
  'nebulosa-planetaria': 'Nebulosa planetaria', 'remanente': 'Remanente de supernova', 'cumulo-abierto': 'Cúmulo abierto',
  'cumulo-globular': 'Cúmulo globular', 'planeta': 'Planeta', 'luna': 'Satélite',
};
const COLOR_TIPO = (t) => t === 'planeta' || t === 'luna' ? 'b3' : t.startsWith('galaxia') ? 'b1' : t.startsWith('cumulo') ? 'b4'
  : ['nebulosa-emision', 'remanente', 'nebulosa-planetaria'].includes(t) ? 'b5' : 'b2';
const PLANETAS = {
  mercurio: { nombre: 'Mercurio', consejo: 'Siempre cerca del Sol: búscalo en el crepúsculo, en sus máximas elongaciones.' },
  venus: { nombre: 'Venus', consejo: 'El astro más brillante tras el Sol y la Luna, con fases como la Luna. Exposiciones muy cortas.' },
  marte: { nombre: 'Marte', consejo: 'Solo muestra detalle cerca de la oposición, cada 26 meses.' },
  jupiter: { nombre: 'Júpiter', consejo: 'Sus cuatro grandes lunas cambian de posición cada noche; las bandas piden vídeo y lucky imaging.' },
  saturno: { nombre: 'Saturno', consejo: 'Los anillos se distinguen incluso con 50 mm. El objeto que más impresiona a quien mira por primera vez.' },
  urano: { nombre: 'Urano', consejo: 'Un puntito verdoso: el reto es identificarlo entre las estrellas.' },
  neptuno: { nombre: 'Neptuno', consejo: 'Aún más tenue que Urano: hace falta un mapa del campo para encontrarlo.' },
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ALTURA_UTIL = 30;

const estado = {
  consulta: '',
  tipo: leer('objetos:tipo', 'todos'),
  orden: leer('objetos:orden', 'fecha'),
  scroll: 0,
};

let raiz = null;
let catalogo = [];          // objetos de cielo profundo + planetas + Luna
let lugar = null;
let temporadas = null;      // { lunas: [Date], util: { id: [minutos por Luna nueva] } }
let planetas = {};          // id → mejorMomentoPlaneta(...)
let vista = null;

/* ---------- Formato ---------- */
// Día y mes; el año solo si no es el actual (p. ej. «31 ago 2027»)
const fechaCorta = (f) => f.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(f.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
const fechaLarga = (f) => f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const aTexto = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
const duracion = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`; };
const grados = (x, d = 0) => x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + '°';
const esSolar = (o) => o.tipo === 'planeta' || o.tipo === 'luna';

/* ==========================================================================
   Montaje
   ========================================================================== */
export async function montar(contenedor, parametro) {
  raiz = contenedor;
  const C = await import('./cielo.js');
  lugar = C.lugarActivo();
  const { objetos } = await cargarJSON('data/objetos.json');
  catalogo = [
    ...objetos.filter((o) => o.ar !== undefined),
    ...Object.entries(PLANETAS).map(([id, p]) => ({ id, nombre: p.nombre, catalogo: 'Planeta', tipo: 'planeta', consejo: p.consejo, constelacion: '—' })),
    { id: 'luna-cielo', nombre: 'La Luna', catalogo: 'Satélite', tipo: 'luna', constelacion: '—',
      consejo: 'Los cuartos creciente y menguante son los mejores: la luz rasante del terminador marca el relieve de los cráteres.' },
  ];
  raiz.addEventListener('click', alHacerClic);
  raiz.addEventListener('input', alEscribir);
  raiz.addEventListener('change', alCambiar);
  actualizar(parametro);
  prepararTemporadas(C);          // en segundo plano: rellena las fechas cuando termina
  return { actualizar, desmontar };
}

function desmontar() {
  if (vista === 'lista') estado.scroll = window.scrollY;
  raiz.removeEventListener('click', alHacerClic);
  raiz.removeEventListener('input', alEscribir);
  raiz.removeEventListener('change', alCambiar);
}

function actualizar(parametro) {
  if (vista === 'lista') estado.scroll = window.scrollY;
  const o = parametro && catalogo.find((x) => x.id === parametro);
  if (o) { pintarFicha(o); window.scrollTo(0, 0); }
  else { pintarLista(); requestAnimationFrame(() => window.scrollTo(0, estado.scroll)); }
}

/* ==========================================================================
   Cálculo de temporadas (las 12 próximas Lunas nuevas)
   ========================================================================== */
async function prepararTemporadas(C) {
  const hoy = new Date();
  const clave = `v2,${lugar.lat.toFixed(2)},${lugar.lon.toFixed(2)},${aTexto(hoy).slice(0, 7)}`;
  const guardado = leer('objetos:temporadas', null);
  if (guardado?.clave === clave) {
    temporadas = { lunas: guardado.lunas.map((t) => new Date(t)), util: guardado.util };
  } else {
    await C.prepararCatalogo();
    const lunas = [], util = {};
    let desde = new Date(hoy.getTime() - 3 * 86400000);   // por si la Luna nueva fue anteayer
    // 13 lunaciones (≈ 384 días): así siempre hay al menos una Luna nueva en cada mes del año
    for (let i = 0; i < 13; i++) {
      const nueva = A.proximaFase(desde, 0);
      if (!nueva) break;
      const mediodia = new Date(nueva.getFullYear(), nueva.getMonth(), nueva.getDate(), 12);
      const n = C.calcularNoche(lugar, mediodia);
      lunas.push(mediodia);
      for (const x of n.objetos) if (!esSolar(x.o)) (util[x.o.id] ||= []).push(x.util);
      desde = new Date(nueva.getTime() + 2 * 86400000);
      await new Promise((r) => setTimeout(r, 0));             // deja respirar a la pantalla
    }
    temporadas = { lunas, util };
    guardar('objetos:temporadas', { clave, lunas: lunas.map((d) => d.toISOString()), util });
  }
  // Planetas: su próximo mejor momento (oposición o máxima elongación)
  for (const id of Object.keys(PLANETAS)) planetas[id] = A.mejorMomentoPlaneta(id, hoy);
  if (raiz?.isConnected) (vista === 'lista' ? pintarResultados() : pintarFicha(catalogo.find((x) => x.id === vista)));
}

/** Las mejores fechas de un objeto: hasta `max` noches de Luna nueva con más horas útiles, en orden cronológico */
function mejoresFechas(o, max = 3) {
  if (!temporadas) return null;
  if (o.tipo === 'planeta') {
    const m = planetas[o.id];
    return m ? [{ fecha: m.fecha, texto: m.tipo }] : [];
  }
  if (o.tipo === 'luna') {
    const hoy = new Date();
    return [
      { fecha: A.proximaFase(hoy, 90), texto: 'cuarto creciente' },
      { fecha: A.proximaFase(hoy, 180), texto: 'Luna llena' },
      { fecha: A.proximaFase(hoy, 270), texto: 'cuarto menguante' },
    ].filter((f) => f.fecha).sort((a, b) => a.fecha - b.fecha);
  }
  const util = temporadas.util[o.id] || [];
  const tope = Math.max(...util, 0);
  if (tope < 60) return [];
  return temporadas.lunas
    .map((fecha, i) => ({ fecha, util: util[i] || 0 }))
    .filter((f) => f.util >= Math.max(60, tope * 0.75))
    .slice(0, max)
    .map((f) => ({ ...f, texto: `${duracion(f.util)} útiles` }));
}

/**
 * Temporada: el tramo de meses (puede cruzar el fin de año) en que la noche de
 * Luna nueva ofrece al menos la mitad de las mejores horas útiles del año.
 * Ej.: «de noviembre a marzo».
 */
function temporadaTexto(o) {
  if (!temporadas || esSolar(o)) return '';
  const util = temporadas.util[o.id] || [];
  const tope = Math.max(...util, 0);
  if (tope < 60) return '';
  const buenos = new Set(temporadas.lunas.filter((_, i) => (util[i] || 0) >= Math.max(60, tope * 0.5)).map((f) => f.getMonth()));
  if (buenos.size >= 11) return 'todo el año';
  // El tramo seguido más largo en el calendario circular (diciembre va pegado a enero)
  let mejor = null;
  for (let m = 0; m < 12; m++) {
    if (!buenos.has(m) || buenos.has((m + 11) % 12)) continue;    // m tiene que ser el inicio de un tramo
    let fin = m, largo = 1;
    while (buenos.has((fin + 1) % 12) && largo < 12) { fin = (fin + 1) % 12; largo++; }
    if (!mejor || largo > mejor.largo) mejor = { inicio: m, fin, largo };
  }
  if (!mejor) return '';
  return mejor.largo === 1 ? MESES[mejor.inicio] : `de ${MESES[mejor.inicio]} a ${MESES[mejor.fin]}`;
}

/** Mes en que culmina a medianoche (útil para los que nunca superan 30° desde aquí) */
function mesMedianoche(o) {
  let mejor = 0, menor = 999;
  for (let m = 0; m < 12; m++) {
    const H = Math.abs(((A.tiempoSidereoLocal(new Date(new Date().getFullYear(), m, 15, 0, 0), lugar.lon) - o.ar * 15 + 540) % 360) - 180);
    if (H < menor) { menor = H; mejor = m; }
  }
  return MESES[mejor];
}

/* ==========================================================================
   Vista LISTA
   ========================================================================== */
function pintarLista() {
  vista = 'lista';
  raiz.innerHTML = `
    <section class="objetos-celestes entrada">
      ${pestanas('biblioteca', 'objetos')}
      <header class="modulo__cabecera">
        <span class="etiqueta">Biblioteca · ${catalogo.length} objetos</span>
        <h1 class="titular">Objetos <em>celestes</em>.</h1>
        <p class="entradilla">Galaxias, nebulosas, cúmulos, planetas y la Luna, con sus mejores fechas para
          observarlos desde ${escaparHTML(lugar.nombre)}.</p>
      </header>

      <div class="buscador">
        ${icono('buscar', 'buscador__lupa')}
        <input id="busqueda-objetos" type="search" placeholder="Buscar: Andrómeda, M42, Orión, Saturno…"
               autocomplete="off" spellcheck="false" aria-label="Buscar objetos celestes" value="${escaparHTML(estado.consulta)}">
      </div>
      <div class="filtros" role="group" aria-label="Tipo de objeto">
        ${TIPOS.map((t) => `<button class="chip chip--estado" type="button" data-tipo="${t.id}">${t.texto}</button>`).join('')}
      </div>
      <label class="orden-objetos">
        <span class="etiqueta">Ordenar por</span>
        <select id="orden-objetos">${ORDENES.map((o) => `<option value="${o.id}" ${o.id === estado.orden ? 'selected' : ''}>${o.texto}</option>`).join('')}</select>
      </label>
      <div id="resultados-objetos" aria-live="polite"></div>
    </section>`;
  pintarResultados();
}

function filtrar() {
  const palabras = normalizar(estado.consulta).split(/\s+/).filter(Boolean);
  const pasaTipo = (o) => estado.tipo === 'todos' || (estado.tipo === 'sistema' ? esSolar(o) : !esSolar(o) && o.tipo.startsWith(estado.tipo));
  let lista = catalogo.filter((o) => pasaTipo(o) && palabras.every((p) =>
    normalizar([o.nombre, o.catalogo, o.constelacion, NOMBRE_TIPO[o.tipo]].join(' ')).includes(p)));
  const proxima = (o) => mejoresFechas(o, 1)?.[0]?.fecha?.getTime() ?? Infinity;
  if (estado.orden === 'fecha' && temporadas) lista = lista.slice().sort((a, b) => proxima(a) - proxima(b));
  if (estado.orden === 'brillo') lista = lista.slice().sort((a, b) => (a.mag ?? -30) - (b.mag ?? -30));
  return { lista, palabras };
}

function pintarResultados() {
  const caja = raiz.querySelector('#resultados-objetos');
  if (!caja) return;
  raiz.querySelectorAll('[data-tipo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === estado.tipo)));
  const { lista, palabras } = filtrar();
  if (!lista.length) {
    caja.innerHTML = '<div class="vacio"><p class="vacio__titulo">Ningún objeto coincide.</p><p>Prueba con otra palabra o quita el filtro.</p></div>';
    return;
  }
  caja.innerHTML = `
    ${temporadas ? '' : '<p class="nota">Calculando las mejores fechas de los próximos doce meses…</p>'}
    <ul class="tarjetas">
      ${lista.map((o) => {
        const fechas = mejoresFechas(o);
        const fechasHtml = fechas === null ? '<span class="nota">…</span>'
          : fechas.length ? fechas.map((f) => `<span class="fecha-chip cifra">${fechaCorta(f.fecha)}</span>`).join('')
          : `<span class="nota">Bajo desde aquí · mejor en ${mesMedianoche(o)}</span>`;
        return `
        <li class="tarjeta" style="--color: var(--${COLOR_TIPO(o.tipo)})">
          <a class="tarjeta__enlace" href="#objetos/${o.id}">
            <span class="tarjeta__bloque cifra">${resaltar(o.catalogo, palabras)}${o.constelacion !== '—' ? ` · ${resaltar(o.constelacion, palabras)}` : ''}</span>
            <span class="tarjeta__nombre">${resaltar(o.nombre, palabras)}</span>
            <span class="tarjeta__alias">${NOMBRE_TIPO[o.tipo]}${o.mag !== undefined ? ` · mag ${o.mag.toLocaleString('es-ES')}` : ''}${o.ancho ? ` · ${o.ancho}′×${o.alto}′` : ''}</span>
            <span class="objeto-fechas"><span class="etiqueta">Mejor</span>${fechasHtml}</span>
          </a>
        </li>`;
      }).join('')}
    </ul>`;
}

/* ==========================================================================
   Vista FICHA
   ========================================================================== */
async function pintarFicha(o) {
  vista = o.id;
  const equipo = await miEquipo();
  if (vista !== o.id) return;
  const fechas = mejoresFechas(o, 4);
  const filas = [];
  const fila = (a, b) => b ? filas.push(`<dt>${a}</dt><dd>${b}</dd>`) : null;
  let encuadre = '';

  if (!esSolar(o)) {
    fila('Tipo', NOMBRE_TIPO[o.tipo]);
    fila('Constelación', escaparHTML(o.constelacion));
    fila('Magnitud', o.mag.toLocaleString('es-ES'));
    fila('Tamaño', `${o.ancho}′ × ${o.alto}′`);
    fila('Coordenadas', `AR ${Math.floor(o.ar)}h ${String(Math.round((o.ar % 1) * 60)).padStart(2, '0')}m · Dec ${o.dec >= 0 ? '+' : '−'}${grados(Math.abs(o.dec), 1)}`);
    const altMax = A.alturaMaxima(o.dec, lugar.lat);
    fila(`Altura máx. desde ${escaparHTML(lugar.nombre)}`, altMax > 0 ? grados(altMax) + (altMax < ALTURA_UTIL ? ' · siempre bajo' : '') : 'no sale');
    fila('Temporada', temporadaTexto(o) || (temporadas ? `culmina a medianoche en ${mesMedianoche(o)}` : '…'));
    // ¿Cómo encaja en mi equipo?
    const fw = O.campoVision(O.tamanoSensor(equipo.resX, equipo.pixel), equipo.focal) * 60;
    const fh = O.campoVision(O.tamanoSensor(equipo.resY, equipo.pixel), equipo.focal) * 60;
    const ocupa = Math.max(o.ancho / fw, o.alto / fh);
    const mos = O.panelesMosaico(o.ancho, o.alto, fw, fh);
    encuadre = `
      <aside class="capa capa--cuenta">
        <span class="etiqueta">${icono('telescopio')} Con tu ${escaparHTML(equipo.corto)}</span>
        <p>${ocupa > 1 ? `No cabe en un encuadre: mosaico de ${mos.columnas} × ${mos.filas} paneles.`
          : `Ocupa el ${Math.round(ocupa * 100)} % del campo (${Math.round(fw)}′ × ${Math.round(fh)}′)${ocupa < 0.15 ? ': saldrá pequeño.' : '.'}`}
          <a href="#optica">Ver en la calculadora</a></p>
      </aside>`;
  } else if (o.tipo === 'planeta') {
    const p = A.posicionPlaneta(o.id, new Date());
    fila('Tipo', 'Planeta');
    fila('Ahora', `mag ${p.magnitud.toLocaleString('es-ES', { maximumFractionDigits: 1 })} · ${p.diametro.toLocaleString('es-ES', { maximumFractionDigits: 1 })}″ · a ${Math.round(p.elongacion)}° del Sol`);
    fila('Distancia', `${p.distancia.toLocaleString('es-ES', { maximumFractionDigits: 2 })} UA`);
    fila(`Tamaño con tu ${escaparHTML(equipo.corto)}`, `≈ ${Math.round(p.diametro / equipo.escala)} px`);
  } else {
    const f = A.faseLunar(new Date());
    fila('Ahora', `${f.nombre} · ${Math.round(f.iluminada * 100)} % iluminada`);
    fila('Tamaño', `≈ 31′ · ocupa ${Math.round(31 / (O.campoVision(O.tamanoSensor(equipo.resY, equipo.pixel), equipo.focal) * 60) * 100)} % del alto del campo de tu ${escaparHTML(equipo.corto)}`);
  }

  const listaFechas = fechas === null ? '<p class="nota">Calculando…</p>'
    : !fechas.length ? `<p class="nota">Desde ${escaparHTML(lugar.nombre)} no sube por encima de ${ALTURA_UTIL}° con noche cerrada. Su mejor momento es cuando culmina a medianoche, en ${mesMedianoche(o)}: fotografíalo justo al culminar, mirando al sur.</p>`
    : `<ul class="mejores-fechas">${fechas.map((f) => `
        <li>
          <span class="mejores-fechas__dia">${fechaLarga(f.fecha)}</span>
          <span class="mejores-fechas__dato cifra">${escaparHTML(f.texto)}</span>
          <a class="boton-sec" href="#cielo/${aTexto(f.fecha)}">${icono('cielo')}Planificar</a>
        </li>`).join('')}</ul>`;

  raiz.innerHTML = `
    <article class="ficha entrada" style="--color: var(--${COLOR_TIPO(o.tipo)})">
      ${pestanas('biblioteca', 'objetos')}
      <nav class="ficha__migas">
        <a href="#objetos" class="ficha__volver">${icono('atras')}Objetos celestes</a>
        <span class="ficha__bloque cifra">${escaparHTML(o.catalogo)}</span>
      </nav>
      <header class="ficha__cabecera">
        <h1 class="ficha__titulo">${escaparHTML(o.nombre)}</h1>
        <p class="ficha__alias">${escaparHTML(o.catalogo)}${o.constelacion !== '—' ? ` · ${escaparHTML(o.constelacion)}` : ''}</p>
        <div class="ficha__regla-color"></div>
      </header>
      <dl class="datos cifra ficha-objeto__datos">${filas.join('')}</dl>
      ${o.consejo ? `<aside class="capa capa--analogia"><span class="etiqueta">Consejo</span><p>${escaparHTML(o.consejo)}</p></aside>` : ''}
      ${encuadre}
      <section class="ficha-objeto__fechas">
        <h2 class="panel__titulo">${o.tipo === 'luna' ? 'Próximas fases' : o.tipo === 'planeta' ? 'Su mejor momento' : 'Mejores fechas'}</h2>
        ${o.tipo !== 'luna' && o.tipo !== 'planeta' ? `<p class="nota">Noches de Luna nueva de los próximos doce meses con más horas por encima de ${ALTURA_UTIL}° y noche cerrada, desde ${escaparHTML(lugar.nombre)}.</p>` : ''}
        ${listaFechas}
      </section>
      <div class="ficha__acciones">
        <a class="boton-marca" href="#mapa/${o.id}">${icono('cielo')}<span>Ver en el mapa celeste</span></a>
      </div>
    </article>`;
}

/* ==========================================================================
   Eventos
   ========================================================================== */
function alHacerClic(e) {
  const b = e.target.closest('button[data-tipo]');
  if (!b) return;
  estado.tipo = b.dataset.tipo;
  guardar('objetos:tipo', estado.tipo);
  pintarResultados();
}
function alEscribir(e) {
  if (e.target.id !== 'busqueda-objetos') return;
  estado.consulta = e.target.value;
  pintarResultados();
}
function alCambiar(e) {
  if (e.target.id !== 'orden-objetos') return;
  estado.orden = e.target.value;
  guardar('objetos:orden', estado.orden);
  pintarResultados();
}
