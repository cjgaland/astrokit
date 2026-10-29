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
import { progreso, mover } from '../js/modulos/checklist.js';
import { integracionMin, dimensionesMiniatura, mezclarSesiones, totalesPorObjeto } from '../js/modulos/cuaderno.js';

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
prueba('Datos del cielo: más de 1.500 estrellas y las 88 constelaciones (Serpiente en dos partes)', () => {
  cierto(cielo.estrellas.length > 1500, `${cielo.estrellas.length} estrellas`);
  igual(new Set(cielo.constelaciones.map((c) => c.id)).size, 88);
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
