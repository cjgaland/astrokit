/* ==========================================================================
   globo.js — Globo terráqueo 3D (para los eclipses)
   --------------------------------------------------------------------------
   Cómo se dibuja una esfera sin librerías:
     1. Se pinta el mundo en una «textura» plana (2048 × 1024 px) con la
        proyección más sencilla: x = longitud, y = latitud (equirectangular).
        Ahí se colorean también las zonas del eclipse.
     2. Para cada píxel del globo en pantalla se hace la cuenta AL REVÉS de la
        proyección ORTOGRÁFICA (la de una foto de la Tierra desde muy lejos):
        qué latitud y longitud hay en ese punto de la esfera, según hacia dónde
        esté girada. Se copia el color de la textura y se oscurece un poco
        hacia el borde para dar volumen.
     3. Encima, en vectores (nítidos aunque se acerque mucho): costas,
        fronteras, meridianos, líneas del eclipse y ciudades.
   Se gira arrastrando, se acerca con la rueda, pellizcando, con doble toque
   o con los botones, y al tocar un punto se avisa con sus coordenadas.

   Datos: data/mundo.json (Natural Earth, dominio público, vía world-atlas)
   y data/ciudades.json.
   ========================================================================== */

import { cargarJSON, icono } from './util.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const TW = 2048, TH = 1024;                       // tamaño de la textura

/* ---------- Datos del mundo (se descodifican una vez) ---------- */
let mundo = null;
async function cargarMundo() {
  if (mundo) return mundo;
  const [m, c] = await Promise.all([cargarJSON('data/mundo.json'), cargarJSON('data/ciudades.json')]);
  // Cada línea viene en centésimas de grado y por diferencias: [lon0, lat0, dlon, dlat, …]
  const decodificar = (l) => {
    const pts = new Float64Array(l.length);
    let x = 0, y = 0;
    for (let i = 0; i < l.length; i += 2) { x += l[i]; y += l[i + 1]; pts[i] = x / 100; pts[i + 1] = y / 100; }
    return pts;
  };
  mundo = { tierra: m.tierra.map(decodificar), fronteras: m.fronteras.map(decodificar), ciudades: c };
  return mundo;
}

/* ---------- Paletas ---------- */
function paleta() {
  if (document.documentElement.dataset.noche === 'si') {
    return { espacio: '#000000', mar: '#0a0000', tierra: '#2a0600', costa: 'rgba(220,40,0,0.85)', frontera: 'rgba(200,30,0,0.4)',
      rejilla: 'rgba(200,30,0,0.18)', texto: '#d22000', halo: 'rgba(200,30,0,0.35)', marca: '#ff3300' };
  }
  return { espacio: '#060a14', mar: '#0f2742', tierra: '#3f5537', costa: 'rgba(235,226,203,0.75)', frontera: 'rgba(235,226,203,0.32)',
    rejilla: 'rgba(235,226,203,0.10)', texto: '#ebe2cb', halo: 'rgba(120,170,255,0.35)', marca: '#f2a33a' };
}

/* ---------- Textura ---------- */
const aTex = (lat, lon) => ({ x: ((lon + 180) / 360) * TW, y: ((90 - lat) / 180) * TH });

/** Rellena un polígono [{lat, lon}] en la textura (para las zonas del eclipse) */
function rellenarPoligono(c, puntos) {
  const plano = new Float64Array(puntos.length * 2);
  puntos.forEach((p, i) => { plano[2 * i] = p.lon; plano[2 * i + 1] = p.lat; });
  trazarAnillo(c, plano);
}

/** Dibuja un anillo [lon, lat, …] en la textura, «desenrollando» el salto de ±180° */
function trazarAnillo(c, pts) {
  const xs = [], ys = [];
  let previa = null, desplaz = 0;
  for (let i = 0; i < pts.length; i += 2) {
    let lon = pts[i];
    if (previa !== null) {
      const d = lon + desplaz - previa;
      if (d > 180) desplaz -= 360; else if (d < -180) desplaz += 360;
    }
    lon += desplaz; previa = lon;
    xs.push(((lon + 180) / 360) * TW); ys.push(((90 - pts[i + 1]) / 180) * TH);
  }
  const min = Math.min(...xs), max = Math.max(...xs);
  for (const off of [0, min < 0 ? TW : null, max > TW ? -TW : null]) {
    if (off === null) continue;
    c.beginPath();
    xs.forEach((x, i) => (i ? c.lineTo(x + off, ys[i]) : c.moveTo(x + off, ys[i])));
    c.closePath(); c.fill();
  }
}

/**
 * Crea un globo dentro de `contenedor`.
 * opciones: { centro: {lat, lon}, alTocar(lat, lon), alPasar(lat, lon | null), etiqueta }
 * Devuelve { ponerCapas, irA, redibujar, destruir }.
 *   capas.textura(ctx, { aTex, rellenar, TW, TH })   pinta zonas sobre la textura (eclipse);
 *       rellenar([{lat, lon}]) rellena un polígono con el fillStyle actual
 *   capas.lineas  [{ puntos: [{lat, lon}], color, ancho, discontinua }]   (color puede ser una función:
 *                 se evalúa en cada dibujo, para que cambie con el modo noche)
 *   capas.marcas  [{ lat, lon, texto, color, tipo: 'lugar' | 'punto' }]
 */
export async function crearGlobo(contenedor, opciones = {}) {
  const datos = await cargarMundo();
  contenedor.innerHTML = `
    <canvas class="globo__lienzo" role="img" aria-label="${opciones.etiqueta || 'Globo terráqueo'}"></canvas>
    <div class="mapa__zoom">
      <button class="boton-icono" type="button" data-globo="acercar" aria-label="Acercar">+</button>
      <button class="boton-icono" type="button" data-globo="alejar" aria-label="Alejar">−</button>
      <button class="boton-icono" type="button" data-globo="centrar" aria-label="Volver a la vista inicial">${icono('azar')}</button>
    </div>`;
  const lienzo = contenedor.querySelector('canvas');
  const ctx = lienzo.getContext('2d');
  const inicial = { ...(opciones.centro || { lat: 30, lon: 0 }), zoom: opciones.zoom || 1 };
  const vista = { lat: inicial.lat, lon: inicial.lon, zoom: inicial.zoom };
  let capas = { textura: null, lineas: [], marcas: [] };
  let tex = null, texPaleta = null, rapido = false, pendiente = false, temporizadorCalidad = 0;

  /* --- Textura (tierra + capas del eclipse), como píxeles para leerlos deprisa --- */
  function construirTextura() {
    const P = paleta();
    const can = document.createElement('canvas'); can.width = TW; can.height = TH;
    const c = can.getContext('2d');
    c.fillStyle = P.mar; c.fillRect(0, 0, TW, TH);
    c.fillStyle = P.tierra;
    for (const anillo of datos.tierra) trazarAnillo(c, anillo);
    if (capas.textura) capas.textura(c, { aTex, rellenar: (pts) => rellenarPoligono(c, pts), TW, TH });
    tex = new Uint32Array(c.getImageData(0, 0, TW, TH).data.buffer);
    texPaleta = P;
  }

  /* --- Proyección ortográfica --- */
  function geometria() {
    const ancho = contenedor.clientWidth;
    const alto = Math.min(ancho, Math.max(320, window.innerHeight * 0.72));
    const R = (Math.min(ancho, alto) / 2 - 14) * vista.zoom;
    return { ancho, alto, R, cx: ancho / 2, cy: alto / 2 };
  }
  /** lat, lon → pantalla; visible = en la cara que mira hacia nosotros */
  function proyectar(lat, lon, g) {
    const f = lat * RAD, dl = (lon - vista.lon) * RAD, f0 = vista.lat * RAD;
    const cosc = Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos(dl);
    return {
      x: g.cx + g.R * Math.cos(f) * Math.sin(dl),
      y: g.cy - g.R * (Math.cos(f0) * Math.sin(f) - Math.sin(f0) * Math.cos(f) * Math.cos(dl)),
      visible: cosc > 0,
    };
  }
  /** Pantalla → lat, lon (o null fuera del globo): la cuenta inversa */
  function desproyectar(x, y, g) {
    const u = (x - g.cx) / g.R, v = -(y - g.cy) / g.R;
    const r2 = u * u + v * v;
    if (r2 > 1) return null;
    const w = Math.sqrt(1 - r2), f0 = vista.lat * RAD;
    const lat = Math.asin(v * Math.cos(f0) + w * Math.sin(f0)) * DEG;
    const lon = vista.lon + Math.atan2(u, w * Math.cos(f0) - v * Math.sin(f0)) * DEG;
    return { lat, lon: ((lon + 540) % 360) - 180 };
  }

  /* --- Dibujo --- */
  function redibujar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => { pendiente = false; dibujar(); });
  }
  function dibujar() {
    if (!lienzo.isConnected) return;
    const P = paleta();
    if (!tex || texPaleta.mar !== P.mar) construirTextura();
    const g = geometria();
    // Mientras se arrastra, se dibuja a 1 píxel por punto para ir fluido; al soltar, a resolución completa
    const s = rapido ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(g.ancho * s), H = Math.round(g.alto * s);
    if (lienzo.width !== W || lienzo.height !== H) { lienzo.width = W; lienzo.height = H; }
    lienzo.style.height = g.alto + 'px';
    const img = ctx.createImageData(W, H);
    const out = new Uint32Array(img.data.buffer);
    const esp = colorU32(P.espacio);
    out.fill(esp);
    const f0 = vista.lat * RAD, sf0 = Math.sin(f0), cf0 = Math.cos(f0);
    const Rs = g.R * s, cxs = g.cx * s, cys = g.cy * s;
    const y0 = Math.max(0, Math.floor(cys - Rs)), y1 = Math.min(H, Math.ceil(cys + Rs));
    for (let py = y0; py < y1; py++) {
      const v = -(py + 0.5 - cys) / Rs;
      const anchoFila = Math.sqrt(Math.max(0, 1 - v * v)) * Rs;
      const x0 = Math.max(0, Math.floor(cxs - anchoFila)), x1 = Math.min(W, Math.ceil(cxs + anchoFila));
      for (let px = x0; px < x1; px++) {
        const u = (px + 0.5 - cxs) / Rs;
        const r2 = u * u + v * v;
        if (r2 > 1) continue;
        const w = Math.sqrt(1 - r2);
        const lat = Math.asin(v * cf0 + w * sf0);
        const lon = vista.lon * RAD + Math.atan2(u, w * cf0 - v * sf0);
        let tx = ((lon / (2 * Math.PI) + 0.5) % 1) * TW; if (tx < 0) tx += TW;
        const ty = Math.min(TH - 1, Math.max(0, ((0.5 - lat / Math.PI) * TH) | 0));
        const c = tex[ty * TW + (tx | 0)];
        const luz = 0.62 + 0.38 * w;                 // más oscuro hacia el borde: sensación de esfera
        out[py * W + px] = 0xff000000 | (((c >>> 16 & 255) * luz) << 16) | (((c >>> 8 & 255) * luz) << 8) | ((c & 255) * luz);
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    dibujarVectores(g, P);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function polilinea(pts, g, cerrar = false) {
    // pts: Float64Array [lon, lat, …] o lista [{lat, lon}]
    const plano = pts instanceof Float64Array;
    const n = plano ? pts.length / 2 : pts.length;
    let antes = null;
    ctx.beginPath();
    for (let i = 0; i <= n - (cerrar ? 0 : 1); i++) {
      const k = i % n;
      const lat = plano ? pts[2 * k + 1] : pts[k].lat, lon = plano ? pts[2 * k] : pts[k].lon;
      const p = proyectar(lat, lon, g);
      if (p.visible && antes) ctx.lineTo(p.x, p.y); else if (p.visible) ctx.moveTo(p.x, p.y);
      antes = p.visible ? p : null;
    }
    ctx.stroke();
  }

  function dibujarVectores(g, P) {
    // Halo de la atmósfera
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R + 1.5, 0, 2 * Math.PI);
    ctx.strokeStyle = P.halo; ctx.lineWidth = 3; ctx.stroke();
    // Meridianos y paralelos cada 30°
    ctx.strokeStyle = P.rejilla; ctx.lineWidth = 1;
    for (let lon = -180; lon < 180; lon += 30) polilinea(Array.from({ length: 37 }, (_, i) => ({ lat: -90 + i * 5, lon })), g);
    for (let lat = -60; lat <= 60; lat += 30) polilinea(Array.from({ length: 73 }, (_, i) => ({ lat, lon: -180 + i * 5 })), g, true);
    // Costas y fronteras
    ctx.strokeStyle = P.costa; ctx.lineWidth = vista.zoom > 6 ? 1.1 : 0.8;
    for (const a of datos.tierra) polilinea(a, g, true);
    ctx.strokeStyle = P.frontera; ctx.lineWidth = 0.8;
    for (const f of datos.fronteras) polilinea(f, g);
    // Líneas del eclipse
    for (const l of capas.lineas) {
      ctx.strokeStyle = typeof l.color === 'function' ? l.color() : l.color; ctx.lineWidth = l.ancho || 1.5;
      ctx.setLineDash(l.discontinua ? [6, 4] : []);
      polilinea(l.puntos, g);
    }
    ctx.setLineDash([]);
    // Ciudades (sin solaparse) y marcas
    const ocupado = [];
    const libre = (x, y, w, h) => !ocupado.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
    const etiqueta = (texto, x, y, color, fuerte = false) => {
      ctx.font = `${fuerte ? 600 : 400} ${fuerte ? 13 : 11}px "Space Grotesk", system-ui, sans-serif`;
      const w = ctx.measureText(texto).width;
      if (!fuerte && !libre(x + 5, y - 10, w, 13)) return false;
      ocupado.push({ x: x + 5, y: y - 10, w, h: 13 });
      ctx.fillStyle = color; ctx.fillText(texto, x + 5, y - 2);
      return true;
    };
    for (const m of capas.marcas) {
      const p = proyectar(m.lat, m.lon, g);
      if (!p.visible) continue;
      ctx.fillStyle = m.color || P.marca; ctx.strokeStyle = P.espacio; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, m.tipo === 'punto' ? 5 : 4.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      if (m.tipo === 'punto') { ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, 2 * Math.PI); ctx.strokeStyle = m.color || P.marca; ctx.stroke(); }
      if (m.texto) etiqueta(m.texto, p.x + 3, p.y, m.color || P.marca, true);
    }
    const listas = [];
    if (vista.zoom >= 2) listas.push(datos.ciudades.mundo);
    if (vista.zoom >= 7) listas.unshift(datos.ciudades.espana);
    for (const lista of listas) {
      for (const [nombre, lat, lon] of lista) {
        const p = proyectar(lat, lon, g);
        if (!p.visible || p.x < 0 || p.y < 0 || p.x > g.ancho || p.y > g.alto) continue;
        if (etiqueta(nombre, p.x, p.y, P.texto)) {
          ctx.fillStyle = P.texto; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, 2 * Math.PI); ctx.fill();
        }
      }
    }
  }

  /* --- Interacción --- */
  const punteros = new Map();
  let gesto = null;
  const local = (e) => { const r = lienzo.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function zoomEn(f) {
    vista.zoom = Math.max(1, Math.min(60, vista.zoom * f));
    calidadLuego(); redibujar();
  }
  function calidadLuego() {
    rapido = true; clearTimeout(temporizadorCalidad);
    temporizadorCalidad = setTimeout(() => { rapido = false; redibujar(); }, 180);
  }
  function alPulsar(e) {
    lienzo.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, local(e));
    if (punteros.size === 1) gesto = { tipo: 'giro', ultimo: local(e), movido: false };
    if (punteros.size === 2) { const [a, b] = [...punteros.values()]; gesto = { tipo: 'pellizco', d: Math.hypot(a.x - b.x, a.y - b.y), zoom: vista.zoom }; }
  }
  function alMover(e) {
    const p = local(e);
    if (!punteros.has(e.pointerId)) {
      if (e.pointerType === 'mouse' && opciones.alPasar) opciones.alPasar(desproyectar(p.x, p.y, geometria()));
      return;
    }
    punteros.set(e.pointerId, p);
    if (gesto?.tipo === 'giro') {
      const dx = p.x - gesto.ultimo.x, dy = p.y - gesto.ultimo.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) gesto.movido = true;
      if (!gesto.movido) return;
      const g = geometria();
      vista.lon = ((vista.lon - (dx / g.R) * DEG + 540) % 360) - 180;
      vista.lat = Math.max(-85, Math.min(85, vista.lat + (dy / g.R) * DEG));
      gesto.ultimo = p;
      calidadLuego(); redibujar();
    } else if (gesto?.tipo === 'pellizco' && punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      vista.zoom = Math.max(1, Math.min(60, gesto.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesto.d));
      calidadLuego(); redibujar();
    }
  }
  let ultimoToque = 0;
  function alSoltar(e) {
    const p = local(e);
    const toque = gesto?.tipo === 'giro' && !gesto.movido;
    punteros.delete(e.pointerId);
    if (!punteros.size) gesto = null;
    if (!toque) return;
    const g = geometria();
    const q = desproyectar(p.x, p.y, g);
    if (e.pointerType !== 'mouse' && Date.now() - ultimoToque < 300 && q) { irA(q.lat, q.lon, vista.zoom * 2); ultimoToque = 0; return; }
    ultimoToque = Date.now();
    if (q && opciones.alTocar) opciones.alTocar(q.lat, q.lon);
  }
  const alRueda = (e) => { e.preventDefault(); zoomEn(e.deltaY < 0 ? 1.15 : 1 / 1.15); };
  const alDoble = (e) => { const q = desproyectar(local(e).x, local(e).y, geometria()); if (q) irA(q.lat, q.lon, vista.zoom * 2); };
  const alSalir = () => opciones.alPasar && opciones.alPasar(null);
  const alClic = (e) => {
    const b = e.target.closest('[data-globo]');
    if (!b) return;
    if (b.dataset.globo === 'acercar') zoomEn(1.6);
    else if (b.dataset.globo === 'alejar') zoomEn(1 / 1.6);
    else irA(inicial.lat, inicial.lon, inicial.zoom);
  };
  lienzo.addEventListener('pointerdown', alPulsar);
  lienzo.addEventListener('pointermove', alMover);
  lienzo.addEventListener('pointerup', alSoltar);
  lienzo.addEventListener('pointercancel', alSoltar);
  lienzo.addEventListener('pointerleave', alSalir);
  lienzo.addEventListener('wheel', alRueda, { passive: false });
  lienzo.addEventListener('dblclick', alDoble);
  contenedor.addEventListener('click', alClic);
  const observador = new ResizeObserver(() => redibujar());
  observador.observe(contenedor);
  const observadorTema = new MutationObserver(() => { tex = null; redibujar(); });
  observadorTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-noche', 'data-tema'] });

  function irA(lat, lon, zoom = vista.zoom) {
    vista.lat = Math.max(-85, Math.min(85, lat)); vista.lon = lon; vista.zoom = Math.max(1, Math.min(60, zoom));
    redibujar();
  }
  function ponerCapas(nuevas) {
    const cambiaTextura = 'textura' in nuevas;
    capas = { ...capas, ...nuevas };
    if (cambiaTextura) tex = null;
    redibujar();
  }
  function destruir() {
    observador.disconnect(); observadorTema.disconnect(); clearTimeout(temporizadorCalidad);
    contenedor.removeEventListener('click', alClic);
  }
  /** Imagen PNG del globo tal como se ve (para compartir) */
  function aImagen() { return new Promise((r) => lienzo.toBlob(r, 'image/png')); }

  redibujar();
  return { ponerCapas, irA, redibujar, destruir, aImagen, vista };
}

/** '#rrggbb' → entero ABGR (orden de los bytes de ImageData en procesadores little-endian) */
function colorU32(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0xff000000 | ((n & 255) << 16) | (n & 0xff00) | (n >> 16);
}
