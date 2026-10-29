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

/* ---------- Planetas ----------
   Elementos orbitales keplerianos aproximados del JPL (E. M. Standish,
   "Keplerian Elements for Approximate Positions of the Major Planets"),
   válidos de 1800 a 2050 con errores de minutos de arco.
   Para cada planeta: [valor en J2000, variación por siglo] de
     a  semieje mayor (UA)            e  excentricidad
     I  inclinación (°)               L  longitud media (°)
     w  longitud del perihelio (°)    O  longitud del nodo ascendente (°)
   "tierra" es en realidad el baricentro Tierra-Luna: de sobra para esto. */
const ELEMENTOS = {
  mercurio: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.25032350, 149472.67411175], w: [77.45779628, 0.16047689], O: [48.33076593, -0.12534081] },
  venus:    { a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], I: [3.39467605, -0.00078890], L: [181.97909950, 58517.81538729], w: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418] },
  tierra:   { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], w: [102.93768193, 0.32327364], O: [0, 0] },
  marte:    { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], w: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
  jupiter:  { a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], w: [14.72847983, 0.21252668], O: [100.47390909, 0.20469106] },
  saturno:  { a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], w: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794] },
  urano:    { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], w: [170.95427630, 0.40805281], O: [74.01692503, 0.04240589] },
  neptuno:  { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], w: [44.96476227, -0.32241464], O: [131.78422574, -0.00508664] },
};

/* Diámetro aparente a 1 UA (″) y fórmula de magnitud de Müller (Meeus, cap. 41):
   m = m0 + 5·log10(r·Δ) + c1·i + c2·i² + c3·i³, con i el ángulo de fase en grados.
   (Para Saturno se ignora el brillo de los anillos: el valor real puede ser algo mejor.) */
const FISICOS = {
  mercurio: { d1: 6.74, m: [-0.42, 0.0380, -0.000273, 0.000002] },
  venus:    { d1: 16.92, m: [-4.40, 0.0009, 0.000239, -0.00000065] },
  marte:    { d1: 9.36, m: [-1.52, 0.016, 0, 0] },
  jupiter:  { d1: 196.94, m: [-9.40, 0.005, 0, 0] },
  saturno:  { d1: 165.6, m: [-8.88, 0, 0, 0] },
  urano:    { d1: 65.8, m: [-7.19, 0, 0, 0] },
  neptuno:  { d1: 62.2, m: [-6.87, 0, 0, 0] },
};
export const PLANETAS = Object.keys(FISICOS);

/** Posición heliocéntrica eclíptica (UA) resolviendo la ecuación de Kepler */
function heliocentrica(nombre, T) {
  const el = ELEMENTOS[nombre];
  const v = (k) => el[k][0] + el[k][1] * T;
  const a = v('a'), e = v('e'), I = v('I'), L = v('L'), w = v('w'), O = v('O');
  const omega = w - O;                                   // argumento del perihelio
  const M = norm180(L - w) * RAD;                        // anomalía media (rad)
  // Ecuación de Kepler: E − e·sen E = M. Se resuelve por aproximaciones sucesivas (Newton)
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  // Coordenadas en el plano de la órbita
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  // Girar al plano de la eclíptica (tres giros: ω, I y Ω)
  const co = cos(omega), so = sin(omega), cO = cos(O), sO = sin(O), cI = cos(I), sI = sin(I);
  return {
    x: (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    y: (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    z: (so * sI) * xp + (co * sI) * yp,
  };
}

/**
 * Posición geocéntrica de un planeta: ra, dec (J2000, grados), distancia a la
 * Tierra Δ y al Sol r (UA), elongación respecto al Sol (°), magnitud y
 * diámetro aparente (″).
 */
export function posicionPlaneta(nombre, fecha) {
  const T = (diaJuliano(fecha) - 2451545.0) / 36525;
  const p = heliocentrica(nombre, T);
  const t = heliocentrica('tierra', T);
  const g = { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z };           // de la Tierra al planeta
  const delta = Math.hypot(g.x, g.y, g.z);
  const r = Math.hypot(p.x, p.y, p.z);
  const R = Math.hypot(t.x, t.y, t.z);
  // De eclípticas a ecuatoriales (oblicuidad J2000)
  const eps = 23.43928;
  const X = g.x, Y = g.y * cos(eps) - g.z * sin(eps), Z = g.y * sin(eps) + g.z * cos(eps);
  // Elongación (ángulo Sol–Tierra–planeta) y ángulo de fase (Sol–planeta–Tierra), por el teorema del coseno
  const elongacion = Math.acos((R * R + delta * delta - r * r) / (2 * R * delta)) * DEG;
  const fase = Math.acos(Math.min(1, Math.max(-1, (r * r + delta * delta - R * R) / (2 * r * delta)))) * DEG;
  const [m0, c1, c2, c3] = FISICOS[nombre].m;
  return {
    ra: norm360(Math.atan2(Y, X) * DEG),
    dec: Math.asin(Z / delta) * DEG,
    distancia: delta, r, elongacion,
    magnitud: m0 + 5 * Math.log10(r * delta) + c1 * fase + c2 * fase ** 2 + c3 * fase ** 3,
    diametro: FISICOS[nombre].d1 / delta,
  };
}

/**
 * Mejor momento de un planeta a partir de `desde`:
 *  · exteriores (Marte a Neptuno): la OPOSICIÓN, cuando está enfrente del Sol
 *    (elongación máxima, ≈ 180°): más cerca, más brillante y visible toda la noche.
 *  · interiores (Mercurio y Venus): la MÁXIMA ELONGACIÓN, su mayor separación del
 *    Sol; «vespertina» si está al este del Sol (se ve al anochecer) o «matutina».
 * Se busca día a día (precisión ±1 día) hasta 900 días.
 */
export function mejorMomentoPlaneta(nombre, desde) {
  const interior = nombre === 'mercurio' || nombre === 'venus';
  let previa = posicionPlaneta(nombre, desde).elongacion;
  let subiendo = false;
  for (let d = 1; d <= 900; d++) {
    const t = new Date(desde.getTime() + d * MS_DIA);
    const e = posicionPlaneta(nombre, t).elongacion;
    if (e < previa && subiendo && (interior || previa > 150)) {
      const fecha = new Date(t.getTime() - MS_DIA);
      const p = posicionPlaneta(nombre, fecha), s = posicionSol(fecha);
      return {
        fecha, elongacion: previa,
        tipo: interior ? (norm180(p.ra - s.ra) > 0 ? 'máxima elongación vespertina' : 'máxima elongación matutina') : 'oposición',
      };
    }
    subiendo = e > previa;
    previa = e;
  }
  return null;
}
