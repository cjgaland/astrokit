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
