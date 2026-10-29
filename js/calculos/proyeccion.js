/* ==========================================================================
   calculos/proyeccion.js — De altura y acimut a un punto del mapa celeste
   --------------------------------------------------------------------------
   El mapa dibuja la bóveda celeste vista desde abajo, como un planisferio
   sostenido sobre la cabeza: el cénit en el centro, el horizonte en el borde,
   el norte arriba y el ESTE A LA IZQUIERDA (al mirar hacia arriba, el este y
   el oeste quedan invertidos respecto a un mapa de la Tierra).

   Proyección estereográfica: un punto a distancia cenital z se dibuja a
   r = tan(z / 2) del centro. En el horizonte (z = 90°) r = tan 45° = 1.
   Conserva las formas (las constelaciones no se deforman), por eso la usan
   los planisferios.
   ========================================================================== */

const RAD = Math.PI / 180;

/** alt, az en grados (az desde el norte hacia el este) → { x, y } con el horizonte en radio 1 */
export function proyectar(alt, az) {
  const r = Math.tan(((90 - alt) * RAD) / 2);
  return { x: -r * Math.sin(az * RAD), y: -r * Math.cos(az * RAD) };
}

/** La inversa: un punto del mapa → { alt, az } en grados */
export function desproyectar(x, y) {
  const r = Math.hypot(x, y);
  const alt = 90 - 2 * Math.atan(r) / RAD;
  const az = ((Math.atan2(-x, -y) / RAD) + 360) % 360;
  return { alt, az };
}
