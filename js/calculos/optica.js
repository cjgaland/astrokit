/* ==========================================================================
   calculos/optica.js — Fórmulas de óptica y de señal/ruido
   --------------------------------------------------------------------------
   Funciones "puras": reciben números y devuelven números, sin tocar la
   pantalla. Así se pueden comprobar en pruebas/pruebas.html con valores
   conocidos (p. ej. el S50 Pro debe dar ≈ 2,30″/px).

   Unidades: apertura y focal en mm, píxel en µm, ángulos en grados (°),
   minutos (′) o segundos de arco (″) según se indica en cada función.
   ========================================================================== */

/* ---------- Constantes ----------
   Un radián son 180/π ≈ 57,2958°, y en segundos de arco 57,2958 × 3600 ≈ 206.265″.
   Ese 206.265 es el número "mágico" de la escala de placa. */
export const GRADOS_POR_RADIAN = 180 / Math.PI;            // 57,2958
export const SEGUNDOS_POR_RADIAN = GRADOS_POR_RADIAN * 3600; // 206.264,8

/** Relación focal f/ = F ÷ D (adimensional). */
export function relacionFocal(focal, apertura) {
  return focal / apertura;
}

/** Tamaño físico del sensor en mm: nº de píxeles × tamaño del píxel (µm → mm). */
export function tamanoSensor(pixeles, pixelMicras) {
  return (pixeles * pixelMicras) / 1000;
}

/** Diagonal por Pitágoras: √(ancho² + alto²). */
export function diagonal(ancho, alto) {
  return Math.hypot(ancho, alto);
}

/**
 * Campo de visión en GRADOS de un lado del sensor de tamaño `ladoMm`.
 * Fórmula exacta: FOV = 2 · arctan(lado / (2 · F)).
 * Para ángulos pequeños arctan(x) ≈ x, y queda la aproximación del glosario:
 * FOV ≈ 57,3 × lado ÷ F. Con focales de telescopio la diferencia es mínima.
 */
export function campoVision(ladoMm, focal) {
  return 2 * Math.atan(ladoMm / (2 * focal)) * GRADOS_POR_RADIAN;
}

/** Versión aproximada (la del glosario), para enseñarla al lado de la exacta. */
export function campoVisionAprox(ladoMm, focal) {
  return (GRADOS_POR_RADIAN * ladoMm) / focal;
}

/**
 * Escala de placa en ″/píxel = 206,265 × píxel(µm) ÷ focal(mm).
 * (Es el campo de UN píxel: 206.265″/rad × (píxel en mm ÷ focal) con el
 *  factor 1/1000 de µm→mm ya metido en el 206,265.)
 */
export function escalaPlaca(pixelMicras, focal) {
  return (206.265 * pixelMicras) / focal;
}

/** Límite de Dawes en ″: separación mínima de dos estrellas ≈ 116 ÷ D(mm). */
export function limiteDawes(apertura) {
  return 116 / apertura;
}

/** Luz recogida relativa: proporcional al área, es decir, a D². */
export function luzRelativa(aperturaA, aperturaB) {
  return (aperturaA / aperturaB) ** 2;
}

/** Esa misma ganancia expresada en magnitudes: Δm = 2,5 · log10(cociente de luz). */
export function gananciaMagnitudes(aperturaA, aperturaB) {
  return 2.5 * Math.log10(luzRelativa(aperturaA, aperturaB));
}

/**
 * Muestreo: cuántos píxeles ocupa la FWHM de una estrella, dado el seeing (″).
 * Regla práctica (Nyquist): lo ideal son unos 2–3 píxeles por FWHM.
 * Devuelve { pixeles, estado } con estado = 'sub' | 'optimo' | 'sobre'.
 */
export function muestreo(seeing, escala) {
  const pixeles = seeing / escala;
  const estado = pixeles < 1.5 ? 'sub' : pixeles > 3.5 ? 'sobre' : 'optimo';
  return { pixeles, estado };
}

/* ---------- Encuadre ---------- */

/**
 * ¿Cuántos paneles de mosaico hacen falta para cubrir un objeto?
 * `solape` es la fracción que se superpone entre paneles (0,15 = 15 %),
 * necesaria para que el programa pueda unirlos. Devuelve { columnas, filas }.
 */
export function panelesMosaico(objetoAncho, objetoAlto, campoAncho, campoAlto, solape = 0.15) {
  const util = (campo) => campo * (1 - solape);       // lo que aporta cada panel nuevo
  const paneles = (objeto, campo) =>
    objeto <= campo ? 1 : 1 + Math.ceil((objeto - campo) / util(campo));
  return { columnas: paneles(objetoAncho, campoAncho), filas: paneles(objetoAlto, campoAlto) };
}

/**
 * Caja que ocupa una elipse de ancho × alto girada `angulo` grados.
 * Sirve para saber si un objeto inclinado (como M31) cabe en el sensor.
 */
export function cajaGirada(ancho, alto, angulo) {
  const a = (angulo * Math.PI) / 180;
  const rx = ancho / 2, ry = alto / 2;
  return {
    ancho: 2 * Math.sqrt((rx * Math.cos(a)) ** 2 + (ry * Math.sin(a)) ** 2),
    alto: 2 * Math.sqrt((rx * Math.sin(a)) ** 2 + (ry * Math.cos(a)) ** 2),
  };
}

/* ---------- Señal / ruido ---------- */

/**
 * Al apilar N tomas, la señal crece como N y el ruido aleatorio como √N,
 * así que la SNR mejora como N/√N = √N.
 * Para multiplicar la SNR por un factor X hacen falta X² veces más tomas.
 */
export function factorSNR(nTomas, nTomasReferencia = 1) {
  return Math.sqrt(nTomas / nTomasReferencia);
}

export function tomasParaFactor(nTomasActuales, factor) {
  return Math.ceil(nTomasActuales * factor ** 2);
}

/** Integración total en horas a partir de nº de tomas y segundos por toma. */
export function horasIntegracion(nTomas, segundosPorToma) {
  return (nTomas * segundosPorToma) / 3600;
}
