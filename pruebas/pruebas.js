/* ==========================================================================
   pruebas.js — Mini sistema de pruebas, sin librerías
   --------------------------------------------------------------------------
   prueba('nombre', () => { ... })  registra una prueba.
   igual(a, b)          falla si a !== b
   cerca(a, b, tol)     falla si |a − b| > tol (para números con decimales)
   cierto(x, mensaje)   falla si x es falso

   En cada fase añadiremos aquí las pruebas de sus cálculos
   (fase 2: escala de placa del S50 Pro ≈ 2,3″/px, diagonal ≈ 2,8°...).
   ========================================================================== */

import { normalizar, resaltar, mdLigero, sinMarcas } from '../js/util.js';
import * as O from '../js/calculos/optica.js';

const grupos = [];
function grupo(nombre) { grupos.push({ nombre, pruebas: [] }); }
function prueba(nombre, fn) { grupos.at(-1).pruebas.push({ nombre, fn }); }

function igual(a, b) { if (a !== b) throw new Error(`esperaba ${JSON.stringify(b)}, salió ${JSON.stringify(a)}`); }
function cerca(a, b, tol) { if (Math.abs(a - b) > tol) throw new Error(`esperaba ${b} ± ${tol}, salió ${a}`); }
function cierto(x, mensaje = 'condición falsa') { if (!x) throw new Error(mensaje); }

/* ---------- Utilidades de texto ---------- */
grupo('Utilidades de texto (js/util.js)');

prueba('normalizar quita tildes y mayúsculas', () => {
  igual(normalizar('Óptica Señal/Ruido'), 'optica senal/ruido');
});
prueba('normalizar conserva la longitud (necesario para resaltar)', () => {
  const t = 'Rotación de campo — 1/1,2″ µm Hα';
  igual(normalizar(t).length, t.length);
});
prueba('resaltar marca sin importar las tildes', () => {
  igual(resaltar('Relación focal', ['relacion']), '<mark>Relación</mark> focal');
});
prueba('resaltar escapa el HTML', () => {
  igual(resaltar('a<b', ['b']), 'a&lt;<mark>b</mark>');
});
prueba('mdLigero convierte negrita y cursiva', () => {
  igual(mdLigero('**cuatro** veces *más*'), '<strong>cuatro</strong> veces <em>más</em>');
});
prueba('sinMarcas quita asteriscos', () => {
  igual(sinMarcas('DSO, *Deep Sky Object*'), 'DSO, Deep Sky Object');
});

/* ---------- Datos del glosario ---------- */
grupo('Datos del glosario (data/glosario.json)');
const glosario = await fetch('../data/glosario.json').then((r) => r.json());

prueba('hay 8 bloques', () => igual(glosario.bloques.length, 8));
prueba('hay al menos 150 términos', () => cierto(glosario.terminos.length >= 150, `solo ${glosario.terminos.length}`));
prueba('los identificadores no se repiten', () => {
  const ids = glosario.terminos.map((t) => t.id);
  igual(new Set(ids).size, ids.length);
});
prueba('todos los términos tienen nombre, algún texto y un bloque existente', () => {
  const bloques = new Set(glosario.bloques.map((b) => b.id));
  for (const t of glosario.terminos) {
    // la mayoría tiene definición; alguno solo "en tu equipo" (Mosaico 8K) o solo lista (Las líneas clave)
    cierto(t.termino && (t.definicion || t.equipo || t.lista?.length), `${t.id} incompleto`);
    cierto(bloques.has(t.bloque), `${t.id}: bloque ${t.bloque} no existe`);
  }
});
prueba('la escala de placa trae su fórmula y el dato del equipo', () => {
  const t = glosario.terminos.find((x) => x.id === 'escala-de-placa');
  cierto(t.cuenta.includes('206,265'), 'falta la fórmula');
  cierto(t.equipo.includes('2,3'), 'falta el 2,3″/px del S50 Pro');
});
prueba('"Frames de calibración" conserva sus 4 tipos y su "en tu equipo"', () => {
  const t = glosario.terminos.find((x) => x.id === 'frames-de-calibracion');
  igual(t.lista.length, 4);
  cierto(t.equipo, 'falta "en tu equipo"');
});
prueba('ningún texto conserva marcas sin procesar (*Analogía:* etc.)', () => {
  const texto = JSON.stringify(glosario.terminos);
  cierto(!/\*(Analogía|La cuenta|En tu equipo|Regla práctica):\*/.test(texto), 'quedan marcas');
});

/* ---------- Óptica ---------- */
grupo('Calculadora óptica (js/calculos/optica.js) con valores conocidos');
const { equipos } = await fetch('../data/equipos.json').then((r) => r.json());
const s50 = equipos.find((e) => e.id === 's50pro');
const draco = equipos.find((e) => e.id === 'draco-dso');
const s50ancho = O.tamanoSensor(s50.resX, s50.pixel);   // 3840 × 2,9 µm
const s50alto = O.tamanoSensor(s50.resY, s50.pixel);

prueba('S50 Pro: sensor de 11,14 × 6,26 mm', () => {
  cerca(s50ancho, 11.136, 0.001);
  cerca(s50alto, 6.264, 0.001);
});
prueba('S50 Pro: relación focal f/5,2', () => cerca(O.relacionFocal(260, 50), 5.2, 1e-9));
prueba('S50 Pro: escala de placa ≈ 2,30″/px', () => cerca(O.escalaPlaca(s50.pixel, s50.focal), 2.30, 0.01));
prueba('S50 Pro: campo ≈ 2,45° × 1,38°', () => {
  cerca(O.campoVision(s50ancho, 260), 2.45, 0.01);
  cerca(O.campoVision(s50alto, 260), 1.38, 0.01);
});
prueba('S50 Pro: diagonal ≈ 2,8°', () => cerca(O.campoVision(O.diagonal(s50ancho, s50alto), 260), 2.81, 0.02));
prueba('Draco (2×2): escala ≈ 1,46″/px y f/3,8', () => {
  cerca(O.escalaPlaca(draco.pixel, draco.focal), 1.456, 0.005);
  cerca(O.relacionFocal(340, 90), 3.78, 0.01);
});
prueba('Draco: lado largo ≈ 1,65° (dato de la comparativa)', () =>
  cerca(O.campoVision(O.tamanoSensor(draco.resX, draco.pixel), draco.focal), 1.65, 0.02));
prueba('Dawes: 2,32″ con 50 mm y 1,29″ con 90 mm', () => {
  cerca(O.limiteDawes(50), 2.32, 0.005);
  cerca(O.limiteDawes(90), 1.29, 0.005);
});
prueba('Luz: el Draco recoge ≈ 3,24× (≈ +1,28 mag) más que el S50', () => {
  cerca(O.luzRelativa(90, 50), 3.24, 1e-9);
  cerca(O.gananciaMagnitudes(90, 50), 1.276, 0.001);
});
prueba('Aproximación 57,3 × s ÷ F casi igual a la fórmula exacta', () =>
  cerca(O.campoVisionAprox(s50ancho, 260), O.campoVision(s50ancho, 260), 0.001));
prueba('Muestreo: S50 con seeing 3″ → 1,3 px (submuestreo)', () => {
  const m = O.muestreo(3, 2.30);
  cerca(m.pixeles, 1.30, 0.01);
  igual(m.estado, 'sub');
});
prueba('Mosaico: M31 (190′) en el S50 (147′) → 2 paneles; M42 cabe en 1', () => {
  igual(O.panelesMosaico(190, 60, 147.2, 82.8).columnas, 2);
  const m42 = O.panelesMosaico(85, 60, 147.2, 82.8);
  igual(m42.columnas * m42.filas, 1);
});
prueba('Caja de una elipse girada 90° intercambia ancho y alto', () => {
  const c = O.cajaGirada(190, 60, 90);
  cerca(c.ancho, 60, 1e-9); cerca(c.alto, 190, 1e-9);
});
prueba('SNR √N: para duplicarla hacen falta 4× tomas', () => {
  igual(O.tomasParaFactor(360, 2), 1440);
  cerca(O.factorSNR(1440, 360), 2, 1e-12);
});
prueba('360 tomas de 10 s = 1 h de integración', () => cerca(O.horasIntegracion(360, 10), 1, 1e-12));

/* ---------- Ejecutar y pintar ---------- */
const salida = document.getElementById('salida');
let ok = 0, mal = 0;
for (const g of grupos) {
  salida.insertAdjacentHTML('beforeend', `<h2>${g.nombre}</h2>`);
  for (const p of g.pruebas) {
    try {
      await p.fn();
      ok++;
      salida.insertAdjacentHTML('beforeend', `<div class="ok">✓ ${p.nombre}</div>`);
    } catch (e) {
      mal++;
      salida.insertAdjacentHTML('beforeend', `<div class="mal">✗ ${p.nombre}</div><div class="detalle">${e.message}</div>`);
    }
  }
}
const resumen = document.getElementById('resumen');
resumen.textContent = mal ? `${mal} fallan, ${ok} pasan` : `Las ${ok} pruebas pasan`;
resumen.className = mal ? 'mal' : 'ok';
// Para poder leer el resultado desde fuera (p. ej. herramientas automáticas)
window.resultadoPruebas = { ok, mal };
