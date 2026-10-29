/* ==========================================================================
   equipo.js — "Mi equipo": el telescopio de referencia de toda la app
   --------------------------------------------------------------------------
   Antes cada módulo tenía su propia idea del equipo: la calculadora óptica
   el elegido allí, el planificador siempre el S50 Pro, el cuaderno el primero
   de la lista. Ahora hay UNA elección, guardada en el dispositivo
   ("astrokit:miEquipo"), que usan todos:
     · Óptica lo selecciona cada vez que se abre (allí se puede cambiar para
       probar otro, sin tocar «Mi equipo»); con «Ninguno» abre «A mano».
     · Cielo traduce tamaños a píxeles con su escala de placa.
     · Objetos celestes calcula cómo encaja cada objeto en su campo.
     · Cuaderno lo propone al anotar una sesión.
     · Portada e Info muestran cuál es y permiten cambiarlo.

   «Ninguno» (id 'ninguno') significa que no hay telescopio de referencia:
   miEquipo() devuelve null y cada módulo omite lo que dependa de él.

   Cuando cambia, se avisa con el evento 'astrokit:equipo' en window, para
   que la pantalla abierta se actualice sin recargar.
   ========================================================================== */

import { cargarJSON } from './util.js';
import { leer, guardar } from './almacen.js';
import { escalaPlaca } from './calculos/optica.js';

const CLAVE = 'miEquipo';
const POR_DEFECTO = 's50pro';
export const NINGUNO = 'ninguno';

/** Lista de equipos predefinidos (data/equipos.json), en orden alfabético */
export async function listaEquipos() {
  const { equipos } = await cargarJSON('data/equipos.json');
  return ordenarEquipos(equipos);
}

/** Copia de la lista ordenada alfabéticamente por nombre (a la española) */
export function ordenarEquipos(equipos) {
  return [...equipos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}

/** Id del equipo de referencia guardado */
export function idMiEquipo() {
  return leer(CLAVE, POR_DEFECTO);
}

/** El equipo de referencia completo, con su escala de placa (″/px) ya calculada; null si es «Ninguno» */
export async function miEquipo() {
  if (idMiEquipo() === NINGUNO) return null;
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
        <option value="${NINGUNO}" ${idActual === NINGUNO ? 'selected' : ''}>Ninguno</option>
        ${ordenarEquipos(equipos).map((e) => `<option value="${e.id}" ${e.id === idActual ? 'selected' : ''}>${e.nombre}</option>`).join('')}
      </select>
    </label>`;
}
