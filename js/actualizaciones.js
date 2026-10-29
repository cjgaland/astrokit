/* ==========================================================================
   actualizaciones.js — Avisar de que hay una versión nueva de AstroKit
   --------------------------------------------------------------------------
   Cómo funciona (la pieza que hace el trabajo es el service worker, sw.js):

     1. Cada vez que abres la app, y también al volver a ella o cada 30 min,
        el navegador pregunta al servidor si sw.js ha cambiado.
     2. Si se publicó una versión nueva, se instala en segundo plano con todos
        sus archivos, pero se queda ESPERANDO para no cambiar nada a mitad de uso.
     3. Aquí lo detectamos y mostramos el aviso «Hay una versión nueva».
     4. Al pulsar «Actualizar», le decimos al service worker nuevo que tome el
        control; cuando lo hace, recargamos la página ya con la versión nueva.
     5. Tras recargar, si data/novedades.json describe esa versión, se muestra
        una sola vez qué ha cambiado.

   Nota: en la primera visita no hay aviso (no había versión anterior).
   ========================================================================== */

import { leer, guardar } from './almacen.js';
import { escaparHTML, icono } from './util.js';

const CADA = 30 * 60 * 1000;            // buscar actualizaciones cada 30 minutos
let registro = null;
let actualizacionPedida = false;         // solo recargamos si el usuario lo pidió

/** Arranca todo el sistema. Se llama una vez desde app.js. */
export async function iniciarActualizaciones() {
  if (!('serviceWorker' in navigator)) return;

  // Cuando el service worker nuevo toma el control, recargamos (solo si lo pidió el usuario;
  // en la primera instalación también hay un cambio de control y no queremos recargar)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (actualizacionPedida) location.reload();
  });

  try {
    registro = await navigator.serviceWorker.register('sw.js');
  } catch (e) {
    console.warn('Service worker no registrado:', e);
    return;
  }

  // ¿Ya había una versión nueva esperando (descargada en una visita anterior)?
  if (registro.waiting && navigator.serviceWorker.controller) mostrarAviso();

  // ¿Llega una versión nueva mientras la app está abierta?
  registro.addEventListener('updatefound', () => {
    const nuevo = registro.installing;
    nuevo?.addEventListener('statechange', () => {
      if (nuevo.state === 'installed' && navigator.serviceWorker.controller) mostrarAviso();
    });
  });

  // Buscar actualizaciones al volver a la app (en el iPhone, al sacarla del segundo plano) y cada 30 min
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') buscarActualizacion();
  });
  setInterval(buscarActualizacion, CADA);

  mostrarNovedadesSiToca();
}

/** Pregunta al servidor si hay versión nueva. Devuelve true si hay una esperando. */
export async function buscarActualizacion() {
  if (!registro || !navigator.onLine) return false;
  try { await registro.update(); } catch { return false; }
  // update() termina antes de que acabe la instalación: damos un margen corto
  await new Promise((r) => setTimeout(r, 1500));
  if (registro.waiting && navigator.serviceWorker.controller) { mostrarAviso(); return true; }
  return Boolean(registro.installing);
}

/** Versión que está funcionando ahora (la pregunta al service worker). */
export function versionActual() {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) return Promise.resolve(null);
  return new Promise((resolver) => {
    const canal = new MessageChannel();
    canal.port1.onmessage = (e) => resolver(e.data);
    sw.postMessage('version', [canal.port2]);
    setTimeout(() => resolver(null), 2000);          // por si no contesta
  });
}

/** Número legible: 'astrokit-v9' → 'versión 9' */
export const versionLegible = (v) => (v ? `versión ${v.replace('astrokit-v', '')}` : 'versión desconocida');

/* ---------- El aviso ---------- */
function mostrarAviso() {
  if (document.getElementById('aviso-actualizacion')) return;
  const aviso = document.createElement('div');
  aviso.id = 'aviso-actualizacion';
  aviso.className = 'aviso-actualizacion';
  aviso.setAttribute('role', 'status');
  aviso.innerHTML = `
    <span class="aviso-actualizacion__icono">${icono('azar')}</span>
    <span class="aviso-actualizacion__texto"><strong>Hay una versión nueva de AstroKit.</strong>
      <small>Pulsa para actualizar; tus datos no se tocan.</small></span>
    <button type="button" class="aviso-actualizacion__boton" data-accion="actualizar">Actualizar</button>
    <button type="button" class="boton-icono" data-accion="luego" aria-label="Más tarde">${icono('cerrar')}</button>`;
  aviso.addEventListener('click', (e) => {
    const accion = e.target.closest('button')?.dataset.accion;
    if (accion === 'actualizar') {
      actualizacionPedida = true;
      e.target.closest('button').textContent = 'Actualizando…';
      registro?.waiting?.postMessage('actualizar');
      // Por si el navegador no avisa del cambio de control, recargamos igualmente
      setTimeout(() => location.reload(), 3000);
    }
    if (accion === 'luego') aviso.remove();          // volverá a salir la próxima vez que abras la app
  });
  (document.querySelector('.app') || document.body).appendChild(aviso);
}

/* ---------- Novedades tras actualizar ---------- */
async function mostrarNovedadesSiToca() {
  // Esperamos a que haya un service worker controlando la página para saber la versión
  await navigator.serviceWorker.ready;
  // En la primera visita, el service worker toma el control un instante después: lo esperamos
  if (!navigator.serviceWorker.controller) {
    await new Promise((listo) => {
      navigator.serviceWorker.addEventListener('controllerchange', listo, { once: true });
      setTimeout(listo, 5000);
    });
  }
  const version = await versionActual();
  if (!version) return;
  const vista = leer('versionVista', null);
  guardar('versionVista', version);
  if (!vista || vista === version) return;           // primera visita, o nada nuevo

  try {
    const { versiones } = await fetch('data/novedades.json').then((r) => r.json());
    const entrada = versiones.find((v) => v.version === version);
    mostrarNovedades(version, entrada?.cambios || ['Mejoras y correcciones.']);
  } catch { /* sin novedades: no pasa nada */ }
}

/**
 * Se ha abierto un enlace a una sección que esta versión no tiene. Se avisa,
 * se busca la actualización en el momento y se guarda la ruta para abrirla
 * después de actualizar (app.js la lee al arrancar).
 */
export async function avisarEnlaceDesconocido(ruta) {
  try { sessionStorage.setItem('astrokit:rutaPendiente', ruta); } catch { /* sin sessionStorage */ }
  if (document.getElementById('aviso-enlace')) return;
  const caja = document.createElement('div');
  caja.id = 'aviso-enlace';
  caja.className = 'aviso-actualizacion';
  caja.setAttribute('role', 'status');
  caja.innerHTML = `
    <span class="aviso-actualizacion__icono">${icono('azar')}</span>
    <span class="aviso-actualizacion__texto"><strong data-titulo>Ese enlace parece de una versión más nueva de AstroKit.</strong>
      <span data-estado>Buscando la actualización…</span></span>
    <button type="button" class="boton-icono" aria-label="Cerrar">${icono('cerrar')}</button>`;
  caja.querySelector('button').addEventListener('click', () => caja.remove());
  (document.querySelector('.app') || document.body).appendChild(caja);
  // Al arrancar, el service worker aún se está registrando: se espera a que lo esté (máx. 5 s)
  for (let i = 0; i < 50 && !registro; i++) await new Promise((r) => setTimeout(r, 100));
  const hay = await buscarActualizacion();
  const estado = caja.querySelector('[data-estado]');
  if (hay) { caja.remove(); return; }                 // ya sale el aviso «Actualizar»: al pulsarlo se abrirá el enlace
  if (navigator.onLine) {
    caja.querySelector('[data-titulo]').textContent = 'No encuentro ese apartado.';
    estado.textContent = 'Tienes la última versión: puede que el enlace esté mal escrito.';
  } else {
    estado.textContent = 'Sin conexión: conéctate y vuelve a abrir el enlace para actualizar.';
  }
}

function mostrarNovedades(version, cambios) {
  const caja = document.createElement('div');
  caja.className = 'aviso-actualizacion aviso-actualizacion--novedades';
  caja.setAttribute('role', 'status');
  caja.innerHTML = `
    <span class="aviso-actualizacion__icono">${icono('check')}</span>
    <span class="aviso-actualizacion__texto"><strong>AstroKit actualizado a la ${versionLegible(version)}.</strong>
      <ul>${cambios.map((c) => `<li>${escaparHTML(c)}</li>`).join('')}</ul></span>
    <button type="button" class="boton-icono" aria-label="Cerrar">${icono('cerrar')}</button>`;
  caja.querySelector('button').addEventListener('click', () => caja.remove());
  (document.querySelector('.app') || document.body).appendChild(caja);
}
