/* ==========================================================================
   calculos/eclipses.js — Eclipses de Sol a partir de los elementos besselianos
   --------------------------------------------------------------------------
   La idea de Bessel (1824) es mirar el eclipse desde el Sol: se toma un plano
   que pasa por el centro de la Tierra y es perpendicular al eje de la sombra
   de la Luna (el «plano fundamental»). En él, la sombra son dos círculos que
   se mueven casi en línea recta:
     · x, y   posición del eje de la sombra, en radios terrestres
     · l1, l2 radios de la penumbra y de la umbra en ese plano
              (l2 < 0 quiere decir que el vértice del cono de la umbra queda
              más allá: eclipse total; l2 > 0, anular)
     · d, μ   declinación y ángulo horario en Greenwich del eje: dicen cómo
              está girada la Tierra respecto a la sombra
     · tan f1, tan f2  abertura de los conos (la sombra se ensancha o estrecha
              un poquito según la altura del observador)
   La NASA publica estos valores como polinomios en el tiempo; con ellos todo
   se reduce a geometría plana más el giro de la Tierra.

   Referencias: Explanatory Supplement to the Astronomical Almanac (cap. 9) y
   J. Meeus, «Elements of Solar Eclipses». Datos: «Eclipse Predictions by Fred
   Espenak, NASA's GSFC» (data/eclipses.json).
   ========================================================================== */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const E2 = 0.00669438;                 // excentricidad² del elipsoide terrestre (WGS-84)
const RAIZ_1_E2 = Math.sqrt(1 - E2);   // = 0,99664719 = b/a
const RADIO_KM = 6378.137;

/* ---------- Elementos en un instante ---------- */

const poli = (c, t) => c.reduce((s, a, i) => s + a * t ** i, 0);
const dpoli = (c, t) => c.reduce((s, a, i) => (i ? s + i * a * t ** (i - 1) : s), 0);

/**
 * Elementos en t horas (TDT) desde t0. Las derivadas (′) van por hora; μ′ y d′
 * se pasan a radianes por hora porque se usan para velocidades en el plano.
 */
export function elementos(ec, t) {
  return {
    x: poli(ec.x, t), y: poli(ec.y, t), d: poli(ec.d, t), mu: poli(ec.mu, t),
    l1: poli(ec.l1, t), l2: poli(ec.l2, t),
    dx: dpoli(ec.x, t), dy: dpoli(ec.y, t),
    dd: dpoli(ec.d, t) * RAD, dmu: dpoli(ec.mu, t) * RAD,
    tanf1: ec.tanf1, tanf2: ec.tanf2,
  };
}

/** Instante (Date) de t horas TDT desde t0, ya en tiempo universal */
export function instante(ec, t) {
  const [a, m, d] = ec.fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) + ((ec.t0 + t) * 3600 - ec.deltaT) * 1000);
}
/** El inverso: t (horas desde t0) de un instante */
export function horasDesdeT0(ec, fecha) {
  const [a, m, d] = ec.fecha.split('-').map(Number);
  return ((fecha.getTime() - Date.UTC(a, m - 1, d)) / 1000 + ec.deltaT) / 3600 - ec.t0;
}

/* ---------- Del observador al plano fundamental y vuelta ---------- */

/**
 * Coordenadas del observador (lat, lon en grados, este positivo) en el plano
 * fundamental: ξ, η en el plano y ζ a lo largo del eje (≈ seno de la altura
 * del Sol). Y sus velocidades por el giro de la Tierra.
 */
function observador(lat, lon, el, deltaT) {
  const u = Math.atan(RAIZ_1_E2 * Math.tan(lat * RAD));     // latitud reducida
  const rs = RAIZ_1_E2 * Math.sin(u), rc = Math.cos(u);      // ρ·sen φ′, ρ·cos φ′
  const H = (el.mu + lon - 0.00417807 * deltaT) * RAD;      // ángulo horario del eje visto desde aquí
  const sd = Math.sin(el.d * RAD), cd = Math.cos(el.d * RAD);
  const xi = rc * Math.sin(H);
  const eta = rs * cd - rc * Math.cos(H) * sd;
  const zeta = rs * sd + rc * Math.cos(H) * cd;
  return {
    xi, eta, zeta,
    dxi: el.dmu * rc * Math.cos(H),
    deta: el.dmu * xi * sd - zeta * el.dd,
  };
}

/**
 * Punto (ξ, η) del plano fundamental → lugar de la Tierra (lat, lon) bajo él,
 * en el hemisferio que mira al Sol. null si el punto cae fuera del disco.
 */
export function planoATierra(xi, eta, el, deltaT) {
  const d = el.d * RAD;
  const rho1 = Math.sqrt(1 - E2 * Math.cos(d) ** 2);
  const eta1 = eta / rho1;
  const z2 = 1 - xi * xi - eta1 * eta1;
  if (z2 < 0) return null;
  const zeta1 = Math.sqrt(z2);
  const sd1 = Math.sin(d) / rho1, cd1 = RAIZ_1_E2 * Math.cos(d) / rho1;
  const phi1 = Math.asin(eta1 * cd1 + zeta1 * sd1);
  const H = Math.atan2(xi, zeta1 * cd1 - eta1 * sd1) * DEG;
  const lat = Math.atan(Math.tan(phi1) / RAIZ_1_E2) * DEG;
  let lon = H - el.mu + 0.00417807 * deltaT;
  lon = ((lon + 540) % 360) - 180;
  return { lat, lon, zeta: zeta1 };
}

/* ---------- Circunstancias locales ---------- */

/** Fracción del ÁREA del Sol tapada: círculos de radio 1 (Sol) y k (Luna) a distancia s */
export function oscurecimiento(s, k) {
  if (s >= 1 + k) return 0;
  if (s <= Math.abs(k - 1)) return k >= 1 ? 1 : k * k;     // total, o anular (la Luna entera dentro)
  const a = Math.acos((s * s + 1 - k * k) / (2 * s));
  const b = Math.acos((s * s + k * k - 1) / (2 * s * k));
  const area = a + k * k * b - 0.5 * Math.sqrt((-s + 1 + k) * (s + 1 - k) * (s - 1 + k) * (s + 1 + k));
  return area / Math.PI;
}

/**
 * Cómo se ve el eclipse desde (lat, lon). Busca por iteración el instante en
 * que el observador está más cerca del eje de la sombra (en el plano
 * fundamental el movimiento es casi rectilíneo, así que converge en 2–3 pasos).
 * Devuelve null si allí no hay eclipse. Si lo hay:
 *   tipo        'total' | 'anular' | 'parcial'
 *   magnitud    fracción del DIÁMETRO solar cubierto; en la totalidad o la
 *               anularidad, como hace la NASA, la razón de diámetros Luna/Sol
 *               (> 1 total, < 1 anular)
 *   oscurecimiento  fracción del ÁREA
 *   maximo, c1, c2, c3, c4  instantes (Date): inicio y fin de la parcialidad (c1, c4)
 *               y de la totalidad o anularidad (c2, c3)
 *   duracion    segundos de totalidad o anularidad
 *   altura      altura del Sol en el máximo (°); si es < 0, no se ve
 */
export function circunstanciasLocales(ec, lat, lon) {
  let t = 0, el, o, u, v, a, b, n2;
  for (let i = 0; i < 12; i++) {
    el = elementos(ec, t);
    o = observador(lat, lon, el, ec.deltaT);
    u = el.x - o.xi; v = el.y - o.eta;
    a = el.dx - o.dxi; b = el.dy - o.deta;
    n2 = a * a + b * b;
    const tau = -(u * a + v * b) / n2;
    t += tau;
    if (t < -5 || t > 5) return null;
    if (Math.abs(tau) < 1e-6) break;
  }
  el = elementos(ec, t);
  o = observador(lat, lon, el, ec.deltaT);
  u = el.x - o.xi; v = el.y - o.eta;
  const m = Math.hypot(u, v), n = Math.sqrt(n2);
  const L1 = el.l1 - o.zeta * el.tanf1;
  const L2 = el.l2 - o.zeta * el.tanf2;
  if (m >= L1) return null;
  const k = (L1 - L2) / (L1 + L2);                  // diámetro de la Luna ÷ el del Sol
  const s = (2 * m) / (L1 + L2);                    // separación de centros, en radios solares
  const semiParcial = Math.sqrt(L1 * L1 - m * m) / n;           // horas
  const central = m < Math.abs(L2);
  const magnitud = central ? k : (L1 - m) / (L1 + L2);
  const semiCentral = central ? Math.sqrt(L2 * L2 - m * m) / n : 0;
  return {
    tipo: central ? (L2 < 0 ? 'total' : 'anular') : 'parcial',
    magnitud, oscurecimiento: oscurecimiento(s, k),
    maximo: instante(ec, t),
    c1: instante(ec, t - semiParcial), c4: instante(ec, t + semiParcial),
    c2: central ? instante(ec, t - semiCentral) : null,
    c3: central ? instante(ec, t + semiCentral) : null,
    duracion: semiCentral * 2 * 3600,
    altura: Math.asin(Math.max(-1, Math.min(1, o.zeta))) * DEG,
  };
}

/* ---------- La franja: línea central y límites ---------- */

/** Velocidad del eje respecto al suelo en un punto (ξ, η, ζ) del plano: (a, b) */
function velocidadRelativa(el, xi, eta, zeta) {
  const sd = Math.sin(el.d * RAD), cd = Math.cos(el.d * RAD);
  return { a: el.dx - el.dmu * (zeta * cd - eta * sd), b: el.dy - el.dmu * xi * sd };
}

/**
 * Los dos puntos del borde de una sombra (umbra si cual = 2, penumbra si 1) a
 * cada lado de su avance en el instante t. El borde de la franja es la
 * «envolvente» de todos los círculos de sombra: en cada instante, los puntos
 * del círculo perpendiculares a la dirección en que la sombra se mueve sobre
 * el suelo. Se itera porque el radio depende de ζ (de la altura del Sol allí).
 */
function bordes(ec, el, cual) {
  const l = cual === 2 ? el.l2 : el.l1, tf = cual === 2 ? el.tanf2 : el.tanf1;
  return [1, -1].map((lado) => {
    let zeta = Math.sqrt(Math.max(0, 1 - el.x * el.x - el.y * el.y));
    let xi = el.x, eta = el.y, p = null;
    for (let i = 0; i < 4; i++) {
      const { a, b } = velocidadRelativa(el, xi, eta, zeta);
      const n = Math.hypot(a, b);
      const L = Math.abs(l - zeta * tf);
      xi = el.x - lado * L * b / n;
      eta = el.y + lado * L * a / n;
      p = planoATierra(xi, eta, el, ec.deltaT);
      if (!p) return null;
      zeta = p.zeta;
    }
    return p;
  });
}

/**
 * Recorre el eclipse minuto a minuto y devuelve:
 *   central   tramos de la línea central  [[{lat, lon, t, fecha, tipo}], …]
 *   norte, sur  tramos de los límites de la umbra (franja de totalidad/anularidad)
 *   penNorte, penSur  límites de la penumbra (hasta dónde llega el eclipse parcial)
 *   banda     tramos de pares {n, s, tipo} (los dos bordes en el mismo instante):
 *             con ellos se rellena la franja como un polígono
 * Un tramo se corta cuando la línea sale del disco terrestre.
 */
export function franja(ec, paso = 1 / 60) {
  const r = { central: [], norte: [], sur: [], penNorte: [], penSur: [], banda: [] };
  const abiertos = {};
  const anadir = (clave, p) => {
    if (!p) { abiertos[clave] = null; return; }
    if (!abiertos[clave]) { abiertos[clave] = []; r[clave].push(abiertos[clave]); }
    abiertos[clave].push(p);
  };
  for (let t = -3.6; t <= 3.6 + 1e-9; t += paso) {
    const el = elementos(ec, t);
    const fecha = instante(ec, t);
    const c = planoATierra(el.x, el.y, el, ec.deltaT);
    const L2c = c ? el.l2 - c.zeta * el.tanf2 : 0;
    anadir('central', c && { ...c, t, fecha, tipo: L2c < 0 ? 'total' : 'anular' });
    // Cada borde se sigue siempre por el MISMO lado del avance de la sombra (si se
    // decidiera «norte» por la latitud, se cruzarían donde la franja va de norte a sur)
    if (c) {
      const [p, q] = bordes(ec, el, 2);
      anadir('norte', p); anadir('sur', q);
      anadir('banda', p && q ? { n: p, s: q, tipo: L2c < 0 ? 'total' : 'anular' } : null);
    } else { anadir('norte', null); anadir('sur', null); anadir('banda', null); }
    const [pp, pq] = bordes(ec, el, 1);
    anadir('penNorte', pp); anadir('penSur', pq);
  }
  for (const k of Object.keys(r)) r[k] = r[k].filter((tramo) => tramo.length > 1);
  // Al final, se llama «norte» al borde que de media queda más al norte
  const media = (tramos) => { const v = tramos.flat(); return v.reduce((a, p) => a + p.lat, 0) / (v.length || 1); };
  if (media(r.norte) < media(r.sur)) [r.norte, r.sur] = [r.sur, r.norte];
  if (media(r.penNorte) < media(r.penSur)) [r.penNorte, r.penSur] = [r.penSur, r.penNorte];
  return r;
}

/** Distancia en km entre dos puntos de la Tierra (fórmula del haversine sobre la esfera) */
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const dlat = (lat2 - lat1) * RAD, dlon = (lon2 - lon1) * RAD;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dlon / 2) ** 2;
  return 2 * 6371.0 * Math.asin(Math.sqrt(h));
}

/** Anchura de la franja en el instante t (km): distancia entre sus dos bordes */
export function anchuraFranja(ec, t) {
  const el = elementos(ec, t);
  const b = bordes(ec, el, 2);
  if (!b[0] || !b[1]) return null;
  return distanciaKm(b[0].lat, b[0].lon, b[1].lat, b[1].lon);
}

/**
 * Magnitud del eclipse en una rejilla de toda la Tierra (paso en grados):
 * Float32Array de filas de norte a sur (lat 90 → −90) y columnas de oeste a
 * este (lon −180 → 180). 0 donde no hay eclipse o el Sol está bajo el horizonte.
 */
export function rejillaMagnitud(ec, paso = 1) {
  const ancho = Math.round(360 / paso), alto = Math.round(180 / paso);
  const datos = new Float32Array(ancho * alto);
  for (let j = 0; j < alto; j++) {
    const lat = 90 - (j + 0.5) * paso;
    for (let i = 0; i < ancho; i++) {
      const lon = -180 + (i + 0.5) * paso;
      const c = circunstanciasLocales(ec, lat, lon);
      datos[j * ancho + i] = c && c.altura > -1 ? Math.max(0, c.magnitud) : 0;
    }
  }
  return { ancho, alto, paso, datos };
}

/** Punto de la línea central más cercano a (lat, lon), con su distancia en km */
export function puntoCentralMasCercano(fr, lat, lon) {
  let mejor = null;
  for (const tramo of fr.central) {
    for (const p of tramo) {
      const d = distanciaKm(lat, lon, p.lat, p.lon);
      if (!mejor || d < mejor.distancia) mejor = { ...p, distancia: d };
    }
  }
  return mejor;
}

export { RADIO_KM };
