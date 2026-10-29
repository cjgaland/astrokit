/* ==========================================================================
   modulos/mapa.js — Cielo · Mapa celeste (#mapa, #mapa/<id de objeto>)
   --------------------------------------------------------------------------
   El cielo visible desde tu lugar en una fecha y hora (por defecto, ahora):
   estrellas hasta la magnitud que elijas (2 a 6), las 88 constelaciones con sus nombres, los
   objetos del catálogo, los planetas, la Luna y el Sol si está sobre el
   horizonte.

   · Proyección estereográfica centrada en el cénit (js/calculos/proyeccion.js):
     el centro es lo que tienes sobre la cabeza y el borde, el horizonte.
     Norte arriba y ESTE A LA IZQUIERDA, como un planisferio sobre la cabeza.
   · Interactivo: rueda o pellizco para acercar, arrastrar para moverse,
     doble clic o doble toque para acercar ahí; al pasar el ratón o tocar un
     astro aparece su información.
   · Exportar: PNG (imagen) o PDF (A4), con lugar, fecha y hora.

   Datos de estrellas y constelaciones: data/cielo.json (d3-celestial, BSD-3).
   ========================================================================== */

import { cargarJSON, escaparHTML, icono, pestanas } from '../util.js';
import { leer, guardar } from '../almacen.js';
import * as A from '../calculos/astro.js';
import { proyectar } from '../calculos/proyeccion.js';
import { pdfConImagen } from '../pdf.js';
import * as F from '../calculos/efemerides.js';

const RAD = Math.PI / 180;
const NOMBRE_PLANETA = { mercurio: 'Mercurio', venus: 'Venus', marte: 'Marte', jupiter: 'Júpiter', saturno: 'Saturno', urano: 'Urano', neptuno: 'Neptuno' };
const COLOR_PLANETA = { mercurio: '#c9b9a5', venus: '#fff4d6', marte: '#ff8a5c', jupiter: '#f2d1a0', saturno: '#e8d08f', urano: '#9fe0e0', neptuno: '#8fa8ff' };
const NOMBRE_TIPO = {
  'galaxia': 'Galaxia', 'nebulosa-emision': 'Nebulosa de emisión', 'nebulosa-reflexion': 'Nebulosa de reflexión',
  'nebulosa-planetaria': 'Nebulosa planetaria', 'remanente': 'Remanente de supernova', 'cumulo-abierto': 'Cúmulo abierto',
  'cumulo-globular': 'Cúmulo globular',
};

/* ---------- Estado ---------- */
const estado = {
  fecha: null,                                   // null = ahora (se actualiza cada minuto)
  capas: { ...{ lineas: true, nombres: true, objetos: true, cuadricula: true }, ...leer('mapa:capas', {}) },
  zoom: 1, panX: 0, panY: 0,                     // vista: escala y desplazamiento en píxeles CSS
  resaltado: null,                               // id de objeto destacado (#mapa/m31)
  magLimite: leer('mapa:magnitud', 5),           // estrellas hasta esta magnitud (deslizador)
};

/* Cielos típicos para el deslizador de magnitud. La magnitud límite es la de
   la estrella más débil que se ve a simple vista: cada magnitud es ×2,5 menos
   luz y, a la vez, unas 3 veces más estrellas (5 → 1.627; 6 → 5.044). */
const CIELOS = [
  { mag: 4, nombre: 'Ciudad', ayuda: 'Lo que se ve desde una ciudad como Córdoba' },
  { mag: 5, nombre: 'Afueras', ayuda: 'Pueblo o afueras de una ciudad' },
  { mag: 6, nombre: 'Campo oscuro', ayuda: 'Todo lo que alcanza el ojo en un buen cielo' },
];
let estrellasVisibles = 0;                       // cuántas se dibujaron sobre el horizonte
const decimal = (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });   // 4,5

let raiz = null, lienzo = null, ctx = null, globo = null;
let datos = null, objetos = [], lugar = null, lluvias = [], cometas = [];
let elementos = [];                              // lo dibujado que se puede señalar: { x, y, r, info }
let reloj = null, observador = null, observadorTema = null, pendiente = false;
const punteros = new Map();                      // para arrastrar y pellizcar
let gesto = null;

/* ---------- Paletas: cielo oscuro siempre; en modo noche, todo rojo ---------- */
function paleta() {
  if (document.documentElement.dataset.noche === 'si') {
    return { cielo: '#000000', borde: '#8a1600', lineas: 'rgba(200,30,0,0.45)', rejilla: 'rgba(200,30,0,0.18)',
      texto: '#c41a00', textoSuave: '#7a1200', constelacion: 'rgba(200,30,0,0.75)', objeto: '#e0240b', estrella: () => '#ff3300',
      sol: '#ff3300', luna: '#e0240b', sombraLuna: '#200300', planeta: () => '#ff3300', resalte: '#ff3300', fuera: '#050000' };
  }
  return { cielo: '#0b1222', borde: '#c9a85c', lineas: 'rgba(201,168,92,0.42)', rejilla: 'rgba(235,226,203,0.10)',
    texto: '#ebe2cb', textoSuave: '#8d93a3', constelacion: 'rgba(201,168,92,0.85)', objeto: '#5fd0c0',
    estrella: colorEstrella, sol: '#ffd36b', luna: '#f1e8d2', sombraLuna: '#2a3248', planeta: (id) => COLOR_PLANETA[id] || '#fff',
    resalte: '#f2a33a', fuera: '#070b16' };
}
/** Color por índice B−V: azuladas (calientes) → blancas → anaranjadas (frías) */
function colorEstrella(bv) {
  if (bv < 0) return '#b5c8ff';
  if (bv < 0.3) return '#dbe4ff';
  if (bv < 0.6) return '#fbf8ff';
  if (bv < 1.0) return '#fff1d6';
  if (bv < 1.4) return '#ffd8a8';
  return '#ffbf8a';
}

/* ==========================================================================
   Montaje
   ========================================================================== */
export async function montar(contenedor, parametro) {
  raiz = contenedor;
  const C = await import('./cielo.js');
  lugar = C.lugarActivo();
  [datos, { objetos }, { lluvias, cometas }] = await Promise.all([cargarJSON('data/cielo.json'), cargarJSON('data/objetos.json'), cargarJSON('data/efemerides.json')]);
  objetos = objetos.filter((o) => o.ar !== undefined);
  leerParametro(parametro);
  estado.zoom = 1; estado.panX = 0; estado.panY = 0;
  pintarEsqueleto();
  prepararLienzo();
  reloj = setInterval(() => { if (!estado.fecha) redibujar(); }, 60000);   // «ahora» avanza solo
  return { actualizar, desmontar };
}

function actualizar(parametro) {
  if (leerParametro(parametro)) sincronizarControles(); else redibujar();
}

/**
 * El parámetro de la ruta: «m31» resalta un objeto; «@2026-12-14T03:00» pone
 * esa fecha y hora (lo usan las Efemérides); «lluvia-gem@2026-12-14T03:00», las dos cosas.
 * Devuelve true si cambió la fecha.
 */
function leerParametro(parametro) {
  const [id, cuando] = (parametro || '').split('@');
  estado.resaltado = id || null;
  if (!cuando) return false;
  const f = new Date(cuando);
  if (Number.isNaN(f.getTime())) return false;
  estado.fecha = f;
  return true;
}

function desmontar() {
  clearInterval(reloj);
  observador?.disconnect();
  observadorTema?.disconnect();
}

const fechaActual = () => estado.fecha || new Date();
const dosCifras = (n) => String(n).padStart(2, '0');

function pintarEsqueleto() {
  const f = fechaActual();
  raiz.innerHTML = `
    <section class="mapa entrada">
      ${pestanas('cielo', 'mapa')}
      <header class="modulo__cabecera">
        <span class="etiqueta">Cielo · Mapa celeste</span>
        <h1 class="titular">Mapa <em>celeste</em>.</h1>
        <p class="entradilla">El cielo desde ${escaparHTML(lugar.nombre)}, como si sostuvieras el mapa sobre la cabeza:
          el centro es el cénit y el borde, el horizonte; el norte arriba y el este a la izquierda.</p>
      </header>

      <div class="panel mapa__controles">
        <div class="mapa__tiempo">
          <input type="date" id="mapa-fecha" aria-label="Fecha" value="${f.getFullYear()}-${dosCifras(f.getMonth() + 1)}-${dosCifras(f.getDate())}">
          <input type="time" id="mapa-hora" aria-label="Hora" value="${dosCifras(f.getHours())}:${dosCifras(f.getMinutes())}">
          <button class="boton-sec" type="button" data-accion="hora-">−1 h</button>
          <button class="boton-sec" type="button" data-accion="ahora">Ahora</button>
          <button class="boton-sec" type="button" data-accion="hora+">+1 h</button>
        </div>
        <div class="filtros mapa__capas" role="group" aria-label="Capas del mapa">
          ${[['lineas', 'Constelaciones'], ['nombres', 'Nombres'], ['objetos', 'Objetos'], ['cuadricula', 'Cuadrícula']]
            .map(([id, t]) => `<button class="chip chip--estado" type="button" data-capa="${id}" aria-pressed="${estado.capas[id]}">${t}</button>`).join('')}
        </div>
        <div class="mapa__magnitud">
          <label class="mapa__deslizador">
            <span class="etiqueta">Estrellas hasta magnitud</span>
            <input type="range" id="mapa-mag" min="2" max="6" step="0.5" value="${estado.magLimite}" aria-describedby="mapa-mag-valor">
            <output class="cifra" id="mapa-mag-valor"></output>
          </label>
          <div class="filtros" role="group" aria-label="Cielos típicos">
            ${CIELOS.map((k) => `<button class="chip" type="button" data-cielo="${k.mag}" title="${k.ayuda}" aria-pressed="${estado.magLimite === k.mag}">${k.nombre} · ${k.mag}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="mapa__marco" id="mapa-marco">
        <canvas id="mapa-lienzo" class="mapa__lienzo" role="img" aria-label="Mapa del cielo visible"></canvas>
        <div class="mapa__zoom">
          <button class="boton-icono" type="button" data-accion="acercar" aria-label="Acercar">+</button>
          <button class="boton-icono" type="button" data-accion="alejar" aria-label="Alejar">−</button>
          <button class="boton-icono" type="button" data-accion="centrar" aria-label="Ver todo el cielo">${icono('azar')}</button>
        </div>
        <div class="mapa__globo" id="mapa-globo" role="status" hidden></div>
      </div>
      <p class="mapa__estado nota" id="mapa-estado"></p>

      <div class="mapa__pie">
        <div class="mapa__leyenda" aria-label="Leyenda">
          <span><i class="ley ley--galaxia"></i>Galaxia</span><span><i class="ley ley--nebulosa"></i>Nebulosa</span>
          <span><i class="ley ley--abierto"></i>Cúmulo abierto</span><span><i class="ley ley--globular"></i>Cúmulo globular</span>
          <span><i class="ley ley--planeta"></i>Planeta</span>
          <span><i class="ley ley--radiante">✳</i>Radiante de meteoros</span><span><i class="ley ley--cometa"></i>Cometa</span>
        </div>
        <div class="mapa__exportar">
          <button class="boton-sec" type="button" data-accion="png">${icono('abajo')}PNG</button>
          <button class="boton-sec" type="button" data-accion="pdf">${icono('abajo')}PDF</button>
        </div>
      </div>
      <p class="nota">Acerca con la rueda del ratón o pellizcando y arrastra para moverte. Pasa el ratón por un astro (o tócalo) para ver qué es; con el ratón, haz clic para abrir su ficha.
        Estrellas: d3-celestial (O. Frohn, licencia BSD).</p>
    </section>`;
  raiz.addEventListener('click', alHacerClic);
  raiz.addEventListener('change', alCambiar);
  raiz.addEventListener('input', alMoverMagnitud);
}

function prepararLienzo() {
  lienzo = raiz.querySelector('#mapa-lienzo');
  globo = raiz.querySelector('#mapa-globo');
  ctx = lienzo.getContext('2d');
  observador = new ResizeObserver(() => redibujar());
  observador.observe(raiz.querySelector('#mapa-marco'));
  lienzo.addEventListener('wheel', alRueda, { passive: false });
  lienzo.addEventListener('pointerdown', alPulsar);
  lienzo.addEventListener('pointermove', alMover);
  lienzo.addEventListener('pointerup', alSoltar);
  lienzo.addEventListener('pointercancel', alSoltar);
  lienzo.addEventListener('pointerleave', () => { if (!punteros.size) { ocultarGlobo(); lienzo.style.cursor = ''; } });
  lienzo.addEventListener('dblclick', (e) => { const p = puntoLocal(e); acercarEn(p.x, p.y, 2); });
  // El botón Noche cambia un atributo del documento: lo vigilamos para repintar en rojo
  observadorTema = new MutationObserver(redibujar);
  observadorTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-noche', 'data-tema'] });
}

/* ==========================================================================
   Astronomía de la escena
   ========================================================================== */
/** Calcula qué hay en el cielo en esa fecha: devuelve una función alt/az y las posiciones del Sistema Solar */
function escena(fecha) {
  const lst = A.tiempoSidereoLocal(fecha, lugar.lon);
  const sf = Math.sin(lugar.lat * RAD), cf = Math.cos(lugar.lat * RAD);
  const altaz = (ra, dec) => {
    const H = (lst - ra) * RAD, d = dec * RAD;
    const sa = sf * Math.sin(d) + cf * Math.cos(d) * Math.cos(H);
    const alt = Math.asin(Math.max(-1, Math.min(1, sa))) / RAD;
    const az = (Math.atan2(Math.sin(H), Math.cos(H) * sf - Math.tan(d) * cf) / RAD + 180 + 360) % 360;
    return { alt, az };
  };
  const sol = A.posicionSol(fecha);
  const luna = A.posicionLuna(fecha);
  const planetas = Object.keys(NOMBRE_PLANETA).map((id) => ({ id, ...A.posicionPlaneta(id, fecha) }));
  // Radiantes de las lluvias activas ese día y cometas a menos de ~13 meses de su perihelio
  const activas = lluvias.filter((l) => F.lluviaActiva(l, fecha)).map((l) => ({ ...l, ...altaz(l.ar, l.dec) }));
  const jd = A.diaJuliano(fecha);
  const visibles = cometas.filter((c) => Math.abs(jd - c.tp) < 400).map((c) => {
    const p = F.posicionCometa(c, fecha);
    return { cometa: c, ...p, ...altaz(p.ra, p.dec) };
  });
  return { altaz, sol: { ...sol, ...altaz(sol.ra, sol.dec) }, luna: { ...luna, ...altaz(luna.ra, luna.dec), fase: A.faseLunar(fecha) },
    planetas: planetas.map((p) => ({ ...p, ...altaz(p.ra, p.dec) })), lluvias: activas, cometas: visibles };
}

/* ==========================================================================
   Dibujo (sirve para la pantalla y para exportar)
   ========================================================================== */
function redibujar() {
  if (pendiente || !lienzo) return;
  pendiente = true;
  requestAnimationFrame(() => {
    pendiente = false;
    const marco = raiz.querySelector('#mapa-marco');
    if (!marco) return;
    const ancho = marco.clientWidth;
    const alto = Math.min(ancho, Math.max(320, window.innerHeight * 0.72));
    const dpr = window.devicePixelRatio || 1;
    lienzo.width = Math.round(ancho * dpr); lienzo.height = Math.round(alto * dpr);
    lienzo.style.height = alto + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    elementos = dibujar(ctx, ancho, alto, estado.zoom, estado.panX, estado.panY, fechaActual(), true);
    pintarEstado();
    pintarMagnitud();
  });
}

/**
 * Dibuja el mapa en un contexto 2D de `ancho` × `alto` píxeles.
 * Devuelve la lista de elementos señalables (para el globo de información).
 */
function dibujar(c, ancho, alto, zoom, panX, panY, fecha, interactivo) {
  const P = paleta();
  const e = escena(fecha);
  const escala = (Math.min(ancho, alto) / 2 - 26) * zoom;
  const cx = ancho / 2 + panX, cy = alto / 2 + panY;
  const aPantalla = (alt, az) => { const p = proyectar(alt, az); return { x: cx + p.x * escala, y: cy + p.y * escala }; };
  const tamTexto = Math.max(10, Math.min(13, escala / 30));
  const crecer = Math.sqrt(Math.min(zoom, 6));
  // ¿Hay sitio para etiquetas pequeñas? Sí al acercar, en pantallas grandes y al exportar
  const holgado = escala > 560;
  const lista = [];

  // Fondo fuera del horizonte y bóveda
  c.fillStyle = P.fuera; c.fillRect(0, 0, ancho, alto);
  c.save();
  c.beginPath(); c.arc(cx, cy, escala, 0, 2 * Math.PI);
  c.fillStyle = P.cielo; c.fill();
  c.clip();

  // Cuadrícula: alturas 30° y 60° y acimut cada 45°
  if (estado.capas.cuadricula) {
    c.strokeStyle = P.rejilla; c.lineWidth = 1; c.setLineDash([3, 5]);
    for (const alt of [30, 60]) { c.beginPath(); c.arc(cx, cy, Math.tan(((90 - alt) * RAD) / 2) * escala, 0, 2 * Math.PI); c.stroke(); }
    for (let az = 0; az < 360; az += 45) { const p = aPantalla(0, az); c.beginPath(); c.moveTo(cx, cy); c.lineTo(p.x, p.y); c.stroke(); }
    c.setLineDash([]);
  }

  // Líneas de las constelaciones
  if (estado.capas.lineas) {
    c.strokeStyle = P.lineas; c.lineWidth = 1;
    for (const con of datos.constelaciones) {
      for (const tramo of con.lineas) {
        let anterior = null;
        for (const [ra, dec] of tramo) {
          const h = e.altaz(ra, dec);
          const p = h.alt > -10 ? aPantalla(h.alt, h.az) : null;
          if (p && anterior) { c.beginPath(); c.moveTo(anterior.x, anterior.y); c.lineTo(p.x, p.y); c.stroke(); }
          anterior = p;
        }
      }
    }
  }

  // Estrellas (las brillantes van al final de la lista para quedar encima).
  // Solo hasta la magnitud del deslizador; las más débiles de 4 se dibujan
  // además algo transparentes, para que el ojo note que apenas se ven.
  let visibles = 0;
  for (let i = datos.estrellas.length - 1; i >= 0; i--) {
    const [ra, dec, mag, bv, nombre] = datos.estrellas[i];
    if (mag > estado.magLimite) continue;
    const h = e.altaz(ra, dec);
    if (h.alt < 0) continue;
    visibles++;
    const p = aPantalla(h.alt, h.az);
    if (p.x < -10 || p.y < -10 || p.x > ancho + 10 || p.y > alto + 10) continue;
    const r = Math.max(0.55, (2.9 - 0.48 * mag)) * crecer;
    c.fillStyle = P.estrella(bv);
    c.globalAlpha = mag > 4 ? Math.max(0.45, 1 - (mag - 4) * 0.28) : 1;
    c.beginPath(); c.arc(p.x, p.y, r, 0, 2 * Math.PI); c.fill();
    c.globalAlpha = 1;
    if (nombre || mag < 3) lista.push({ x: p.x, y: p.y, r, info: { tipo: 'estrella', nombre: nombre || null, mag, alt: h.alt, az: h.az } });
    if (nombre && estado.capas.nombres && (mag < 1.1 || holgado)) {
      c.fillStyle = P.textoSuave; c.font = `${tamTexto - 1}px "Space Grotesk", system-ui, sans-serif`;
      c.fillText(nombre, p.x + r + 3, p.y - r - 1);
    }
  }
  if (interactivo) estrellasVisibles = visibles;

  // Nombres de las constelaciones
  if (estado.capas.nombres) {
    c.fillStyle = P.constelacion; c.font = `${holgado ? tamTexto : tamTexto - 1.5}px "IBM Plex Mono", ui-monospace, monospace`; c.textAlign = 'center';
    for (const con of datos.constelaciones) {
      const h = e.altaz(con.etiqueta[0], con.etiqueta[1]);
      if (h.alt < 5) continue;
      const p = aPantalla(h.alt, h.az);
      c.fillText(con.nombre.toUpperCase(), p.x, p.y);
    }
    c.textAlign = 'left';
  }

  // Objetos de cielo profundo
  if (estado.capas.objetos) {
    c.lineWidth = 1.3;
    for (const o of objetos) {
      const h = e.altaz(o.ar * 15, o.dec);
      if (h.alt < 0) continue;
      const p = aPantalla(h.alt, h.az);
      // tamaño real proyectado (dr/dz = ½·sec²(z/2)), con un mínimo para que se vea
      const z = (90 - h.alt) * RAD;
      const real = (o.ancho / 60) * RAD * 0.5 / Math.cos(z / 2) ** 2 * escala / 2;
      const r = Math.max(4.5, Math.min(real, 60));
      c.strokeStyle = P.objeto; c.fillStyle = P.objeto;
      simbolo(c, o.tipo, p.x, p.y, r);
      if (estado.capas.nombres && (holgado || o.id === estado.resaltado)) { c.font = `${tamTexto - 1}px "IBM Plex Mono", ui-monospace, monospace`; c.fillText(o.catalogo.split(' / ')[0], p.x + r + 3, p.y + 4); }
      lista.push({ x: p.x, y: p.y, r: r + 2, info: { tipo: 'objeto', objeto: o, alt: h.alt, az: h.az } });
    }
  }

  // Radiantes de las lluvias de meteoros activas: una estrellita de rayos
  if (estado.capas.objetos) {
    for (const l of e.lluvias) {
      if (l.alt < 0) continue;
      const p = aPantalla(l.alt, l.az);
      const r = 7 * crecer;
      c.strokeStyle = P.resalte; c.lineWidth = 1.4;
      c.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; c.moveTo(p.x + Math.cos(a) * r * 0.35, p.y + Math.sin(a) * r * 0.35); c.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); }
      c.stroke();
      if (estado.capas.nombres) { c.fillStyle = P.resalte; c.font = `${tamTexto - 1}px "IBM Plex Mono", ui-monospace, monospace`; c.fillText(l.codigo, p.x + r + 3, p.y + 4); }
      lista.push({ x: p.x, y: p.y, r: r + 2, info: { tipo: 'lluvia', lluvia: l, alt: l.alt, az: l.az } });
    }
  }
  // Cometas: núcleo y cola, que apunta siempre en sentido contrario al Sol
  const sp = aPantalla(e.sol.alt, e.sol.az);
  for (const k of e.cometas) {
    if (k.alt < 0) continue;
    const p = aPantalla(k.alt, k.az);
    const dx = p.x - sp.x, dy = p.y - sp.y, d = Math.hypot(dx, dy) || 1;
    const largo = 20 * crecer;
    const grad = c.createLinearGradient(p.x, p.y, p.x + (dx / d) * largo, p.y + (dy / d) * largo);
    grad.addColorStop(0, P.objeto); grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.strokeStyle = grad; c.lineWidth = 3 * crecer;
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + (dx / d) * largo, p.y + (dy / d) * largo); c.stroke();
    c.fillStyle = P.objeto; c.beginPath(); c.arc(p.x, p.y, 2.6 * crecer, 0, 2 * Math.PI); c.fill();
    if (estado.capas.nombres) { c.font = `${tamTexto - 1}px "Space Grotesk", system-ui, sans-serif`; c.fillText(k.cometa.corto, p.x + 6, p.y - 6); }
    lista.push({ x: p.x, y: p.y, r: 6, info: { tipo: 'cometa', cometa: k, alt: k.alt, az: k.az } });
  }

  // Planetas, Luna y Sol
  for (const pl of e.planetas) {
    if (pl.alt < 0) continue;
    const p = aPantalla(pl.alt, pl.az);
    const r = Math.max(2.5, 4.2 - 0.5 * pl.magnitud) * crecer;
    c.fillStyle = P.planeta(pl.id);
    c.beginPath(); c.arc(p.x, p.y, r, 0, 2 * Math.PI); c.fill();
    c.font = `500 ${tamTexto}px "Space Grotesk", system-ui, sans-serif`; c.fillText(NOMBRE_PLANETA[pl.id], p.x + r + 4, p.y + 4);
    lista.push({ x: p.x, y: p.y, r: r + 3, info: { tipo: 'planeta', planeta: pl, alt: pl.alt, az: pl.az } });
  }
  if (e.luna.alt > -1) {
    const p = aPantalla(e.luna.alt, e.luna.az);
    const r = 7 * crecer;
    dibujarLuna(c, p.x, p.y, r, e.luna.fase, P);
    c.fillStyle = P.texto; c.font = `500 ${tamTexto}px "Space Grotesk", system-ui, sans-serif`; c.fillText('Luna', p.x + r + 4, p.y + 4);
    lista.push({ x: p.x, y: p.y, r: r + 3, info: { tipo: 'luna', luna: e.luna, alt: e.luna.alt, az: e.luna.az } });
  }
  if (e.sol.alt > -1) {
    const p = aPantalla(e.sol.alt, e.sol.az);
    c.fillStyle = P.sol; c.beginPath(); c.arc(p.x, p.y, 9 * crecer, 0, 2 * Math.PI); c.fill();
    lista.push({ x: p.x, y: p.y, r: 12, info: { tipo: 'sol', alt: e.sol.alt, az: e.sol.az } });
  }

  // Objeto destacado (#mapa/m31): anillo alrededor
  if (estado.resaltado) {
    const pos = posicionResaltado(e);
    if (pos && pos.alt > 0) {
      const p = aPantalla(pos.alt, pos.az);
      c.strokeStyle = P.resalte; c.lineWidth = 2;
      c.beginPath(); c.arc(p.x, p.y, 16 * crecer, 0, 2 * Math.PI); c.stroke();
      c.beginPath(); c.arc(p.x, p.y, 22 * crecer, 0, 2 * Math.PI); c.globalAlpha = 0.4; c.stroke(); c.globalAlpha = 1;
    }
  }
  c.restore();

  // Horizonte y puntos cardinales (este a la izquierda)
  c.strokeStyle = P.borde; c.lineWidth = 1.5;
  c.beginPath(); c.arc(cx, cy, escala, 0, 2 * Math.PI); c.stroke();
  c.fillStyle = P.borde; c.font = `500 ${tamTexto + 1}px "IBM Plex Mono", ui-monospace, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const [az, letra] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'O']]) {
    const p = proyectar(0, az);
    c.fillText(letra, cx + p.x * (escala + 14), cy + p.y * (escala + 14));
  }
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  return lista;
}

function posicionResaltado(e) {
  const id = estado.resaltado;
  if (id === 'luna-cielo') return e.luna;
  const pl = e.planetas.find((p) => p.id === id);
  if (pl) return pl;
  const o = objetos.find((x) => x.id === id);
  if (o) return e.altaz(o.ar * 15, o.dec);
  const l = lluvias.find((x) => x.id === id);
  if (l) return { ...e.altaz(l.ar, l.dec), ra: l.ar };
  const c = cometas.find((x) => x.id === id);
  if (c) { const q = F.posicionCometa(c, fechaActual()); return { ...e.altaz(q.ra, q.dec), ra: q.ra }; }
  return null;
}
/** Nombre de lo resaltado (objeto, planeta, Luna, radiante o cometa) */
function nombreResaltado(id) {
  return NOMBRE_PLANETA[id] || (id === 'luna-cielo' ? 'La Luna' : objetos.find((o) => o.id === id)?.nombre
    || (lluvias.find((l) => l.id === id) ? `El radiante de las ${lluvias.find((l) => l.id === id).nombre}` : null)
    || (cometas.find((c) => c.id === id) ? `El cometa ${cometas.find((c) => c.id === id).corto}` : null));
}

/** Símbolos clásicos de los atlas: galaxia elipse, nebulosa cuadrado, cúmulo abierto círculo punteado, globular círculo con cruz */
function simbolo(c, tipo, x, y, r) {
  c.beginPath();
  if (tipo === 'galaxia') { c.ellipse(x, y, r, r * 0.5, -0.5, 0, 2 * Math.PI); c.stroke(); return; }
  if (tipo === 'cumulo-abierto') { c.setLineDash([2, 2.5]); c.arc(x, y, r, 0, 2 * Math.PI); c.stroke(); c.setLineDash([]); return; }
  if (tipo === 'cumulo-globular') { c.arc(x, y, r, 0, 2 * Math.PI); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke(); return; }
  if (tipo === 'nebulosa-planetaria') { c.arc(x, y, r * 0.6, 0, 2 * Math.PI); c.stroke(); c.beginPath(); c.moveTo(x - r, y); c.lineTo(x - r * 0.6, y); c.moveTo(x + r * 0.6, y); c.lineTo(x + r, y); c.stroke(); return; }
  c.rect(x - r, y - r, 2 * r, 2 * r); c.stroke();          // nebulosas y remanentes
}

function dibujarLuna(c, x, y, r, fase, P) {
  c.fillStyle = P.sombraLuna; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill();
  const k = fase.iluminada, rx = Math.abs(r * (1 - 2 * k));
  c.save(); c.translate(x, y); if (!fase.creciente) c.scale(-1, 1);
  c.fillStyle = P.luna; c.beginPath();
  c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  c.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, k <= 0.5);
  c.fill(); c.restore();
}

/** Línea de estado bajo el mapa: luz del cielo y aviso del objeto destacado */
function pintarEstado() {
  const caja = raiz.querySelector('#mapa-estado');
  if (!caja) return;
  const f = fechaActual();
  const e = escena(f);
  const sol = e.sol.alt;
  const luz = sol > -0.833 ? `Es de día: el Sol está a ${Math.round(sol)}° (el mapa muestra las estrellas como si no lo fuera).`
    : sol > -6 ? 'Crepúsculo civil: solo se ven los astros más brillantes.'
    : sol > -12 ? 'Crepúsculo náutico.' : sol > -18 ? 'Crepúsculo astronómico.' : 'Noche cerrada.';
  let aviso = '';
  if (estado.resaltado) {
    const pos = posicionResaltado(e);
    const nombre = nombreResaltado(estado.resaltado);
    if (pos && nombre) {
      if (pos.alt > 0) aviso = ` · ${nombre}: ${Math.round(pos.alt)}° de altura, rodeado en naranja.`;
      else {
        const ra = pos.ra ?? objetos.find((o) => o.id === estado.resaltado)?.ar * 15;
        const culmina = ra !== undefined ? A.proximaCulminacion(ra, lugar.lon, f) : null;
        aviso = ` · ${nombre} está ahora bajo el horizonte${culmina ? `; culmina a las ${culmina.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} del ${culmina.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}.`;
      }
    }
  }
  caja.textContent = `${f.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${luz}${aviso}`;
}

/* ==========================================================================
   Globo de información
   ========================================================================== */
const brujula = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(az / 45) % 8];
function textoInfo(i) {
  const pos = `${Math.round(i.alt)}° de altura · hacia el ${brujula(i.az)} (${Math.round(i.az)}°)`;
  const num = (v, d = 1) => v.toLocaleString('es-ES', { maximumFractionDigits: d });
  switch (i.tipo) {
    case 'estrella': return `<strong>${i.nombre ? escaparHTML(i.nombre) : 'Estrella'}</strong><span>magnitud ${num(i.mag)}</span><span>${pos}</span>`;
    case 'objeto': {
      const o = i.objeto;
      return `<strong>${escaparHTML(o.nombre)}</strong><span>${escaparHTML(o.catalogo)} · ${NOMBRE_TIPO[o.tipo] || ''}</span>
        <span>mag ${num(o.mag)} · ${o.ancho}′ × ${o.alto}′ · ${escaparHTML(o.constelacion || '')}</span><span>${pos}</span>
        <a href="#objetos/${o.id}">Ver la ficha ›</a>`;
    }
    case 'planeta': {
      const p = i.planeta;
      return `<strong>${NOMBRE_PLANETA[p.id]}</strong><span>mag ${num(p.magnitud)} · ${num(p.diametro)}″ · ${num(p.distancia, 2)} UA</span>
        <span>${pos}</span><a href="#objetos/${p.id}">Ver la ficha ›</a>`;
    }
    case 'luna': return `<strong>La Luna</strong><span>${escaparHTML(i.luna.fase.nombre)} · ${Math.round(i.luna.fase.iluminada * 100)} % iluminada</span><span>${pos}</span><a href="#objetos/luna-cielo">Ver la ficha ›</a>`;
    case 'lluvia': {
      const l = i.lluvia;
      return `<strong>Radiante de las ${escaparHTML(l.nombre)}</strong><span>Lluvia de meteoros activa · THZ ${l.thz}</span>
        <span>${pos}</span><a href="#objetos/${l.id}">Ver la ficha ›</a>`;
    }
    case 'cometa': {
      const k = i.cometa;
      return `<strong>${escaparHTML(k.cometa.nombre)}</strong><span>Cometa · magnitud ≈ ${num(k.magnitud)} · ${num(k.distancia, 2)} UA</span>
        <span>${pos}</span><a href="#objetos/${k.cometa.id}">Ver la ficha ›</a>`;
    }
    case 'sol': return `<strong>El Sol</strong><span>Nunca lo mires ni lo fotografíes sin filtro solar.</span><span>${pos}</span>`;
    default: return '';
  }
}

/** El elemento señalado en (x, y), o null. Zona sensible pequeña con ratón (apunta con precisión) y generosa con el dedo */
function elementoEn(x, y, conRaton) {
  const holgura = conRaton ? 3 : 6, minimo = conRaton ? 6 : 12;
  let mejor = null, dist = Infinity;
  for (const el of elementos) {
    const d = Math.hypot(el.x - x, el.y - y);
    if (d <= Math.max(el.r + holgura, minimo) && d < dist) { dist = d; mejor = el; }
  }
  return mejor;
}
/** Dirección de la ficha de un elemento (#objetos/…), si la tiene (las estrellas y el Sol no) */
const fichaDe = (el) => el && /href="(#[^"]+)"/.exec(textoInfo(el.info))?.[1];

/**
 * Muestra la información del elemento que hay en (x, y) o, si no hay ninguno,
 * deja el mapa limpio.
 *   · Con ratón: el globo aparece mientras el puntero está encima y desaparece
 *     en cuanto se retira. El globo no captura el ratón (pointer-events: none),
 *     así que nunca se queda «enganchado»; la ficha se abre haciendo clic en el objeto.
 *   · Con el dedo: el globo se queda hasta tocar otra cosa y trae «Ver la ficha».
 */
let ultimoMostrado = null;
function mostrarGlobo(x, y, conRaton = false) {
  const mejor = elementoEn(x, y, conRaton);
  if (conRaton) lienzo.style.cursor = fichaDe(mejor) ? 'pointer' : '';
  if (!mejor) { ocultarGlobo(); return; }
  if (mejor === ultimoMostrado && !globo.hidden) return;   // ya se está mostrando
  ultimoMostrado = mejor;
  let html = textoInfo(mejor.info);
  if (conRaton) html = html.replace(/<a href="[^"]+">Ver la ficha ›<\/a>/, '<span class="mapa__pista">Haz clic para ver la ficha</span>');
  globo.innerHTML = html;
  globo.classList.toggle('mapa__globo--raton', conRaton);
  globo.hidden = false;
  const marco = raiz.querySelector('#mapa-marco');
  const gx = Math.min(mejor.x + 14, marco.clientWidth - globo.offsetWidth - 6);
  const gy = mejor.y + 14 + globo.offsetHeight > marco.clientHeight ? mejor.y - globo.offsetHeight - 10 : mejor.y + 14;
  globo.style.left = Math.max(6, gx) + 'px';
  globo.style.top = Math.max(6, gy) + 'px';
}
function ocultarGlobo() {
  ultimoMostrado = null;
  if (globo) globo.hidden = true;
}

/* ==========================================================================
   Zoom y desplazamiento (ratón, rueda y gestos táctiles)
   ========================================================================== */
function puntoLocal(e) {
  const r = lienzo.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
/** Acerca o aleja manteniendo fijo el punto (x, y) de la pantalla */
function acercarEn(x, y, factor) {
  const nuevo = Math.max(1, Math.min(14, estado.zoom * factor));
  const f = nuevo / estado.zoom;
  const ancho = lienzo.clientWidth, alto = lienzo.clientHeight;
  const cx = ancho / 2 + estado.panX, cy = alto / 2 + estado.panY;
  estado.panX += (x - cx) * (1 - f);
  estado.panY += (y - cy) * (1 - f);
  estado.zoom = nuevo;
  if (nuevo === 1) { estado.panX = 0; estado.panY = 0; }
  ocultarGlobo();
  redibujar();
}
function alRueda(e) {
  e.preventDefault();
  const p = puntoLocal(e);
  acercarEn(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
}
function alPulsar(e) {
  lienzo.setPointerCapture(e.pointerId);
  punteros.set(e.pointerId, puntoLocal(e));
  if (punteros.size === 1) gesto = { tipo: 'arrastre', inicio: puntoLocal(e), panX: estado.panX, panY: estado.panY, movido: false, t: Date.now() };
  if (punteros.size === 2) {
    const [a, b] = [...punteros.values()];
    gesto = { tipo: 'pellizco', distancia: Math.hypot(a.x - b.x, a.y - b.y), zoom: estado.zoom, centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
}
function alMover(e) {
  const p = puntoLocal(e);
  if (!punteros.has(e.pointerId)) {                 // ratón sin pulsar: información al pasar por encima
    if (e.pointerType === 'mouse') mostrarGlobo(p.x, p.y, true);
    return;
  }
  punteros.set(e.pointerId, p);
  if (gesto?.tipo === 'arrastre') {
    const dx = p.x - gesto.inicio.x, dy = p.y - gesto.inicio.y;
    if (Math.hypot(dx, dy) > 4) gesto.movido = true;
    if (gesto.movido && estado.zoom > 1) { estado.panX = gesto.panX + dx; estado.panY = gesto.panY + dy; ocultarGlobo(); redibujar(); }
  } else if (gesto?.tipo === 'pellizco' && punteros.size === 2) {
    const [a, b] = [...punteros.values()];
    const f = Math.hypot(a.x - b.x, a.y - b.y) / gesto.distancia;
    acercarEn(gesto.centro.x, gesto.centro.y, (gesto.zoom * f) / estado.zoom);
  }
}
let ultimoToque = 0;
function alSoltar(e) {
  const p = puntoLocal(e);
  const eraToque = gesto?.tipo === 'arrastre' && !gesto.movido;
  punteros.delete(e.pointerId);
  if (!punteros.size) gesto = null;
  if (eraToque && e.pointerType !== 'mouse') {
    // doble toque = acercar; toque simple = información
    if (Date.now() - ultimoToque < 300) acercarEn(p.x, p.y, 2);
    else mostrarGlobo(p.x, p.y);
    ultimoToque = Date.now();
  } else if (eraToque) {
    // clic con el ratón sobre un objeto, planeta o la Luna: abre su ficha
    const ficha = fichaDe(elementoEn(p.x, p.y, true));
    if (ficha) location.hash = ficha;
  }
}

/* ==========================================================================
   Exportar (PNG y PDF) — se redibuja a 2000 px con una cabecera
   ========================================================================== */
function lienzoExportacion() {
  const L = 2000, CAB = 170, PIE = 90;
  const can = document.createElement('canvas');
  can.width = L; can.height = L + CAB + PIE;
  const c = can.getContext('2d');
  const P = paleta();
  c.fillStyle = P.fuera; c.fillRect(0, 0, can.width, can.height);
  c.save(); c.translate(0, CAB);
  dibujar(c, L, L, estado.zoom, estado.panX * (L / lienzo.clientWidth), estado.panY * (L / lienzo.clientWidth), fechaActual(), false);
  c.restore();
  const f = fechaActual();
  c.fillStyle = P.borde; c.font = '400 72px "Instrument Serif", Georgia, serif';
  c.fillText('Mapa celeste', 60, 95);
  c.fillStyle = P.texto; c.font = '400 32px "Space Grotesk", system-ui, sans-serif';
  c.fillText(`${lugar.nombre} · ${f.toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · estrellas hasta mag ${decimal(estado.magLimite)}`, 62, 145);
  c.fillStyle = P.textoSuave; c.font = '400 26px "IBM Plex Mono", ui-monospace, monospace';
  c.fillText('AstroKit · cjgaland.github.io/astrokit · estrellas: d3-celestial (BSD)', 60, can.height - 36);
  return can;
}

async function descargar(blob, nombre) {
  const archivo = new File([blob], nombre, { type: blob.type });
  if (navigator.canShare?.({ files: [archivo] }) && matchMedia('(pointer: coarse)').matches) {
    await navigator.share({ files: [archivo], title: 'Mapa celeste' }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function exportar(formato) {
  const can = lienzoExportacion();
  const f = fechaActual();
  const base = `mapa-celeste-${f.getFullYear()}-${dosCifras(f.getMonth() + 1)}-${dosCifras(f.getDate())}-${dosCifras(f.getHours())}${dosCifras(f.getMinutes())}`;
  if (formato === 'png') {
    descargar(await new Promise((r) => can.toBlob(r, 'image/png')), base + '.png');
  } else {
    const jpeg = new Uint8Array(await (await new Promise((r) => can.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
    const pdf = pdfConImagen(jpeg, can.width, can.height, { titulo: `Mapa celeste · ${lugar.nombre}` });
    descargar(new Blob([pdf], { type: 'application/pdf' }), base + '.pdf');
  }
}

/* ==========================================================================
   Controles
   ========================================================================== */
function alHacerClic(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.cielo) { elegirMagnitud(Number(b.dataset.cielo)); raiz.querySelector('#mapa-mag').value = b.dataset.cielo; return; }
  if (b.dataset.capa) {
    estado.capas[b.dataset.capa] = !estado.capas[b.dataset.capa];
    b.setAttribute('aria-pressed', String(estado.capas[b.dataset.capa]));
    guardar('mapa:capas', estado.capas);
    redibujar();
    return;
  }
  const a = b.dataset.accion;
  const centro = () => ({ x: lienzo.clientWidth / 2, y: lienzo.clientHeight / 2 });
  if (a === 'hora-' || a === 'hora+') {
    estado.fecha = new Date(fechaActual().getTime() + (a === 'hora+' ? 1 : -1) * 3600000);
    sincronizarControles();
  } else if (a === 'ahora') { estado.fecha = null; sincronizarControles(); }
  else if (a === 'acercar') acercarEn(centro().x, centro().y, 1.6);
  else if (a === 'alejar') acercarEn(centro().x, centro().y, 1 / 1.6);
  else if (a === 'centrar') { estado.zoom = 1; estado.panX = 0; estado.panY = 0; ocultarGlobo(); redibujar(); }
  else if (a === 'png' || a === 'pdf') exportar(a);
}

function alCambiar(e) {
  if (e.target.id !== 'mapa-fecha' && e.target.id !== 'mapa-hora') return;
  const fecha = raiz.querySelector('#mapa-fecha').value, hora = raiz.querySelector('#mapa-hora').value || '22:00';
  if (!fecha) return;
  const [a, m, d] = fecha.split('-').map(Number), [h, mi] = hora.split(':').map(Number);
  estado.fecha = new Date(a, m - 1, d, h, mi);
  redibujar();
}

/** Deslizador de magnitud: redibuja en vivo mientras se mueve */
function alMoverMagnitud(e) {
  if (e.target.id === 'mapa-mag') elegirMagnitud(Number(e.target.value));
}
function elegirMagnitud(m) {
  estado.magLimite = m;
  guardar('mapa:magnitud', m);
  raiz.querySelectorAll('[data-cielo]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.cielo) === m)));
  ocultarGlobo();
  redibujar();
}
/** Cifra junto al deslizador: la magnitud y cuántas estrellas hay ahora sobre el horizonte */
function pintarMagnitud() {
  const salida = raiz.querySelector('#mapa-mag-valor');
  if (salida) salida.textContent = `${decimal(estado.magLimite)} · ${estrellasVisibles.toLocaleString('es-ES')} estrellas sobre el horizonte`;
}

function sincronizarControles() {
  const f = fechaActual();
  raiz.querySelector('#mapa-fecha').value = `${f.getFullYear()}-${dosCifras(f.getMonth() + 1)}-${dosCifras(f.getDate())}`;
  raiz.querySelector('#mapa-hora').value = `${dosCifras(f.getHours())}:${dosCifras(f.getMinutes())}`;
  ocultarGlobo();
  redibujar();
}
