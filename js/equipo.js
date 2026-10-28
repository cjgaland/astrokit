/* ==========================================================================
   equipo.js — "Mi equipo": el telescopio de referencia de toda la app
   --------------------------------------------------------------------------
   Antes cada módulo tenía su propia idea del equipo: la calculadora óptica
   el elegido allí, el planificador siempre el S50 Pro, el cuaderno el primero
   de la lista. Ahora hay UNA elección, guardada en el dispositivo
   ("astrokit:miEquipo"), que usan todos:
     · Óptica arranca con él seleccionado.
     · Cielo traduce tamaños a píxeles con su escala de placa.
     · Cuaderno lo propone al anotar una sesión.
     · Portada e Info muestran cuál es y permiten cambiarlo.

   Cuando cambia, se avisa con el evento 'astrokit:equipo' en window, para
   que la pantalla abierta se actualice sin recargar.
   ========================================================================== */

import { cargarJSON } from './util.js';
import { leer, guardar } from './almacen.js';
import { escalaPlaca } from './calculos/optica.js';

const CLAVE = 'miEquipo';
const POR_DEFECTO = 's50pro';

/** Lista de equipos predefinidos (data/equipos.json) */
export async function listaEquipos() {
  return (await cargarJSON('data/equipos.json')).equipos;
}

/** Id del equipo de referencia guardado */
export function idMiEquipo() {
  return leer(CLAVE, POR_DEFECTO);
}

/** El equipo de referencia completo, con su escala de placa (″/px) ya calculada */
export async function miEquipo() {
  const equipos = await listaEquipos();
  const e = equipos.find((x) => x.id === idMiEquipo()) || equipos.find((x) => x.id === POR_DEFECTO) || equipos[0];
  return { ...e, escala: escalaPlaca(e.pixel, e.focal) };
}

/** Cambia el equipo de referencia y avisa a la app */
export function elegirMiEquipo(id) {
  guardar(CLAVE, id);
  window.dispatchEvent(new CustomEvent('astrokit:equipo', { detail: id }));
}

/**
 * HTML de un selector (desplegable) del equipo de referencia. Quien lo pinte
 * debe escuchar su evento 'change' y llamar a elegirMiEquipo(valor).
 */
export function selectorMiEquipo(equipos, idActual = idMiEquipo(), idElemento = 'selector-mi-equipo') {
  return `
    <label class="mi-equipo">
      <span class="etiqueta">Mi equipo</span>
      <select id="${idElemento}" aria-label="Telescopio de referencia">
        ${equipos.map((e) => `<option value="${e.id}" ${e.id === idActual ? 'selected' : ''}>${e.nombre}</option>`).join('')}
      </select>
    </label>`;
}
