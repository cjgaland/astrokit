/* ==========================================================================
   calculos/efemerides.js — Sucesos del cielo (todo calculado en local)
   --------------------------------------------------------------------------
   Reúne en una sola lista, ordenada por fecha:
     · lluvias de meteoros (máximo, tasa real esperada según la Luna y el cielo)
     · Luna: fases, superlunas y acercamientos a planetas y estrellas brillantes
     · planetas: oposiciones, máximas elongaciones y conjunciones entre ellos
     · equinoccios, solsticios, perihelio y afelio de la Tierra
     · eclipses de Luna (Meeus, cap. 54) y de Sol (elementos de la NASA)
     · cometas: perihelio y mejor momento
   Funciones puras (sin DOM): las usan el módulo Efemérides, la Temporada del
   planificador, la portada, la Biblioteca, el mapa celeste y las pruebas.
   ========================================================================== */

import * as A from './astro.js';
import { circunstanciasLocales } from './eclipses.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const MS_DIA = 86400000;
const sin = (g) => Math.sin(g * RAD), cos = (g) => Math.cos(g * RAD);
const norm360 = (x) => ((x % 360) + 360) % 360;
const norm180 = (x) => { const y = norm360(x); return y > 180 ? y - 360 : y; };
const jdAFecha = (jd) => new Date((jd - 2440587.5) * MS_DIA);
/** ΔT (TT − UT) aproximado para 2020–2040, en segundos */
const DELTA_T = 69.5;

/* ==========================================================================
   Sol: longitud J2000 (la que usa la IMO para los máximos de las lluvias)
   ========================================================================== */
export function longitudSolarJ2000(fecha) {
  const T = (A.diaJuliano(fecha) - 2451545) / 36525;
  return norm360(A.posicionSol(fecha).lon - 1.3970 * T);   // se quita la precesión desde J2000
}

/** Instante del año `anio` en que el Sol alcanza la longitud J2000 `lambda` */
export function fechaLongitudSolar(lambda, anio) {
  // El Sol avanza ~0,9856° al día y está en λ = 0 hacia el 20 de marzo
  let t = Date.UTC(anio, 2, 20, 12) + (norm360(lambda) / 0.985647) * MS_DIA;
  if (new Date(t).getUTCFullYear() > anio) t -= 365.2422 * MS_DIA;
  for (let i = 0; i < 5; i++) t += (norm180(lambda - longitudSolarJ2000(new Date(t))) / 0.985647) * MS_DIA;
  return new Date(t);
}

/* ==========================================================================
   Lluvias de meteoros
   ========================================================================== */

/** Mediodía local (del dispositivo) que abre la noche en que cae `fecha` */
function mediodiaDeLaNoche(fecha) {
  const m = new Date(fecha); m.setHours(12, 0, 0, 0);
  if (fecha < m) m.setDate(m.getDate() - 1);
  return m;
}

/**
 * Cómo se verá una lluvia la noche de su máximo desde `lugar`.
 * Tasa horaria observada (la cuenta de la IMO):
 *     HR = THZ · sen(h) · r^(LM − 6,5)
 * h = altura del radiante, r = índice de población, LM = magnitud límite del
 * cielo. La Luna aclara el cielo y resta magnitud límite: más cuanto más
 * llena y más alta esté, y más en un cielo oscuro (en la ciudad ya está claro).
 * Devuelve las tasas máximas para cielos de magnitud 4, 5 y 6, la hora mejor,
 * la Luna y la calidad del año ('buena' | 'regular' | 'mala').
 */
export function nocheDeLluvia(lluvia, pico, lugar) {
  const mediodia = mediodiaDeLaNoche(pico);
  const s = A.sucesosNoche(mediodia, lugar.lat, lugar.lon);
  const ini = s.astronomico.inicio || s.nautico.inicio || s.puesta.inicio;
  const fin = s.astronomico.fin || s.nautico.fin || s.puesta.fin;
  const tasas = { 4: 0, 5: 0, 6: 0 };
  let sinLuna = 0, mejor = null, alturaMax = 0;
  if (ini && fin) {
    for (let t = ini.getTime(); t <= fin.getTime(); t += 10 * 60000) {
      const f = new Date(t);
      const h = A.altAz(lluvia.ar, lluvia.dec, lugar.lat, lugar.lon, f).alt;
      if (h <= 0) continue;
      alturaMax = Math.max(alturaMax, h);
      const altLuna = A.alturaLuna(f, lugar.lat, lugar.lon);
      const ilum = A.faseLunar(f).iluminada;
      const penal = altLuna > 0 ? 2.2 * ilum * Math.sqrt(sin(altLuna)) : 0;
      for (const LM of [4, 5, 6]) {
        const lmEf = Math.max(2.5, LM - penal * (LM - 3) / 3);
        const hr = lluvia.thz * sin(h) * lluvia.r ** (lmEf - 6.5);
        if (hr > tasas[LM]) { tasas[LM] = hr; if (LM === 6) mejor = f; }
      }
      sinLuna = Math.max(sinLuna, lluvia.thz * sin(h) * lluvia.r ** (6 - 6.5));
    }
  }
  const razon = sinLuna ? tasas[6] / sinLuna : 0;
  return {
    tasas, mejorHora: mejor, alturaRadiante: alturaMax,
    iluminacion: A.faseLunar(pico).iluminada,
    calidad: !sinLuna ? 'mala' : razon > 0.7 ? 'buena' : razon > 0.35 ? 'regular' : 'mala',
  };
}

/** ¿Está activa la lluvia en esta fecha? (según su periodo de actividad 'MM-DD') */
export function lluviaActiva(lluvia, fecha) {
  const md = (fecha.getMonth() + 1) * 100 + fecha.getDate();
  const [a, b] = lluvia.actividad.map((s) => { const [m, d] = s.split('-').map(Number); return m * 100 + d; });
  return a <= b ? md >= a && md <= b : md >= a || md <= b;
}

/** Máximos de cada lluvia entre dos fechas */
export function maximosLluvias(lluvias, desde, hasta) {
  const lista = [];
  for (let anio = desde.getFullYear() - 1; anio <= hasta.getFullYear() + 1; anio++) {
    for (const l of lluvias) {
      const pico = fechaLongitudSolar(l.lambda, anio);
      if (pico >= desde && pico <= hasta) lista.push({ lluvia: l, pico });
    }
  }
  return lista.sort((a, b) => a.pico - b.pico);
}

/* ==========================================================================
   Búsqueda de mínimos (para conjunciones y acercamientos)
   ========================================================================== */
/** Mínimos locales de f(t) por debajo de `limite`, recorriendo de `paso` en `paso` ms y afinando */
function minimos(f, desde, hasta, paso, limite) {
  const res = [];
  let t0 = desde.getTime(), f0 = f(t0), t1 = t0 + paso, f1 = f(t1);
  for (let t2 = t1 + paso; t2 <= hasta.getTime(); t2 += paso) {
    const f2 = f(t2);
    if (f1 < f0 && f1 <= f2 && f1 < limite) {
      // Afinado por sección áurea en [t0, t2]
      let a = t0, b = t2;
      for (let i = 0; i < 30; i++) {
        const c = b - (b - a) / 1.618, d = a + (b - a) / 1.618;
        if (f(c) < f(d)) b = d; else a = c;
      }
      const t = (a + b) / 2;
      res.push({ fecha: new Date(t), valor: f(t) });
    }
    t0 = t1; f0 = f1; t1 = t2; f1 = f2;
  }
  return res;
}

/* ==========================================================================
   Eclipses de Luna — Meeus, «Astronomical Algorithms», cap. 54
   --------------------------------------------------------------------------
   Para cada Luna llena se calcula γ (distancia mínima del centro de la Luna al
   eje de la sombra de la Tierra, en radios terrestres) y u (radio de la umbra
   en el plano de la Luna). Con ellos salen las magnitudes y las duraciones.
   ========================================================================== */
export function eclipsesLuna(desde, hasta) {
  const lista = [];
  const anioDec = desde.getUTCFullYear() + desde.getUTCMonth() / 12;
  for (let k = Math.floor((anioDec - 2000) * 12.3685) - 1; ; k++) {
    const kk = k + 0.5;                                        // + 0,5 = Luna llena
    const T = kk / 1236.85;
    let jde = 2451550.09766 + 29.530588861 * kk + 0.00015437 * T * T - 0.000000150 * T ** 3 + 0.00000000073 * T ** 4;
    if (jdAFecha(jde) > new Date(hasta.getTime() + MS_DIA)) break;
    const M = 2.5534 + 29.10535670 * kk - 0.0000014 * T * T - 0.00000011 * T ** 3;
    const Mp = 201.5643 + 385.81693528 * kk + 0.0107582 * T * T + 0.00001238 * T ** 3 - 0.000000058 * T ** 4;
    const F = 160.7108 + 390.67050284 * kk - 0.0016118 * T * T - 0.00000227 * T ** 3 + 0.000000011 * T ** 4;
    const Om = 124.7746 - 1.56375588 * kk + 0.0020672 * T * T + 0.00000215 * T ** 3;
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    if (Math.abs(sin(F)) > 0.36) continue;                     // la Luna pasa lejos del nodo: no hay eclipse
    const F1 = F - 0.02665 * sin(Om);
    const A1 = 299.77 + 0.107408 * kk - 0.009173 * T * T;
    jde += -0.4065 * sin(Mp) + 0.1727 * E * sin(M) + 0.0161 * sin(2 * Mp) - 0.0097 * sin(2 * F1)
      + 0.0073 * E * sin(Mp - M) - 0.0050 * E * sin(Mp + M) - 0.0023 * sin(Mp - 2 * F1) + 0.0021 * E * sin(2 * M)
      + 0.0012 * sin(Mp + 2 * F1) + 0.0006 * E * sin(2 * Mp + M) - 0.0004 * sin(3 * Mp) - 0.0003 * E * sin(M + 2 * F1)
      + 0.0003 * sin(A1) - 0.0002 * E * sin(M - 2 * F1) - 0.0002 * E * sin(2 * Mp - M) - 0.0002 * sin(Om);
    const P = 0.2070 * E * sin(M) + 0.0024 * E * sin(2 * M) - 0.0392 * sin(Mp) + 0.0116 * sin(2 * Mp)
      - 0.0073 * E * sin(Mp + M) + 0.0067 * E * sin(Mp - M) + 0.0118 * sin(2 * F1);
    const Q = 5.2207 - 0.0048 * E * cos(M) + 0.0020 * E * cos(2 * M) - 0.3299 * cos(Mp)
      - 0.0060 * E * cos(Mp + M) + 0.0041 * E * cos(Mp - M);
    const gamma = (P * cos(F1) + Q * sin(F1)) * (1 - 0.0048 * Math.abs(cos(F1)));
    const u = 0.0059 + 0.0046 * E * cos(M) - 0.0182 * cos(Mp) + 0.0004 * cos(2 * Mp) - 0.0005 * cos(M + Mp);
    const magPenumbral = (1.5573 + u - Math.abs(gamma)) / 0.5450;
    const magUmbral = (1.0128 - u - Math.abs(gamma)) / 0.5450;
    if (magPenumbral <= 0) continue;
    const n = 0.5458 + 0.0400 * cos(Mp);
    const semi = (x) => (x * x > gamma * gamma ? (60 / n) * Math.sqrt(x * x - gamma * gamma) : 0);   // minutos
    const maximo = new Date(jdAFecha(jde).getTime() - DELTA_T * 1000);
    if (maximo < desde || maximo > hasta) continue;
    const mas = (min) => new Date(maximo.getTime() + min * 60000);
    const sP = semi(1.5573 + u), sU = semi(1.0128 - u), sT = semi(0.4678 - u);
    lista.push({
      id: `luna-${maximo.toISOString().slice(0, 10)}`,
      tipo: magUmbral >= 1 ? 'total' : magUmbral > 0 ? 'parcial' : 'penumbral',
      maximo, gamma, magPenumbral, magUmbral,
      p1: mas(-sP), p4: mas(sP),
      u1: sU ? mas(-sU) : null, u4: sU ? mas(sU) : null,
      u2: sT ? mas(-sT) : null, u3: sT ? mas(sT) : null,
      duracionTotal: 2 * sT, duracionParcial: 2 * sU,
    });
  }
  return lista;
}

/** Altura de la Luna (geocéntrica, °) en (lat, lon) en un instante: para la visibilidad de un eclipse lunar */
export function alturaLunaEn(fecha, lat, lon) {
  const l = A.posicionLuna(fecha);
  return A.altAz(l.ra, l.dec, lat, lon, fecha).alt;
}

/** Cómo se ve un eclipse de Luna desde un lugar: altura de la Luna en cada contacto */
export function visibilidadEclipseLuna(ec, lat, lon) {
  const contactos = ['p1', 'u1', 'u2', 'maximo', 'u3', 'u4', 'p4'].filter((k) => ec[k]);
  const alturas = Object.fromEntries(contactos.map((k) => [k, alturaLunaEn(ec[k], lat, lon) - 0.95 * cos(alturaLunaEn(ec[k], lat, lon))]));
  const ini = ec.u1 ? 'u1' : 'p1', fin = ec.u4 ? 'u4' : 'p4';
  const visible = contactos.filter((k) => alturas[k] > 0);
  return {
    alturas,
    resumen: alturas[ini] > 0 && alturas[fin] > 0 ? 'entero'
      : visible.length ? (alturas.maximo > 0 ? 'en parte (con el máximo)' : 'en parte') : 'no visible',
  };
}

/* ==========================================================================
   Cometas: posición resolviendo la órbita (elíptica, casi parabólica o hiperbólica)
   ========================================================================== */
const K_GAUSS = 0.01720209895;                   // constante de Gauss (rad/día): √(GM☉) en UA y días

/** Posición heliocéntrica eclíptica J2000 (UA) de un cometa en una fecha */
function heliocentricaCometa(c, fecha) {
  const dt = A.diaJuliano(fecha) - c.tp;          // días desde el perihelio (se ignora TDB − UT: ~1 min)
  const { q, e } = c;
  let xp, yp;
  if (Math.abs(e - 1) < 1e-3) {
    // Casi parabólica: ecuación de Barker, s³ + 3s − W = 0 con s = tan(v/2)
    const W = (3 * K_GAUSS / Math.sqrt(2 * q ** 3)) * dt;
    const Y = Math.cbrt(W / 2 + Math.sqrt(W * W / 4 + 1));
    const s = Y - 1 / Y;
    const v = 2 * Math.atan(s), r = q * (1 + s * s);
    xp = r * Math.cos(v); yp = r * Math.sin(v);
  } else if (e < 1) {
    const a = q / (1 - e);
    const M = (K_GAUSS / a ** 1.5) * dt;
    let E = M + e * Math.sin(M);
    for (let i = 0; i < 30; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    xp = a * (Math.cos(E) - e); yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  } else {
    const a = q / (e - 1);
    const M = (K_GAUSS / a ** 1.5) * dt;
    let H = Math.asinh(M / e);
    for (let i = 0; i < 50; i++) H -= (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    xp = a * (e - Math.cosh(H)); yp = a * Math.sqrt(e * e - 1) * Math.sinh(H);
  }
  const co = cos(c.w), so = sin(c.w), cO = cos(c.om), sO = sin(c.om), cI = cos(c.i), sI = sin(c.i);
  return {
    x: (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    y: (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    z: (so * sI) * xp + (co * sI) * yp,
  };
}

/**
 * Posición de un cometa vista desde la Tierra: ra, dec (J2000), r (al Sol),
 * Δ (a la Tierra), elongación respecto al Sol y magnitud total estimada
 * m = M1 + 5·log Δ + K1·log r.
 */
export function posicionCometa(c, fecha) {
  const p = heliocentricaCometa(c, fecha), t = A.posicionTierra(fecha);
  const g = { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z };
  const delta = Math.hypot(g.x, g.y, g.z), r = Math.hypot(p.x, p.y, p.z), R = Math.hypot(t.x, t.y, t.z);
  const eps = 23.43928;
  const X = g.x, Y = g.y * cos(eps) - g.z * sin(eps), Z = g.y * sin(eps) + g.z * cos(eps);
  return {
    ra: norm360(Math.atan2(Y, X) * DEG), dec: Math.asin(Z / delta) * DEG,
    r, distancia: delta,
    elongacion: Math.acos(Math.max(-1, Math.min(1, (R * R + delta * delta - r * r) / (2 * R * delta)))) * DEG,
    magnitud: c.M1 + 5 * Math.log10(delta) + c.K1 * Math.log10(r),
  };
}

/** Perihelio y mejor momento (más brillante con al menos 30° de separación del Sol) en ±200 días */
export function mejorMomentoCometa(c) {
  const perihelio = jdAFecha(c.tp);
  let mejor = null;
  for (let d = -200; d <= 200; d += 2) {
    const f = new Date(perihelio.getTime() + d * MS_DIA);
    const p = posicionCometa(c, f);
    if (p.elongacion < 30) continue;
    if (!mejor || p.magnitud < mejor.magnitud) mejor = { fecha: f, ...p };
  }
  return { perihelio, mejor };
}

/* ==========================================================================
   Lista de sucesos
   ========================================================================== */
const PLANETAS_OJO = ['mercurio', 'venus', 'marte', 'jupiter', 'saturno'];
export const NOMBRE_PLANETA = { mercurio: 'Mercurio', venus: 'Venus', marte: 'Marte', jupiter: 'Júpiter', saturno: 'Saturno', urano: 'Urano', neptuno: 'Neptuno' };
const ESTRELLAS_ECLIPTICA = [
  { id: 'pleyades', nombre: 'las Pléyades', ra: 56.75, dec: 24.12 },
  { id: 'aldebaran', nombre: 'Aldebarán', ra: 68.98, dec: 16.51 },
  { id: 'regulo', nombre: 'Régulo', ra: 152.09, dec: 11.97 },
  { id: 'espiga', nombre: 'Espiga', ra: 201.30, dec: -11.16 },
  { id: 'antares', nombre: 'Antares', ra: 247.35, dec: -26.43 },
];
const FASES = [
  { objetivo: 0, nombre: 'Luna nueva', imp: 1 }, { objetivo: 90, nombre: 'Cuarto creciente', imp: 0 },
  { objetivo: 180, nombre: 'Luna llena', imp: 1 }, { objetivo: 270, nombre: 'Cuarto menguante', imp: 0 },
];
export const CATEGORIAS = {
  eclipses: 'Eclipses', meteoros: 'Meteoros', luna: 'Luna', planetas: 'Planetas', cometas: 'Cometas', estaciones: 'Estaciones',
};
const grados = (x) => `${x.toLocaleString('es-ES', { maximumFractionDigits: 1 })}°`;
const pct = (x) => `${Math.round(x * 100)} %`;

/**
 * Todos los sucesos entre `desde` y `hasta` vistos desde `lugar` ({lat, lon}).
 * `datos` = { lluvias, cometas } (data/efemerides.json) y `eclipses` (data/eclipses.json).
 * Cada suceso: { id, categoria, tipo, fecha, titulo, texto, importancia (0–3), ref }.
 * Importancia: 3 imprescindible, 2 destacado, 1 interesante, 0 de calendario.
 */
export function calcularSucesos({ desde, hasta, lugar, lluvias = [], cometas = [], eclipses = [] }) {
  const s = [];
  const anadir = (e) => { if (e.fecha >= desde && e.fecha <= hasta) s.push(e); };

  // --- Eclipses de Sol (NASA) ---
  for (const ec of eclipses) {
    const [a, m, d] = ec.fecha.split('-').map(Number);
    const [h, mi, se] = ec.maxima.horaUT.split(':').map(Number);
    const fecha = new Date(Date.UTC(a, m - 1, d, h, mi, se));
    const local = circunstanciasLocales(ec, lugar.lat, lugar.lon);
    const visible = local && local.altura > 0;
    anadir({
      id: ec.id, categoria: 'eclipses', tipo: 'eclipse-sol', fecha, ref: ec.id,
      titulo: `Eclipse ${ec.tipo} de Sol`,
      texto: visible
        ? `Desde tu lugar: ${local.tipo === 'parcial' ? `parcial, ${pct(local.oscurecimiento)} del Sol tapado` : `¡${local.tipo}! ${Math.floor(local.duracion / 60)} min ${Math.round(local.duracion % 60)} s`}`
        : 'No se ve desde tu lugar (mira en el globo dónde ir)',
      importancia: visible ? 3 : 2,
    });
  }
  // --- Eclipses de Luna (Meeus) ---
  for (const ec of eclipsesLuna(desde, hasta)) {
    const vis = visibilidadEclipseLuna(ec, lugar.lat, lugar.lon);
    anadir({
      id: ec.id, categoria: 'eclipses', tipo: 'eclipse-luna', fecha: ec.maximo, ref: ec.id, eclipse: ec,
      titulo: `Eclipse ${ec.tipo} de Luna`,
      texto: `Magnitud ${ec.tipo === 'penumbral' ? ec.magPenumbral.toFixed(2) + ' (penumbral)' : ec.magUmbral.toFixed(2)} · desde tu lugar: ${vis.resumen}`,
      importancia: vis.resumen === 'no visible' ? 1 : ec.tipo === 'penumbral' ? 1 : 3,
    });
  }
  // --- Lluvias de meteoros ---
  for (const { lluvia: l, pico } of maximosLluvias(lluvias, desde, hasta)) {
    const n = nocheDeLluvia(l, pico, lugar);
    anadir({
      id: `${l.id}-${pico.getFullYear()}`, categoria: 'meteoros', tipo: 'lluvia', fecha: pico, ref: l.id, noche: n,
      titulo: `Máximo de las ${l.nombre}`,
      texto: `THZ ${l.thz} · Luna al ${pct(n.iluminacion)} · ${n.calidad === 'buena' ? 'buen año' : n.calidad === 'regular' ? 'año regular' : 'mal año'} · en campo oscuro ≈ ${Math.round(n.tasas[6])}/h`,
      importancia: l.thz >= 80 ? 3 : l.thz >= 15 ? 2 : 1,
    });
  }
  // --- Fases y superlunas ---
  for (const f of FASES) {
    let t = new Date(desde.getTime() - 2 * MS_DIA);
    for (let i = 0; i < 60; i++) {
      const fecha = A.proximaFase(t, f.objetivo);
      if (!fecha || fecha > hasta) break;
      const dist = A.distanciaLuna(fecha);
      const superluna = f.objetivo === 180 && dist < 360000;
      anadir({
        id: `fase-${f.objetivo}-${fecha.toISOString().slice(0, 13)}`, categoria: 'luna', tipo: superluna ? 'superluna' : 'fase', fecha,
        titulo: superluna ? 'Superluna llena' : f.nombre,
        texto: superluna ? `Luna llena muy cerca de la Tierra: ${Math.round(dist).toLocaleString('es-ES')} km` : f.objetivo === 0 ? 'La mejor semana para el cielo profundo' : '',
        importancia: superluna ? 2 : f.imp,
      });
      t = new Date(fecha.getTime() + 3 * MS_DIA);
    }
  }
  // --- Acercamientos de la Luna a planetas y estrellas brillantes ---
  const objetivosLuna = [
    ...PLANETAS_OJO.map((p) => ({ id: p, nombre: NOMBRE_PLANETA[p], pos: (f) => A.posicionPlaneta(p, f), limite: 4, planeta: true })),
    ...ESTRELLAS_ECLIPTICA.map((e) => ({ ...e, pos: () => e, limite: 3 })),
  ];
  for (const o of objetivosLuna) {
    const sep = (t) => { const f = new Date(t), l = A.posicionLuna(f), p = o.pos(f); return A.separacion(l.ra, l.dec, p.ra, p.dec); };
    for (const m of minimos(sep, desde, hasta, 3 * 3600000, o.limite)) {
      const elong = A.separacion(A.posicionSol(m.fecha).ra, A.posicionSol(m.fecha).dec, o.pos(m.fecha).ra, o.pos(m.fecha).dec);
      if (elong < 18) continue;                                  // demasiado cerca del Sol: no se ve
      anadir({
        id: `luna-${o.id}-${m.fecha.toISOString().slice(0, 13)}`, categoria: 'luna', tipo: 'acercamiento', fecha: m.fecha,
        titulo: `La Luna junto a ${o.nombre}`,
        texto: `A ${grados(m.valor)} (desde el centro de la Tierra; desde tu sitio puede variar hasta 1°)`,
        importancia: o.planeta && (o.id === 'venus' || o.id === 'jupiter') && m.valor < 1 ? 2 : 1,
      });
    }
  }
  // --- Conjunciones entre planetas ---
  for (let i = 0; i < PLANETAS_OJO.length; i++) {
    for (let j = i + 1; j < PLANETAS_OJO.length; j++) {
      const [p, q] = [PLANETAS_OJO[i], PLANETAS_OJO[j]];
      const sep = (t) => { const f = new Date(t), a = A.posicionPlaneta(p, f), b = A.posicionPlaneta(q, f); return A.separacion(a.ra, a.dec, b.ra, b.dec); };
      for (const m of minimos(sep, desde, hasta, MS_DIA, 2.5)) {
        const ea = A.posicionPlaneta(p, m.fecha).elongacion, eb = A.posicionPlaneta(q, m.fecha).elongacion;
        if (Math.min(ea, eb) < 12) continue;
        anadir({
          id: `conj-${p}-${q}-${m.fecha.toISOString().slice(0, 10)}`, categoria: 'planetas', tipo: 'conjuncion', fecha: m.fecha,
          titulo: `Conjunción de ${NOMBRE_PLANETA[p]} y ${NOMBRE_PLANETA[q]}`,
          texto: `Separados ${grados(m.valor)}${m.valor < 1.4 ? ': caben juntos en el campo del Seestar S50 Pro' : ''}`,
          importancia: m.valor < 1 && (p === 'venus' || q === 'jupiter' || p === 'jupiter') ? 3 : 2,
        });
      }
    }
  }
  // --- Oposiciones y máximas elongaciones ---
  for (const p of A.PLANETAS) {
    let t = new Date(desde.getTime() - 5 * MS_DIA);
    for (let i = 0; i < 6; i++) {
      const m = A.mejorMomentoPlaneta(p, t);
      if (!m || m.fecha > hasta) break;
      const pos = A.posicionPlaneta(p, m.fecha);
      anadir({
        id: `mejor-${p}-${m.fecha.toISOString().slice(0, 10)}`, categoria: 'planetas', tipo: m.tipo === 'oposición' ? 'oposicion' : 'elongacion',
        fecha: m.fecha, ref: p,
        titulo: `${NOMBRE_PLANETA[p]}: ${m.tipo}`,
        texto: m.tipo === 'oposición'
          ? `Visible toda la noche, magnitud ${pos.magnitud.toFixed(1)}, ${pos.diametro.toFixed(1)}″`
          : `A ${grados(m.elongacion)} del Sol: ${m.tipo.includes('vespertina') ? 'búscalo al anochecer' : 'búscalo al amanecer'}`,
        importancia: ['marte', 'jupiter', 'saturno'].includes(p) || p === 'venus' ? 2 : 1,
      });
      t = new Date(m.fecha.getTime() + 20 * MS_DIA);
    }
  }
  // --- Equinoccios y solsticios (longitud del Sol 0°, 90°, 180°, 270°) ---
  const ESTACIONES = [[0, 'Equinoccio de marzo', 'Empieza la primavera', 2], [90, 'Solsticio de junio', 'Empieza el verano: la noche más corta', 5],
    [180, 'Equinoccio de septiembre', 'Empieza el otoño', 8], [270, 'Solsticio de diciembre', 'Empieza el invierno: la noche más larga', 11]];
  for (let anio = desde.getFullYear(); anio <= hasta.getFullYear(); anio++) {
    for (const [lon, titulo, texto, mes] of ESTACIONES) {
      let t = Date.UTC(anio, mes, 21, 12);
      for (let i = 0; i < 6; i++) t += (norm180(lon - A.posicionSol(new Date(t)).lon) / 0.985647) * MS_DIA;
      anadir({ id: `estacion-${anio}-${lon}`, categoria: 'estaciones', tipo: 'estacion', fecha: new Date(t), titulo, texto, importancia: 1 });
    }
    // Perihelio y afelio: distancia Tierra–Sol mínima (principios de enero) y máxima (principios de julio)
    for (const [mes, nombre, signo] of [[0, 'Perihelio de la Tierra', 1], [6, 'Afelio de la Tierra', -1]]) {
      let mejor = null;
      for (let d = -12; d <= 12; d++) {
        const f = new Date(Date.UTC(anio, mes, 4 + d, 12));
        const g = 357.529 + 0.98560028 * (A.diaJuliano(f) - 2451545);
        const R = 1.00014 - 0.01671 * cos(g) - 0.00014 * cos(2 * g);
        if (!mejor || signo * R < signo * mejor.R) mejor = { f, R };
      }
      anadir({
        id: `ap-${anio}-${mes}`, categoria: 'estaciones', tipo: 'apsides', fecha: mejor.f, titulo: nombre,
        texto: `${(mejor.R * 149597870.7 / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 })} millones de km del Sol${signo > 0 ? ': el más cerca del año, ¡en invierno!' : ''}`,
        importancia: 0,
      });
    }
  }
  // --- Cometas ---
  for (const c of cometas) {
    const { perihelio, mejor } = mejorMomentoCometa(c);
    const posP = posicionCometa(c, perihelio);
    anadir({
      id: `${c.id}-perihelio`, categoria: 'cometas', tipo: 'cometa', fecha: perihelio, ref: c.id,
      titulo: `Cometa ${c.nombre}: perihelio`,
      texto: `A ${posP.r.toFixed(2)} UA del Sol · magnitud estimada ${posP.magnitud.toFixed(1)}`,
      importancia: posP.magnitud <= 7 ? 3 : posP.magnitud <= 11 ? 2 : 1,
    });
    if (mejor && Math.abs(mejor.fecha - perihelio) > 10 * MS_DIA) {
      anadir({
        id: `${c.id}-mejor`, categoria: 'cometas', tipo: 'cometa', fecha: mejor.fecha, ref: c.id,
        titulo: `Cometa ${c.nombre}: mejor momento`,
        texto: `Magnitud estimada ${mejor.magnitud.toFixed(1)} a ${Math.round(mejor.elongacion)}° del Sol`,
        importancia: mejor.magnitud <= 7 ? 3 : mejor.magnitud <= 11 ? 2 : 1,
      });
    }
  }
  return s.sort((a, b) => a.fecha - b.fecha);
}

/* ==========================================================================
   Exportar al calendario (formato iCalendar, .ics)
   ========================================================================== */
const icsFecha = (f) => f.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsTexto = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Texto .ics con los sucesos; avisa 1 día antes de eclipses y lluvias, y 2 horas antes del resto */
export function generarICS(sucesos, ahora = new Date()) {
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AstroKit//Efemerides//ES', 'CALSCALE:GREGORIAN'];
  for (const e of sucesos) {
    const fin = new Date(e.fecha.getTime() + 3600000);
    const aviso = e.categoria === 'eclipses' || e.categoria === 'meteoros' ? '-P1D' : '-PT2H';
    lineas.push('BEGIN:VEVENT', `UID:${e.id}@astrokit`, `DTSTAMP:${icsFecha(ahora)}`,
      `DTSTART:${icsFecha(e.fecha)}`, `DTEND:${icsFecha(fin)}`,
      `SUMMARY:${icsTexto(e.titulo)}`, `DESCRIPTION:${icsTexto((e.texto || '') + '\nAstroKit · cjgaland.github.io/astrokit')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTexto(e.titulo)}`, `TRIGGER:${aviso}`, 'END:VALARM',
      'END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return lineas.join('\r\n') + '\r\n';
}
