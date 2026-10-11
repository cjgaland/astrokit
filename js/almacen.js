/* ==========================================================================
   almacen.js — Guardar y leer datos en el propio dispositivo (localStorage)
   --------------------------------------------------------------------------
   localStorage es un pequeño "cajón" del navegador (unos 5 MB por web) que
   sobrevive a cerrar la app. Solo guarda texto, así que convertimos los datos
   a JSON al guardar y de vuelta al leer.

   Todas las claves llevan el prefijo "astrokit:" para no mezclarse con otras
   webs servidas desde la misma dirección (p. ej. localhost).

   Las funciones van envueltas en try/catch: en modo privado de Safari, o si
   el cajón está lleno, localStorage puede fallar, y la app debe seguir
   funcionando aunque no recuerde nada.
   ========================================================================== */

const PREFIJO = 'astrokit:';

/** Lee un valor. Si no existe o falla, devuelve `porDefecto`. */
export function leer(clave, porDefecto = null) {
  try {
    const texto = localStorage.getItem(PREFIJO + clave);
    return texto === null ? porDefecto : JSON.parse(texto);
  } catch {
    return porDefecto;
  }
}

/** Guarda un valor (cualquier cosa convertible a JSON). Devuelve true si lo logró. */
export function guardar(clave, valor) {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

/** Borra un valor. */
export function borrar(clave) {
  try { localStorage.removeItem(PREFIJO + clave); } catch { /* nada */ }
}

/**
 * Conjunto persistente: una lista de identificadores sin repetir
 * (lo usamos para favoritos y "ya lo sé" del glosario).
 * Uso:  const favs = conjunto('glosario:favoritos');
 *       favs.tiene('apertura'); favs.alternar('apertura');
 */
export function conjunto(clave) {
  const datos = new Set(leer(clave, []));
  return {
    tiene: (id) => datos.has(id),
    alternar(id) {
      datos.has(id) ? datos.delete(id) : datos.add(id);
      guardar(clave, [...datos]);
      return datos.has(id);
    },
    get tamano() { return datos.size; },
    valores: () => [...datos],
  };
}
