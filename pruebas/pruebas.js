/* ==========================================================================
   pruebas.js — Mini sistema de pruebas, sin librerías
   --------------------------------------------------------------------------
   prueba('nombre', () => { ... })  registra una prueba.
   igual(a, b)          falla si a !== b
   cerca(a, b, tol)     falla si |a − b| > tol (para números con decimales)
   cierto(x, mensaje)   falla si x es falso

   En cada fase añadiremos aquí las pruebas de sus cálculos
   (fase 2: escala de placa del S50 Pro ≈ 2,3″/px, diagonal ≈ 2,8°...).
   ========================================================================== */

import { normalizar, resaltar, mdLigero, sinMarcas } from '../js/util.js';
import * as O from '../js/calculos/optica.js';
import * as A from '../js/calculos/astro.js';
import { proyectar, desproyectar } from '../js/calculos/proyeccion.js';
import { pdfConImagen } from '../js/pdf.js';
import { ordenarEquipos, selectorMiEquipo, NINGUNO } from '../js/equipo.js';
import { progreso, mover } from '../js/modulos/checklist.js';
import { integracionMin, dimensionesMiniatura, mezclarSesiones, totalesPorObjeto } from '../js/modulos/cuaderno.js';
import * as E from '../js/calculos/eclipses.js';
import * as F from '../js/calculos/efemerides.js';

const grupos = [];
function grupo(nombre) { grupos.push({ nombre, pruebas: [] }); }
function prueba(nombre, fn) { grupos.at(-1).pruebas.push({ nombre, fn }); }

function igual(a, b) { if (a !== b) throw new Error(`esperaba ${JSON.stringify(b)}, salió ${JSON.stringify(a)}`); }
function cerca(a, b, tol) { if (Math.abs(a - b) > tol) throw new Error(`esperaba ${b} ± ${tol}, salió ${a}`); }
function cierto(x, mensaje = 'condición falsa') { if (!x) throw new Error(mensaje); }

/* ---------- Utilidades de texto ---------- */
grupo('Utilidades de texto (js/util.js)');

prueba('normalizar quita tildes y mayúsculas', () => {
  igual(normalizar('Óptica Señal/Ruido'), 'optica senal/ruido');
});
prueba('normalizar conserva la longitud (necesario para resaltar)', () => {
  const t = 'Rotación de campo — 1/1,2″ µm Hα';
  igual(normalizar(t).length, t.length);
});
prueba('resaltar marca sin importar las tildes', () => {
  igual(resaltar('Relación focal', ['relacion']), '<mark>Relación</mark> focal');
});
prueba('resaltar escapa el HTML', () => {
  igual(resaltar('a<b', ['b']), 'a&lt;<mark>b</mark>');
});
prueba('mdLigero convierte negrita y cursiva', () => {
  igual(mdLigero('**cuatro** veces *más*'), '<strong>cuatro</strong> veces <em>más</em>');
});
prueba('sinMarcas quita asteriscos', () => {
  igual(sinMarcas('DSO, *Deep Sky Object*'), 'DSO, Deep Sky Object');
});

/* ---------- Datos del glosario ---------- */
grupo('Datos del glosario (data/glosario.json)');
const glosario = await fetch('../data/glosario.json').then((r) => r.json());

prueba('hay 8 bloques', () => igual(glosario.bloques.length, 8));
prueba('hay al menos 150 términos', () => cierto(glosario.terminos.length >= 150, `solo ${glosario.terminos.length}`));
prueba('los identificadores no se repiten', () => {
  const ids = glosario.terminos.map((t) => t.id);
  igual(new Set(ids).size, ids.length);
});
prueba('todos los términos tienen nombre, algún texto y un bloque existente', () => {
  const bloques = new Set(glosario.bloques.map((b) => b.id));
  for (const t of glosario.terminos) {
    // la mayoría tiene definición; alguno solo "en tu equipo" (Mosaico 8K) o solo lista (Las líneas clave)
    cierto(t.termino && (t.definicion || t.equipo || t.lista?.length), `${t.id} incompleto`);
    cierto(bloques.has(t.bloque), `${t.id}: bloque ${t.bloque} no existe`);
  }
});
prueba('la escala de placa trae su fórmula y el dato del equipo', () => {
  const t = glosario.terminos.find((x) => x.id === 'escala-de-placa');
  cierto(t.cuenta.includes('206,265'), 'falta la fórmula');
  cierto(t.equipo.includes('2,3'), 'falta el 2,3″/px del S50 Pro');
});
prueba('"Frames de calibración" conserva sus 4 tipos y su "en tu equipo"', () => {
  const t = glosario.terminos.find((x) => x.id === 'frames-de-calibracion');
  igual(t.lista.length, 4);
  cierto(t.equipo, 'falta "en tu equipo"');
});
prueba('incluye «¿Subs cortas o largas?» (se perdía en la primera conversión)', () =>
  cierto(glosario.terminos.some((t) => t.id === 'subs-cortas-o-largas')));
prueba('"Ver también": todos los relacionados existen y ninguno apunta a sí mismo', () => {
  const ids = new Set(glosario.terminos.map((t) => t.id));
  for (const t of glosario.terminos) {
    for (const r of t.relacionados || []) {
      cierto(ids.has(r), `${t.id} → ${r} no existe`);
      cierto(r !== t.id, `${t.id} se relaciona consigo mismo`);
    }
  }
});
prueba('"Ver también": casi todos los términos tienen al menos uno', () => {
  const sin = glosario.terminos.filter((t) => !(t.relacionados || []).length);
  cierto(sin.length <= 3, `sin relacionados: ${sin.map((t) => t.id).join(', ')}`);
});
prueba('escala de placa se relaciona con muestreo y seeing', () => {
  const r = glosario.terminos.find((t) => t.id === 'escala-de-placa').relacionados;
  cierto(r.includes('muestreo-submuestreo-y-sobremuestreo') && r.includes('seeing'));
});
prueba('ningún texto conserva marcas sin procesar (*Analogía:* etc.)', () => {
  const texto = JSON.stringify(glosario.terminos);
  cierto(!/\*(Analogía|La cuenta|En tu equipo|Regla práctica):\*/.test(texto), 'quedan marcas');
});

/* ---------- Óptica ---------- */
grupo('Calculadora óptica (js/calculos/optica.js) con valores conocidos');
const { equipos } = await fetch('../data/equipos.json').then((r) => r.json());
const s50 = equipos.find((e) => e.id === 's50pro');
const draco = equipos.find((e) => e.id === 'draco-dso');
const s50ancho = O.tamanoSensor(s50.resX, s50.pixel);   // 3840 × 2,9 µm
const s50alto = O.tamanoSensor(s50.resY, s50.pixel);

prueba('S50 Pro: sensor de 11,14 × 6,26 mm', () => {
  cerca(s50ancho, 11.136, 0.001);
  cerca(s50alto, 6.264, 0.001);
});
prueba('S50 Pro: relación focal f/5,2', () => cerca(O.relacionFocal(260, 50), 5.2, 1e-9));
prueba('S50 Pro: escala de placa ≈ 2,30″/px', () => cerca(O.escalaPlaca(s50.pixel, s50.focal), 2.30, 0.01));
prueba('S50 Pro: campo ≈ 2,45° × 1,38°', () => {
  cerca(O.campoVision(s50ancho, 260), 2.45, 0.01);
  cerca(O.campoVision(s50alto, 260), 1.38, 0.01);
});
prueba('S50 Pro: diagonal ≈ 2,8°', () => cerca(O.campoVision(O.diagonal(s50ancho, s50alto), 260), 2.81, 0.02));
prueba('Draco (2×2): escala ≈ 1,46″/px y f/3,8', () => {
  cerca(O.escalaPlaca(draco.pixel, draco.focal), 1.456, 0.005);
  cerca(O.relacionFocal(340, 90), 3.78, 0.01);
});
prueba('Draco: lado largo ≈ 1,65° (dato de la comparativa)', () =>
  cerca(O.campoVision(O.tamanoSensor(draco.resX, draco.pixel), draco.focal), 1.65, 0.02));
const eq2 = equipos.find((e) => e.id === 'equinox2');
prueba('eQuinox 2: escala ≈ 1,33″/px y f/3,9', () => {
  cerca(O.escalaPlaca(eq2.pixel, eq2.focal), 1.33, 0.005);
  cerca(O.relacionFocal(eq2.focal, eq2.apertura), 3.95, 0.01);
});
prueba('eQuinox 2: campo oficial ≈ 0,76° × 0,57° (46′ × 34′)', () => {
  cerca(O.campoVision(O.tamanoSensor(eq2.resX, eq2.pixel), eq2.focal), 0.76, 0.01);
  cerca(O.campoVision(O.tamanoSensor(eq2.resY, eq2.pixel), eq2.focal), 0.57, 0.01);
});
prueba('eQuinox 2: ≈ 5,2× la luz del S50 Pro y ≈ 1,6× la del Draco', () => {
  cerca(O.luzRelativa(114, 50), 5.2, 0.01);
  cerca(O.luzRelativa(114, 90), 1.6, 0.01);
});
prueba('Dawes: 2,32″ con 50 mm y 1,29″ con 90 mm', () => {
  cerca(O.limiteDawes(50), 2.32, 0.005);
  cerca(O.limiteDawes(90), 1.29, 0.005);
});
prueba('Luz: el Draco recoge ≈ 3,24× (≈ +1,28 mag) más que el S50', () => {
  cerca(O.luzRelativa(90, 50), 3.24, 1e-9);
  cerca(O.gananciaMagnitudes(90, 50), 1.276, 0.001);
});
prueba('Aproximación 57,3 × s ÷ F casi igual a la fórmula exacta', () =>
  cerca(O.campoVisionAprox(s50ancho, 260), O.campoVision(s50ancho, 260), 0.001));
prueba('Muestreo: S50 con seeing 3″ → 1,3 px (submuestreo)', () => {
  const m = O.muestreo(3, 2.30);
  cerca(m.pixeles, 1.30, 0.01);
  igual(m.estado, 'sub');
});
prueba('Mosaico: M31 (190′) en el S50 (147′) → 2 paneles; M42 cabe en 1', () => {
  igual(O.panelesMosaico(190, 60, 147.2, 82.8).columnas, 2);
  const m42 = O.panelesMosaico(85, 60, 147.2, 82.8);
  igual(m42.columnas * m42.filas, 1);
});
prueba('Caja de una elipse girada 90° intercambia ancho y alto', () => {
  const c = O.cajaGirada(190, 60, 90);
  cerca(c.ancho, 60, 1e-9); cerca(c.alto, 190, 1e-9);
});
prueba('SNR √N: para duplicarla hacen falta 4× tomas', () => {
  igual(O.tomasParaFactor(360, 2), 1440);
  cerca(O.factorSNR(1440, 360), 2, 1e-12);
});
prueba('360 tomas de 10 s = 1 h de integración', () => cerca(O.horasIntegracion(360, 10), 1, 1e-12));

/* ---------- Astronomía ---------- */
grupo('Planificador (js/calculos/astro.js) contra valores de referencia');
// Fechas en UTC, para que la prueba dé lo mismo en cualquier zona horaria
const U = (...a) => new Date(Date.UTC(...a));
const minutos = (a, b) => Math.abs(a - b) / 60000;

prueba('Día juliano del 1-1-2000 12:00 UT = 2.451.545', () => cerca(A.diaJuliano(U(2000, 0, 1, 12)), 2451545, 1e-9));
prueba('Tiempo sidéreo (Meeus 12.a): 10-abr-1987 0h UT = 197,6932°', () =>
  cerca(A.tiempoSidereoLocal(U(1987, 3, 10), 0), 197.6932, 0.001));
prueba('Sol (Meeus 25.a): 13-oct-1992 → AR 198,38°, Dec −7,79°', () => {
  const s = A.posicionSol(U(1992, 9, 13));
  cerca(s.ra, 198.381, 0.02); cerca(s.dec, -7.785, 0.02);
});
prueba('Luna (Meeus 47.a): 12-abr-1992 → AR 134,69°, Dec 13,77° (±0,3°)', () => {
  const l = A.posicionLuna(U(1992, 3, 12));
  cerca(l.ra, 134.688, 0.3); cerca(l.dec, 13.768, 0.3);
});
prueba('Altura y acimut (Meeus 13.b, Venus desde Washington): 15,12° y 248,03°', () => {
  const v = A.altAz(347.3193375, -6.719892, 38.92139, -77.06556, U(1987, 3, 10, 19, 21));
  cerca(v.alt, 15.125, 0.05); cerca(v.az, 248.034, 0.05);
});
prueba('Luna nueva del 6-ene-2000 a las 18:14 UT (±1 h)', () =>
  cierto(minutos(A.proximaFase(U(2000, 0, 1), 0), U(2000, 0, 6, 18, 14)) < 60));
prueba('Luna llena del eclipse del 7-sep-2025, 18:09 UT (±1 h)', () =>
  cierto(minutos(A.proximaFase(U(2025, 8, 1), 180), U(2025, 8, 7, 18, 9)) < 60));
prueba('Madrid 21-jun-2025: puesta 21:48 y salida 06:45 hora local (±3 min)', () => {
  const s = A.sucesosNoche(U(2025, 5, 21, 12), 40.4168, -3.7038);
  cierto(minutos(s.puesta.inicio, U(2025, 5, 21, 19, 48)) < 3, 'puesta ' + s.puesta.inicio.toISOString());
  cierto(minutos(s.puesta.fin, U(2025, 5, 22, 4, 45)) < 3, 'salida ' + s.puesta.fin.toISOString());
});
prueba('Madrid 21-dic-2025: puesta 17:51 y salida 08:34 hora local (±3 min)', () => {
  const s = A.sucesosNoche(U(2025, 11, 21, 12), 40.4168, -3.7038);
  cierto(minutos(s.puesta.inicio, U(2025, 11, 21, 16, 51)) < 3, 'puesta ' + s.puesta.inicio.toISOString());
  cierto(minutos(s.puesta.fin, U(2025, 11, 22, 7, 34)) < 3, 'salida ' + s.puesta.fin.toISOString());
});
prueba('Córdoba en diciembre: la noche astronómica empieza hacia las 19:30 (glosario)', () => {
  const s = A.sucesosNoche(U(2026, 11, 21, 12), 37.89, -4.77);
  cierto(minutos(s.astronomico.inicio, U(2026, 11, 21, 18, 30)) < 20, s.astronomico.inicio.toISOString());
});
prueba('Córdoba en junio: la noche astronómica empieza después de las 23:00 (glosario)', () => {
  const s = A.sucesosNoche(U(2026, 5, 21, 12), 37.89, -4.77);
  cierto(s.astronomico.inicio > U(2026, 5, 21, 21, 0), s.astronomico.inicio.toISOString());
});
prueba('Altura máxima de M31 desde Córdoba: 90 − |37,89 − 41,27| = 86,6°', () =>
  cerca(A.alturaMaxima(41.27, 37.89), 86.62, 0.01));
prueba('La culminación coincide con la altura máxima calculada', () => {
  const t = A.proximaCulminacion(0.712 * 15, -4.77, U(2026, 9, 11, 12));
  cerca(A.altAz(0.712 * 15, 41.27, 37.89, -4.77, t).alt, 86.62, 0.05);
});
prueba('Planetas (Meeus 33.a): Venus 20-dic-1992 → AR 316,2°, Dec −18,9°, Δ 0,911 UA', () => {
  const v = A.posicionPlaneta('venus', U(1992, 11, 20));
  cerca(v.ra, 316.17, 0.3); cerca(v.dec, -18.89, 0.3); cerca(v.distancia, 0.911, 0.005);
});
prueba('Oposiciones: Júpiter 10-ene-2026, Saturno 21-sep-2025 y Marte 16-ene-2025 (> 175° del Sol)', () => {
  cierto(A.posicionPlaneta('jupiter', U(2026, 0, 10)).elongacion > 175, 'Júpiter');
  cierto(A.posicionPlaneta('saturno', U(2025, 8, 21)).elongacion > 175, 'Saturno');
  cierto(A.posicionPlaneta('marte', U(2025, 0, 16)).elongacion > 175, 'Marte');
});
prueba('Venus en su máxima elongación del 1-jun-2025: 45,9°', () =>
  cerca(A.posicionPlaneta('venus', U(2025, 5, 1)).elongacion, 45.9, 0.5));
prueba('Júpiter en oposición: ≈ 46,6″ y magnitud ≈ −2,7', () => {
  const j = A.posicionPlaneta('jupiter', U(2026, 0, 10));
  cerca(j.diametro, 46.6, 0.5); cerca(j.magnitud, -2.7, 0.2);
});
prueba('Fase: Luna llena iluminada > 99 % y nueva < 1 %', () => {
  cierto(A.faseLunar(A.proximaFase(U(2026, 0, 1), 180)).iluminada > 0.99);
  cierto(A.faseLunar(A.proximaFase(U(2026, 0, 1), 0)).iluminada < 0.01);
});

/* ---------- Checklist ---------- */
grupo('Checklist (data/checklist.json y js/modulos/checklist.js)');
const checklist = await fetch('../data/checklist.json').then((r) => r.json());

prueba('los identificadores de toda la lista no se repiten', () => {
  const ids = checklist.grupos.flatMap((g) => g.items.map((i) => i.id));
  igual(new Set(ids).size, ids.length);
});
prueba('ningún grupo vacío y todos los elementos con texto', () => {
  for (const g of checklist.grupos) {
    cierto(g.items.length > 0, `grupo ${g.id} vacío`);
    for (const i of g.items) cierto(i.texto && i.texto.trim(), `${i.id} sin texto`);
  }
});
prueba('incluye lo que pediste: batería, filtro solar, linterna roja, abrigo y nivelar', () => {
  const texto = normalizar(JSON.stringify(checklist));
  for (const p of ['bateria', 'filtro solar', 'luz roja', 'abrigo', 'nivelar']) cierto(texto.includes(p), `falta «${p}»`);
});
prueba('progreso cuenta solo lo marcado', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const p = progreso(items, new Set(['a', 'c', 'x']));
  igual(p.hechos, 2); igual(p.total, 3);
});
prueba('mover sube y baja sin salirse de la lista ni modificar el original', () => {
  const l = ['a', 'b', 'c'];
  igual(mover(l, 1, -1).join(''), 'bac');
  igual(mover(l, 1, 1).join(''), 'acb');
  igual(mover(l, 0, -1).join(''), 'abc');
  igual(l.join(''), 'abc');
});

/* ---------- Cuaderno ---------- */
grupo('Cuaderno (js/modulos/cuaderno.js)');

prueba('360 tomas de 10 s = 60 min de integración', () => igual(integracionMin({ subs: 360, exposicion: 10 }), 60));
prueba('Una sesión sin tomas cuenta 0 min (no NaN)', () => igual(integracionMin({ subs: '', exposicion: '' }), 0));
prueba('Miniatura: 3840×2160 → 400×225; una pequeña no se agranda', () => {
  const m = dimensionesMiniatura(3840, 2160, 400);
  igual(m.ancho, 400); igual(m.alto, 225);
  const p = dimensionesMiniatura(300, 200, 400);
  igual(p.ancho, 300); igual(p.alto, 200);
});
prueba('Miniatura vertical: 3024×4032 → 300×400', () => {
  const m = dimensionesMiniatura(3024, 4032, 400);
  igual(m.ancho, 300); igual(m.alto, 400);
});
prueba('Importar no duplica y se queda con la versión más reciente', () => {
  const actuales = [{ id: 'a', modificado: '2026-10-01', notas: 'vieja' }, { id: 'b', modificado: '2026-10-05' }];
  const importadas = [{ id: 'a', modificado: '2026-10-09', notas: 'nueva' }, { id: 'b', modificado: '2026-10-01' }, { id: 'c', modificado: '2026-10-02' }];
  const r = mezclarSesiones(actuales, importadas);
  igual(r.lista.length, 3); igual(r.nuevas, 1); igual(r.actualizadas, 1);
  igual(r.lista.find((s) => s.id === 'a').notas, 'nueva');
});
prueba('Totales multinoche por objeto (sin distinguir mayúsculas)', () => {
  const t = totalesPorObjeto([
    { objeto: 'M31', subs: 360, exposicion: 10 },
    { objeto: 'm31 ', subs: 180, exposicion: 20 },
    { objeto: 'M42', subs: 100, exposicion: 10 },
  ], 'M31');
  igual(t.noches, 2); igual(t.minutos, 120);
});

/* ---------- Enlaces ---------- */
grupo('Enlaces (data/enlaces.json)');
const enlaces = await fetch('../data/enlaces.json').then((r) => r.json());
prueba('todas las direcciones son https y válidas', () => {
  for (const g of enlaces.grupos) for (const e of g.enlaces) {
    const u = new URL(e.url.replace('{lat}', '37.89').replace('{lon}', '-4.77'));
    igual(u.protocol, 'https:');
  }
});
prueba('están las webs de planificación y el software de la comparativa', () => {
  const nombres = enlaces.grupos.flatMap((g) => g.enlaces.map((e) => normalizar(e.nombre))).join(' | ');
  for (const n of ['clear outside', 'meteoblue', 'light pollution', 'telescopius', 'stellarium', 'siril', 'graxpert', 'starnet', 'kstars'])
    cierto(nombres.includes(n), `falta ${n}`);
});

/* ---------- Telescopios de los amigos ---------- */
grupo('Telescopios añadidos (data/equipos.json)');
prueba('Mi equipo: «Ninguno» primero y el resto en orden alfabético', () => {
  const ordenados = ordenarEquipos(equipos).map((e) => e.nombre);
  igual(ordenados.join('|'), [...ordenados].sort((x, y) => x.localeCompare(y, 'es')).join('|'));
  igual(ordenados[0].startsWith('Celestron'), true);
  igual(equipos[0].id, 's50pro');                                  // ordenar no altera el JSON original
  const valores = [...selectorMiEquipo(equipos, NINGUNO).matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
  igual(valores[0], NINGUNO);
  igual(valores.length, equipos.length + 1);
  igual(/value="ninguno" selected/.test(selectorMiEquipo(equipos, NINGUNO)), true);
});
const s50clasico = equipos.find((e) => e.id === 's50');
const omni127 = equipos.find((e) => e.id === 'omni127');
prueba('Seestar S50: f/5, 2,39″/px y campo oficial 1,29° × 0,73°', () => {
  cerca(O.relacionFocal(s50clasico.focal, s50clasico.apertura), 5, 1e-9);
  cerca(O.escalaPlaca(s50clasico.pixel, s50clasico.focal), 2.39, 0.01);
  cerca(O.campoVision(O.tamanoSensor(s50clasico.resX, s50clasico.pixel), s50clasico.focal), 1.28, 0.015);
  cerca(O.campoVision(O.tamanoSensor(s50clasico.resY, s50clasico.pixel), s50clasico.focal), 0.72, 0.015);
});
prueba('Omni XLT 127: f/9,8, Dawes 0,91″ y 0,48″/px con la cámara supuesta', () => {
  cerca(O.relacionFocal(omni127.focal, omni127.apertura), 9.84, 0.01);
  cerca(O.limiteDawes(omni127.apertura), 0.913, 0.005);
  cerca(O.escalaPlaca(omni127.pixel, omni127.focal), 0.479, 0.003);
});

/* ---------- Mapa celeste ---------- */
grupo('Mapa celeste (proyección, datos del cielo y PDF)');
prueba('Proyección: cénit en el centro, norte arriba y este a la izquierda', () => {
  const z = proyectar(90, 0); cerca(z.x, 0, 1e-12); cerca(z.y, 0, 1e-12);
  const n = proyectar(0, 0); cerca(n.y, -1, 1e-9);
  const e = proyectar(0, 90); cerca(e.x, -1, 1e-9);
});
prueba('Proyección: ida y vuelta devuelve la misma altura y acimut', () => {
  const p = proyectar(37, 123), v = desproyectar(p.x, p.y);
  cerca(v.alt, 37, 1e-9); cerca(v.az, 123, 1e-9);
});
const cielo = await fetch('../data/cielo.json').then((r) => r.json());
const { objetos: objetosCat } = await fetch('../data/objetos.json').then((r) => r.json());
prueba('Datos del cielo: 5.044 estrellas hasta magnitud 6 y las 88 constelaciones (Serpiente en dos partes)', () => {
  igual(cielo.estrellas.length, 5044);
  igual(Math.max(...cielo.estrellas.map((e) => e[2])) <= 6, true);
  igual(new Set(cielo.constelaciones.map((c) => c.id)).size, 88);
});
prueba('Deslizador de magnitud: unas 3 veces más estrellas por cada magnitud (4 → 519, 5 → 1.627, 6 → 5.044)', () => {
  const hasta = (m) => cielo.estrellas.filter((e) => e[2] <= m).length;
  igual(hasta(4), 519); igual(hasta(5), 1627); igual(hasta(6), 5044);
  cerca(hasta(6) / hasta(5), 3, 0.3);
});
prueba('Datos del cielo: Sirio, Vega y la Polar están donde deben', () => {
  const buscar = (n) => cielo.estrellas.find((e) => e[4] === n);
  const [sirio, vega, polar] = ['Sirio', 'Vega', 'Polar'].map(buscar);
  cerca(sirio[0], 101.29, 0.1); cerca(sirio[1], -16.72, 0.1); cerca(sirio[2], -1.44, 0.1);
  cerca(vega[0], 279.23, 0.1); cerca(vega[1], 38.78, 0.1);
  cerca(polar[1], 89.26, 0.1);
});
prueba('Todos los objetos del catálogo tienen constelación', () => {
  const sinConst = objetosCat.filter((o) => o.ar !== undefined && !o.constelacion).map((o) => o.id);
  cierto(!sinConst.length, `sin constelación: ${sinConst.join(', ')}`);
});
prueba('PDF: cabecera, final y tabla xref apuntando a su sitio', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = pdfConImagen(jpeg, 200, 100, { titulo: 'Prueba' });
  const texto = new TextDecoder('latin1').decode(pdf);
  cierto(texto.startsWith('%PDF-1.4'), 'cabecera');
  cierto(texto.trimEnd().endsWith('%%EOF'), 'final');
  const inicio = Number(texto.match(/startxref\n(\d+)/)[1]);
  igual(texto.slice(inicio, inicio + 4), 'xref');
  const obj3 = Number(texto.match(/xref\n0 7\n.*\n.*\n.*\n(\d{10})/)[1]);
  igual(texto.slice(obj3, obj3 + 7), '3 0 obj');
});

/* ---------- Mejores momentos de los planetas ---------- */
grupo('La Luna fuera de la ventana de la noche');
prueba('Córdoba, 29-oct-2026: sale 20:52 y la puesta del día siguiente se encuentra igualmente', () => {
  const noche29 = A.sucesosNoche(new Date('2026-10-29T12:00'), 37.89, -4.77).luna;
  const noche30 = A.sucesosNoche(new Date('2026-10-30T12:00'), 37.89, -4.77).luna;
  igual(noche29.sePone, null);                               // dentro de la ventana no se pone…
  cerca(noche29.sePoneDespues.getTime(), noche30.sePone.getTime(), 60000); // …y es la misma puesta de la noche siguiente
  igual(noche30.sePoneDespues, undefined);                   // en una noche normal no se busca nada más
});

grupo('Objetos celestes: mejores momentos de los planetas');
prueba('Próxima oposición de Júpiter desde jun-2025: 10-ene-2026 (±1 día)', () => {
  const m = A.mejorMomentoPlaneta('jupiter', U(2025, 5, 1));
  igual(m.tipo, 'oposición');
  cierto(minutos(m.fecha, U(2026, 0, 10)) <= 1440 * 1.5, m.fecha.toISOString());
});
prueba('Máxima elongación vespertina de Venus: 15-ago-2026 (±2 días)', () => {
  const m = A.mejorMomentoPlaneta('venus', U(2026, 2, 1));
  igual(m.tipo, 'máxima elongación vespertina');
  cierto(minutos(m.fecha, U(2026, 7, 15)) <= 1440 * 2, m.fecha.toISOString());
});

/* ---------- Efemérides ---------- */
const { eclipses: eclipsesSol } = await fetch('../data/eclipses.json').then((r) => r.json());
const efem = await fetch('../data/efemerides.json').then((r) => r.json());
const mundoDatos = await fetch('../data/mundo.json').then((r) => r.json());
const ciudadesDatos = await fetch('../data/ciudades.json').then((r) => r.json());
const eclipse = (f) => eclipsesSol.find((e) => e.fecha === f);
const hms = (f, h, m, s) => { const [a, mo, d] = f.split('-').map(Number); return U(a, mo - 1, d, h, m, s); };

grupo('Eclipses de Sol: nuestros cálculos frente a la NASA (F. Espenak)');
prueba('Datos: 24 eclipses de 2025 a 2035, con sus elementos besselianos', () => {
  igual(eclipsesSol.length, 24);
  for (const e of eclipsesSol) cierto(e.x.length === 4 && e.y.length === 4 && e.mu.length >= 2 && e.tanf1 > 0, e.id);
});
for (const [f, h, m, s, dur] of [['2026-08-12', 17, 45, 51, 138], ['2027-08-02', 10, 6, 34, 383], ['2028-01-26', 15, 7, 43, 627]]) {
  prueba(`${f}: en el punto de la máxima, duración ${dur} s (±3 s) y hora ±40 s`, () => {
    const ec = eclipse(f), c = E.circunstanciasLocales(ec, ec.maxima.lat, ec.maxima.lon);
    igual(c.tipo, ec.tipo);
    cerca(c.duracion, dur, 3);
    cierto(minutos(c.maximo, hms(f, h, m, s)) <= 40 / 60, c.maximo.toISOString());
  });
}
prueba('2027-08-02: anchura de la franja en la máxima ≈ 257,7 km (±2 %)', () => {
  const ec = eclipse('2027-08-02');
  cerca(E.anchuraFranja(ec, E.horasDesdeT0(ec, hms('2027-08-02', 10, 6, 34))), 257.7, 5.2);
});
prueba('La línea central pasa a menos de 25 km del punto de la máxima publicado', () => {
  for (const f of ['2026-08-12', '2027-08-02', '2028-01-26', '2030-11-25']) {
    const ec = eclipse(f);
    cierto(E.puntoCentralMasCercano(E.franja(ec), ec.maxima.lat, ec.maxima.lon).distancia < 25, f);
  }
});
prueba('12-ago-2026: total en León y en Valencia; en Madrid, parcial (99,9 %)', () => {
  const ec = eclipse('2026-08-12');
  igual(E.circunstanciasLocales(ec, 42.60, -5.57).tipo, 'total');
  igual(E.circunstanciasLocales(ec, 39.47, -0.38).tipo, 'total');
  igual(E.circunstanciasLocales(ec, 40.42, -3.70).tipo, 'parcial');
});
prueba('2-ago-2027: total en Tarifa (≈ 4 min 39 s) y parcial en Córdoba (≈ 96 %)', () => {
  const ec = eclipse('2027-08-02');
  const t = E.circunstanciasLocales(ec, 36.01, -5.60), c = E.circunstanciasLocales(ec, 37.89, -4.77);
  igual(t.tipo, 'total'); cerca(t.duracion, 279, 15);
  igual(c.tipo, 'parcial'); cerca(c.oscurecimiento, 0.966, 0.02);
});
prueba('26-ene-2028: anular desde Córdoba, al atardecer', () => {
  const c = E.circunstanciasLocales(eclipse('2028-01-26'), 37.89, -4.77);
  igual(c.tipo, 'anular'); cierto(c.altura > 0 && c.altura < 15, `${c.altura}°`);
});
prueba('Oscurecimiento: magnitud 0,5 con Luna y Sol iguales ≈ 39 % del área', () => {
  cerca(E.oscurecimiento(1, 1), 0.391, 0.002);
  igual(E.oscurecimiento(0, 1.05), 1);
});

grupo('Eclipses de Luna (Meeus, cap. 54) frente a la NASA');
for (const [fecha, h, m, mag, tipo] of [[[2025, 2, 14], 6, 58.7, 1.178, 'total'], [[2025, 8, 7], 18, 11.8, 1.362, 'total'],
  [[2026, 2, 3], 11, 33.7, 1.151, 'total'], [[2026, 7, 28], 4, 12.9, 0.930, 'parcial']]) {
  prueba(`${fecha[2]}-${fecha[1] + 1}-${fecha[0]}: ${tipo}, máximo ±3 min y magnitud umbral ${mag} (±0,02)`, () => {
    const l = F.eclipsesLuna(U(fecha[0], fecha[1], fecha[2] - 1), U(fecha[0], fecha[1], fecha[2] + 1));
    igual(l.length, 1); igual(l[0].tipo, tipo);
    cierto(minutos(l[0].maximo, U(fecha[0], fecha[1], fecha[2], h, Math.floor(m), Math.round((m % 1) * 60))) <= 3, l[0].maximo.toISOString());
    cerca(l[0].magUmbral, mag, 0.02);
  });
}

grupo('Lluvias de meteoros, estaciones y cometas');
prueba('13 lluvias con radiante, THZ e índice de población', () => {
  igual(efem.lluvias.length, 13);
  for (const l of efem.lluvias) cierto(l.thz > 0 && l.r >= 2 && l.dec >= -90 && l.dec <= 90 && l.actividad.length === 2, l.id);
});
prueba('Perseidas 2026: máximo el 12–13 de agosto; Gemínidas: 13–14 de diciembre', () => {
  const per = F.fechaLongitudSolar(140.0, 2026), gem = F.fechaLongitudSolar(262.2, 2026);
  cierto(per >= U(2026, 7, 12, 6) && per <= U(2026, 7, 13, 18), per.toISOString());
  cierto(gem >= U(2026, 11, 13, 12) && gem <= U(2026, 11, 14, 23), gem.toISOString());
});
prueba('Perseidas 2026 con Luna nueva: «buen año» y más meteoros cuanto más oscuro el cielo', () => {
  const n = F.nocheDeLluvia(efem.lluvias.find((l) => l.codigo === 'PER'), F.fechaLongitudSolar(140.0, 2026), { lat: 37.89, lon: -4.77 });
  igual(n.calidad, 'buena');
  cierto(n.tasas[4] < n.tasas[5] && n.tasas[5] < n.tasas[6], JSON.stringify(n.tasas));
});
prueba('Equinoccios y solsticios de 2025 a menos de 40 min de los oficiales', () => {
  const s = F.calcularSucesos({ desde: U(2025, 0, 1), hasta: U(2025, 11, 31), lugar: { lat: 37.89, lon: -4.77 } }).filter((x) => x.tipo === 'estacion');
  const oficiales = [U(2025, 2, 20, 9, 1), U(2025, 5, 21, 2, 42), U(2025, 8, 22, 18, 19), U(2025, 11, 21, 15, 3)];
  igual(s.length, 4);
  s.forEach((x, i) => cierto(minutos(x.fecha, oficiales[i]) <= 40, `${x.titulo}: ${x.fecha.toISOString()}`));
});
prueba('Cometas: posición y brillo como el JPL Horizons (±0,05° y ±0,1 mag)', () => {
  for (const [id, f, ra, dec, mag] of [['cometa-2p', U(2027, 1, 1), 327.2358, -7.4149, 13.0], ['cometa-c2025y1', U(2027, 5, 1), 250.9876, -0.3714, 12.37], ['cometa-45p', U(2027, 7, 20), 111.1690, 19.1691, 8.49]]) {
    const p = F.posicionCometa(efem.cometas.find((c) => c.id === id), f);
    cerca(p.ra, ra, 0.05); cerca(p.dec, dec, 0.05); cerca(p.magnitud, mag, 0.1);
  }
});
prueba('Cometa en el perihelio: distancia al Sol = q', () => {
  for (const c of efem.cometas) cerca(F.posicionCometa(c, new Date((c.tp - 2440587.5) * 86400000)).r, c.q, 1e-4);
});
prueba('Calendario .ics: un VEVENT por suceso, con hora UTC y aviso', () => {
  const s = F.calcularSucesos({ desde: U(2026, 11, 1), hasta: U(2026, 11, 31), lugar: { lat: 37.89, lon: -4.77 }, ...efem, eclipses: eclipsesSol });
  const ics = F.generarICS(s);
  cierto(ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
  igual((ics.match(/BEGIN:VEVENT/g) || []).length, s.length);
  cierto(/DTSTART:\d{8}T\d{6}Z/.test(ics) && ics.includes('TRIGGER:-P1D'));
});
prueba('Datos del globo: tierra, fronteras y ciudades (Córdoba, Tarifa)', () => {
  cierto(mundoDatos.tierra.length > 500 && mundoDatos.fronteras.length > 200);
  const todas = [...ciudadesDatos.espana, ...ciudadesDatos.mundo].map((c) => c[0]);
  cierto(todas.includes('Córdoba') && todas.includes('Tarifa'));
});
prueba('Glosario: los términos nuevos de las efemérides existen', () => {
  for (const id of ['efemerides', 'radiante', 'tasa-horaria-cenital-thz', 'eclipse-de-sol', 'franja-de-totalidad', 'saros', 'delta-t'])
    cierto(glosario.terminos.some((t) => t.id === id), id);
});

/* ---------- Ejecutar y pintar ---------- */
const salida = document.getElementById('salida');
let ok = 0, mal = 0;
for (const g of grupos) {
  salida.insertAdjacentHTML('beforeend', `<h2>${g.nombre}</h2>`);
  for (const p of g.pruebas) {
    try {
      await p.fn();
      ok++;
      salida.insertAdjacentHTML('beforeend', `<div class="ok">✓ ${p.nombre}</div>`);
    } catch (e) {
      mal++;
      salida.insertAdjacentHTML('beforeend', `<div class="mal">✗ ${p.nombre}</div><div class="detalle">${e.message}</div>`);
    }
  }
}
const resumen = document.getElementById('resumen');
resumen.textContent = mal ? `${mal} fallan, ${ok} pasan` : `Las ${ok} pruebas pasan`;
resumen.className = mal ? 'mal' : 'ok';
// Para poder leer el resultado desde fuera (p. ej. herramientas automáticas)
window.resultadoPruebas = { ok, mal };
