/* ==========================================================================
   calculos/astro.js — Astronomía de posición, sin internet
   --------------------------------------------------------------------------
   Algoritmos simplificados de Jean Meeus ("Astronomical Algorithms") y del
   Astronomical Almanac. Precisión: ~1′ para el Sol y ~0,3° para la Luna, lo
   que da horas de salida/puesta con error de 1–3 minutos. De sobra para
   planificar una noche (no para predecir ocultaciones).

   Convenciones:
     · Ángulos en GRADOS (las funciones trigonométricas de JS usan radianes;
       convertimos dentro).
     · Longitud geográfica positiva al ESTE y negativa al OESTE
       (Córdoba = −4,77).
     · Fechas como objetos Date de JS: internamente son milisegundos UTC,
       así que no hay líos de horario de verano; solo al MOSTRAR la hora se
       usa la zona horaria del dispositivo.
     · Coordenadas de los objetos en J2000. La precesión desde el año 2000
       mueve el cielo unos 20′ en 2026: irrelevante para planificar.
   ========================================================================== */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const sin = (g) => Math.sin(g * RAD);
const cos = (g) => Math.cos(g * RAD);
const MS_DIA = 86400000;

/** Reduce un ángulo al intervalo [0, 360). */
export const norm360 = (x) => ((x % 360) + 360) % 360;
/** Reduce un ángulo al intervalo (−180, 180]. */
const norm180 = (x) => { const y = norm360(x); return y > 180 ? y - 360 : y; };

/* ---------- Tiempo ---------- */

/**
 * Día juliano: días transcurridos desde el 1 de enero del 4713 a. C. a
 * mediodía. Los astrónomos lo usan para contar el tiempo sin meses ni años.
 * El 1-1-1970 00:00 UTC (origen de las fechas de JS) es el día 2.440.587,5.
 */
export function diaJuliano(fecha) {
  return fecha.getTime() / MS_DIA + 2440587.5;
}

/**
 * Tiempo sidéreo local, en grados: qué ascensión recta está cruzando tu
 * meridiano en ese instante. La Tierra da una vuelta respecto a las
 * estrellas en 23 h 56 min, por eso el sidéreo "adelanta" ~4 min al día.
 * Fórmula de Meeus (12.4) para Greenwich, más la longitud del lugar.
 */
export function tiempoSidereoLocal(fecha, lon) {
  const d = diaJuliano(fecha) - 2451545.0;          // días desde J2000
  const T = d / 36525;                               // siglos julianos
  const gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T;
  return norm360(gmst + lon);
}

/* ---------- Sol ---------- */

/**
 * Posición del Sol (ascensión recta y declinación en grados, y su longitud
 * eclíptica). Algoritmo de baja precisión del Astronomical Almanac (~1′).
 */
export function posicionSol(fecha) {
  const d = diaJuliano(fecha) - 2451545.0;
  const g = norm360(357.529 + 0.98560028 * d);       // anomalía media
  const q = norm360(280.459 + 0.98564736 * d);       // longitud media
  // Longitud eclíptica: la media más la "ecuación del centro" (la órbita es elíptica)
  const L = norm360(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
  const e = 23.439 - 0.00000036 * d;                 // oblicuidad de la eclíptica
  const ra = norm360(Math.atan2(cos(e) * sin(L), cos(L)) * DEG);
  const dec = Math.asin(sin(e) * sin(L)) * DEG;
  return { ra, dec, lon: L };
}

/* ---------- Luna ---------- */

/**
 * Posición de la Luna (geocéntrica). Serie truncada del Astronomical Almanac:
 * la longitud media más los términos periódicos mayores (la "evección", la
 * "variación"...), que son las perturbaciones que causa el Sol.
 * Devuelve ra, dec, longitud y latitud eclípticas y paralaje (todo en grados).
 */
export function posicionLuna(fecha) {
  const T = (diaJuliano(fecha) - 2451545.0) / 36525;
  const lon = norm360(218.32 + 481267.881 * T
    + 6.29 * sin(135.0 + 477198.87 * T)
    - 1.27 * sin(259.3 - 413335.36 * T)
    + 0.66 * sin(235.7 + 890534.22 * T)
    + 0.21 * sin(269.9 + 954397.74 * T)
    - 0.19 * sin(357.5 + 35999.05 * T)
    - 0.11 * sin(186.5 + 966404.03 * T));
  const lat = 5.13 * sin(93.3 + 483202.02 * T)
    + 0.28 * sin(228.2 + 960400.89 * T)
    - 0.28 * sin(318.3 + 6003.15 * T)
    - 0.17 * sin(217.6 - 407332.21 * T);
  // Paralaje horizontal: ángulo con el que se vería el radio terrestre desde la Luna (~0,95°)
  const paralaje = 0.9508
    + 0.0518 * cos(135.0 + 477198.87 * T)
    + 0.0095 * cos(259.3 - 413335.36 * T)
    + 0.0078 * cos(235.7 + 890534.22 * T)
    + 0.0028 * cos(269.9 + 954397.74 * T);

  // De coordenadas eclípticas (λ, β) a ecuatoriales (α, δ): un giro de ejes de ε grados
  const e = 23.439 - 0.0130042 * T;
  const x = cos(lat) * cos(lon);
  const y = cos(e) * cos(lat) * sin(lon) - sin(e) * sin(lat);
  const z = sin(e) * cos(lat) * sin(lon) + cos(e) * sin(lat);
  return {
    ra: norm360(Math.atan2(y, x) * DEG),
    dec: Math.asin(z) * DEG,
    lon, lat, paralaje,
  };
}

/* ---------- De coordenadas del cielo a coordenadas locales ---------- */

/**
 * Altura y acimut de un objeto (ra, dec en grados) visto desde (lat, lon).
 * H es el ángulo horario: cuánto ha girado el objeto desde que cruzó tu meridiano.
 * Acimut medido desde el NORTE hacia el ESTE (0° N, 90° E, 180° S, 270° O).
 */
export function altAz(ra, dec, lat, lon, fecha) {
  const H = norm360(tiempoSidereoLocal(fecha, lon) - ra);
  const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) * DEG;
  const az = norm360(Math.atan2(sin(H), cos(H) * sin(lat) - Math.tan(dec * RAD) * cos(lat)) * DEG + 180);
  return { alt, az, H: norm180(H) };
}

/** Altura del Sol */
export function alturaSol(fecha, lat, lon) {
  const s = posicionSol(fecha);
  return altAz(s.ra, s.dec, lat, lon, fecha).alt;
}

/**
 * Altura de la Luna vista desde la superficie (topocéntrica). La Luna está
 * tan cerca que, vista desde tu sitio y no desde el centro de la Tierra,
 * aparece hasta ~1° más baja (paralaje): alt ≈ alt_geo − paralaje · cos(alt_geo).
 */
export function alturaLuna(fecha, lat, lon) {
  const l = posicionLuna(fecha);
  const { alt } = altAz(l.ra, l.dec, lat, lon, fecha);
  return alt - l.paralaje * cos(alt);
}

/** Altura máxima de un objeto (al culminar): 90° − |latitud − declinación|. */
export function alturaMaxima(dec, lat) {
  return 90 - Math.abs(lat - dec);
}

/**
 * Próxima culminación (paso por el meridiano) a partir de `desde`.
 * Ocurre cuando el tiempo sidéreo local iguala la ascensión recta del objeto;
 * el sidéreo avanza 360,9856° por día solar.
 */
export function proximaCulminacion(ra, lon, desde) {
  const falta = norm360(ra - tiempoSidereoLocal(desde, lon));
  return new Date(desde.getTime() + (falta / 360.98564736629) * MS_DIA);
}

/* ---------- Fase de la Luna ---------- */

/**
 * Fase lunar en un instante:
 *  · elongacion: ángulo Sol–Luna medido sobre la eclíptica (0° nueva, 180° llena)
 *  · iluminada: fracción del disco iluminada (0 a 1) = (1 − cos ψ) ÷ 2,
 *    donde ψ es la separación real Sol–Luna en el cielo
 *  · edad: días desde la última Luna nueva (mes sinódico = 29,53 días)
 */
export function faseLunar(fecha) {
  const s = posicionSol(fecha);
  const l = posicionLuna(fecha);
  const elongacion = norm360(l.lon - s.lon);
  const psi = Math.acos(cos(l.lat) * cos(l.lon - s.lon)) * DEG;
  const iluminada = (1 - cos(psi)) / 2;
  const creciente = elongacion < 180;
  return {
    elongacion, iluminada, creciente,
    edad: (elongacion / 360) * 29.530589,
    nombre: nombreFase(iluminada, creciente),
  };
}

function nombreFase(k, creciente) {
  if (k < 0.03) return 'Luna nueva';
  if (k > 0.97) return 'Luna llena';
  if (Math.abs(k - 0.5) < 0.06) return creciente ? 'Cuarto creciente' : 'Cuarto menguante';
  if (k < 0.5) return creciente ? 'Creciente' : 'Menguante';
  return creciente ? 'Gibosa creciente' : 'Gibosa menguante';
}

/**
 * Próxima Luna nueva (objetivo = 0°) o llena (objetivo = 180°) desde `desde`:
 * buscamos cuándo la elongación pasa por el objetivo.
 */
export function proximaFase(desde, objetivo) {
  const f = (t) => norm180(faseLunar(new Date(t)).elongacion - objetivo);
  const paso = 6 * 3600000;                              // de 6 en 6 horas
  let t0 = desde.getTime(), f0 = f(t0);
  for (let i = 0; i < 4 * 31; i++) {
    const t1 = t0 + paso, f1 = f(t1);
    // Cruce de negativo a positivo = pasa por el objetivo
    // (el salto de +180 a −180 al dar la vuelta no cuenta)
    if (f0 < 0 && f1 >= 0 && f1 - f0 < 90) return new Date(biseccion(f, t0, t1, 0));
    t0 = t1; f0 = f1;
  }
  return null;
}

/* ---------- Búsqueda de sucesos (salidas, puestas, crepúsculos) ---------- */

/** Busca por bisección el instante entre a y b en que f(t) = umbral (precisión ~20 s). */
function biseccion(f, a, b, umbral) {
  let fa = f(a) - umbral;
  while (b - a > 20000) {
    const m = (a + b) / 2, fm = f(m) - umbral;
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { b = m; }
  }
  return (a + b) / 2;
}

/**
 * Recorre [inicio, fin] de `pasoMin` en `pasoMin` minutos buscando cuándo la
 * función altura(t) cruza `umbral`. Devuelve [{ tipo: 'sube'|'baja', fecha }].
 */
export function cruces(altura, inicio, fin, umbral, pasoMin = 10) {
  const paso = pasoMin * 60000;
  const f = (t) => altura(new Date(t));
  const lista = [];
  let t0 = inicio.getTime(), a0 = f(t0) - umbral;
  for (let t1 = t0 + paso; t1 <= fin.getTime() + 1; t1 += paso) {
    const a1 = f(t1) - umbral;
    if (Math.sign(a0) !== Math.sign(a1)) {
      lista.push({ tipo: a1 > 0 ? 'sube' : 'baja', fecha: new Date(biseccion(f, t0, t1, umbral)) });
    }
    t0 = t1; a0 = a1;
  }
  return lista;
}

/* Alturas del Sol que marcan cada momento:
   −0,833° es la puesta "oficial": el borde superior toca el horizonte
   (radio del Sol 0,27° + refracción atmosférica 0,57°). */
export const UMBRALES_SOL = { puesta: -0.833, civil: -6, nautico: -12, astronomico: -18 };

/**
 * Todos los sucesos de la noche que empieza el día de `mediodia`
 * (de ese mediodía al siguiente). Las claves que no ocurran quedan en null
 * (p. ej. en latitudes altas en verano no hay noche astronómica).
 */
export function sucesosNoche(mediodia, lat, lon) {
  const fin = new Date(mediodia.getTime() + MS_DIA);
  const sol = (t) => alturaSol(t, lat, lon);
  const primero = (lista, tipo) => lista.find((c) => c.tipo === tipo)?.fecha || null;

  const r = {};
  for (const [clave, umbral] of Object.entries(UMBRALES_SOL)) {
    const c = cruces(sol, mediodia, fin, umbral);
    r[clave] = { inicio: primero(c, 'baja'), fin: primero(c, 'sube') };
  }
  // Luna: el mismo criterio de borde superior con refracción (−0,833°) sobre la altura topocéntrica
  const luna = (t) => alturaLuna(t, lat, lon);
  const cl = cruces(luna, mediodia, fin, -0.833);
  r.luna = { sale: primero(cl, 'sube'), sePone: primero(cl, 'baja'), arribaAlEmpezar: luna(mediodia) > -0.833 };
  return r;
}

/**
 * Muestras de una función de altura a lo largo de un intervalo (para dibujar
 * curvas y contar tiempo útil). Devuelve [{ t (ms), alt }].
 */
export function muestrear(altura, inicio, fin, pasoMin = 10) {
  const puntos = [];
  for (let t = inicio.getTime(); t <= fin.getTime(); t += pasoMin * 60000) {
    puntos.push({ t, alt: altura(new Date(t)) });
  }
  return puntos;
}
