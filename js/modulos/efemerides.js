/* ==========================================================================
   modulos/efemerides.js — Cielo · Efemérides (#efemerides)
   --------------------------------------------------------------------------
   El calendario de sucesos del cielo (js/calculos/efemerides.js), con:
     · Lista por meses, filtros por categoría y «solo lo destacado»
     · Exportar al calendario del móvil o del Mac (.ics, con aviso)
     · Páginas de detalle:
         #efemerides/sol-AAAA-MM-DD   eclipse de Sol con el GLOBO 3D: franja de
                                      totalidad/anularidad, línea central y zonas
                                      de parcialidad; al tocar o pasar el ratón
                                      por un punto, cómo se ve desde allí
         #efemerides/luna-AAAA-MM-DD  eclipse de Luna: contactos y, en el globo,
                                      desde dónde se ve
         #efemerides/lluvia-…         ficha de una lluvia de meteoros
         #efemerides/cometa-…         ficha de un cometa
   Las fichas de lluvias y cometas se reutilizan en la Biblioteca (objetos.js).
   ========================================================================== */

import { cargarJSON, escaparHTML, icono, pestanas } from '../util.js';
import { leer, guardar } from '../almacen.js';
import * as F from '../calculos/efemerides.js';
import * as E from '../calculos/eclipses.js';
import * as A from '../calculos/astro.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI, MS_DIA = 86400000;
const COLOR = { eclipses: 'b8', meteoros: 'b6', luna: 'b3', planetas: 'b4', cometas: 'b7', estaciones: 'b2' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const estado = {
  categoria: leer('efemerides:categoria', 'todas'),
  destacados: leer('efemerides:destacados', true),
  meses: leer('efemerides:meses', 12),
};
let raiz = null, lugar = null, datos = null, globo = null, vista = null, sucesosVisibles = [];

/* ---------- Formato ---------- */
const hora = (f) => f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const horaSeg = (f) => f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fechaLarga = (f) => f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fechaCorta = (f) => f.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const num = (x, d = 1) => x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const coord = (lat, lon) => `${num(Math.abs(lat), 2)}° ${lat >= 0 ? 'N' : 'S'} · ${num(Math.abs(lon), 2)}° ${lon >= 0 ? 'E' : 'O'}`;
const minSeg = (s) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
const esNoche = () => document.documentElement.dataset.noche === 'si';
const isoLocal = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}T${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;

/* ==========================================================================
   Datos y cálculo (también los usan la portada, la Temporada y la Biblioteca)
   ========================================================================== */
export async function prepararDatos() {
  if (datos) return datos;
  const [ef, ec] = await Promise.all([cargarJSON('data/efemerides.json'), cargarJSON('data/eclipses.json')]);
  datos = { lluvias: ef.lluvias, cometas: ef.cometas, eclipses: ec.eclipses };
  return datos;
}

const cache = new Map();
/** Sucesos entre dos fechas desde un lugar (con memoria para no recalcular) */
export async function sucesosEntre(desde, hasta, sitio) {
  const d = await prepararDatos();
  const clave = `${desde.toDateString()}|${hasta.toDateString()}|${sitio.lat.toFixed(2)}|${sitio.lon.toFixed(2)}`;
  if (!cache.has(clave)) cache.set(clave, F.calcularSucesos({ desde, hasta, lugar: sitio, ...d }));
  return cache.get(clave);
}

/** Dónde lleva cada suceso: su ficha o el mapa del cielo en ese momento */
export function enlaceSuceso(s) {
  if (s.tipo === 'eclipse-sol' || s.tipo === 'eclipse-luna') return { href: `#efemerides/${s.ref}`, texto: 'Ver el eclipse' };
  if (s.tipo === 'lluvia' || s.tipo === 'cometa') return { href: `#efemerides/${s.ref}`, texto: 'Ver la ficha' };
  return { href: `#mapa/@${isoLocal(s.fecha)}`, texto: 'Ver el cielo' };
}

/* ==========================================================================
   Montaje
   ========================================================================== */
export async function montar(contenedor, parametro) {
  raiz = contenedor;
  const C = await import('./cielo.js');
  lugar = C.lugarActivo();
  await prepararDatos();
  raiz.addEventListener('click', alHacerClic);
  raiz.addEventListener('change', alCambiar);
  await actualizar(parametro);
  return { actualizar, desmontar };
}

function desmontar() {
  globo?.destruir(); globo = null;
  raiz.removeEventListener('click', alHacerClic);
  raiz.removeEventListener('change', alCambiar);
}

async function actualizar(parametro) {
  globo?.destruir(); globo = null;
  vista = parametro || 'lista';
  window.scrollTo(0, 0);
  if (!parametro) return pintarLista();
  if (parametro.startsWith('sol-')) return pintarEclipseSol(datos.eclipses.find((e) => e.id === parametro));
  if (parametro.startsWith('luna-')) return pintarEclipseLuna(parametro);
  if (parametro.startsWith('lluvia-')) return pintarFichaEnvuelta(fichaLluvia(datos.lluvias.find((l) => l.id === parametro), lugar));
  if (parametro.startsWith('cometa-')) return pintarFichaEnvuelta(fichaCometa(datos.cometas.find((c) => c.id === parametro)));
  pintarLista();
}

/* ==========================================================================
   LISTA
   ========================================================================== */
async function pintarLista() {
  raiz.innerHTML = `
    <section class="efemerides entrada">
      ${pestanas('cielo', 'efemerides')}
      <header class="modulo__cabecera">
        <span class="etiqueta">Cielo · Efemérides</span>
        <h1 class="titular">Lo que pasa <em>en el cielo</em>.</h1>
        <p class="entradilla">Eclipses, lluvias de meteoros, la Luna, los planetas, los cometas y las estaciones,
          calculados para ${escaparHTML(lugar.nombre)}. Horas en la zona horaria de tu dispositivo.</p>
      </header>
      <div class="panel efemerides__controles">
        <div class="filtros" role="group" aria-label="Categorías">
          ${[['todas', 'Todo'], ...Object.entries(F.CATEGORIAS)].map(([id, t]) => `<button class="chip chip--estado" type="button" data-categoria="${id}" aria-pressed="${estado.categoria === id}">${t}</button>`).join('')}
        </div>
        <div class="efemerides__opciones">
          <label class="interruptor"><input type="checkbox" id="ef-destacados" ${estado.destacados ? 'checked' : ''}><span>Solo lo destacado</span></label>
          <label class="orden-objetos"><span class="etiqueta">Periodo</span>
            <select id="ef-meses">${[3, 6, 12, 24, 36].map((m) => `<option value="${m}" ${m === estado.meses ? 'selected' : ''}>${m === 3 ? 'Próximos 3 meses' : `Próximos ${m} meses`}</option>`).join('')}</select>
          </label>
          <button class="boton-sec" type="button" data-accion="ics-todo">${icono('abajo')}Al calendario</button>
        </div>
      </div>
      <div id="ef-lista" aria-live="polite"><p class="nota">Calculando los sucesos…</p></div>
      <p class="nota">Eclipses de Sol: «Eclipse Predictions by Fred Espenak, NASA's GSFC». Cometas: JPL (NASA).
        Lluvias: calendario de la IMO. Lo demás se calcula en el propio dispositivo.</p>
    </section>`;
  await new Promise((r) => setTimeout(r, 30));            // que se vea «Calculando…» antes del cálculo
  await pintarSucesos();
}

async function pintarSucesos() {
  const caja = raiz.querySelector('#ef-lista');
  if (!caja) return;
  const desde = new Date(); desde.setHours(0, 0, 0, 0);
  const hasta = new Date(desde); hasta.setMonth(hasta.getMonth() + estado.meses);
  const todos = await sucesosEntre(desde, hasta, lugar);
  sucesosVisibles = todos.filter((s) => (estado.categoria === 'todas' || s.categoria === estado.categoria)
    && (!estado.destacados || s.importancia >= 2));
  if (!sucesosVisibles.length) { caja.innerHTML = '<div class="vacio"><p class="vacio__titulo">Nada en este periodo.</p><p>Prueba a quitar «Solo lo destacado» o a ampliar el periodo.</p></div>'; return; }
  const porMes = new Map();
  for (const s of sucesosVisibles) {
    const k = `${s.fecha.getFullYear()}-${s.fecha.getMonth()}`;
    if (!porMes.has(k)) porMes.set(k, []);
    porMes.get(k).push(s);
  }
  caja.innerHTML = [...porMes.values()].map((lista) => `
    <section class="ef-mes">
      <h2 class="ef-mes__titulo">${MESES[lista[0].fecha.getMonth()]} <span class="cifra">${lista[0].fecha.getFullYear()}</span></h2>
      <ul class="ef-lista">${lista.map(filaSuceso).join('')}</ul>
    </section>`).join('');
}

function filaSuceso(s) {
  const enlace = enlaceSuceso(s);
  return `
    <li class="ef-suceso ef-suceso--imp${s.importancia}" style="--color: var(--${COLOR[s.categoria]})">
      <div class="ef-suceso__fecha cifra"><b>${s.fecha.getDate()}</b><small>${s.fecha.toLocaleDateString('es-ES', { weekday: 'short' })}</small></div>
      <div class="ef-suceso__cuerpo">
        <span class="etiqueta">${F.CATEGORIAS[s.categoria]} · ${hora(s.fecha)}</span>
        <h3 class="ef-suceso__titulo">${escaparHTML(s.titulo)}</h3>
        ${s.texto ? `<p class="ef-suceso__texto">${escaparHTML(s.texto)}</p>` : ''}
        <div class="ef-suceso__acciones">
          <a class="enlace-flecha" href="${enlace.href}">${enlace.texto} ›</a>
          <button class="enlace-boton" type="button" data-ics="${escaparHTML(s.id)}" aria-label="Añadir «${escaparHTML(s.titulo)}» al calendario">${icono('abajo')}Calendario</button>
        </div>
      </div>
    </li>`;
}

/* ==========================================================================
   Envoltorio de las fichas de lluvias y cometas
   ========================================================================== */
function pintarFichaEnvuelta(contenido) {
  raiz.innerHTML = `
    <article class="ficha entrada" style="--color: var(--${contenido.color})">
      ${pestanas('cielo', 'efemerides')}
      <nav class="ficha__migas"><a href="#efemerides" class="ficha__volver">${icono('atras')}Efemérides</a></nav>
      ${contenido.html}
    </article>`;
}

/* ==========================================================================
   Ficha de una LLUVIA de meteoros (se usa también en la Biblioteca)
   ========================================================================== */
export function fichaLluvia(l, sitio) {
  if (!l) return { color: 'b6', html: '<p>Lluvia no encontrada.</p>' };
  const ahora = new Date();
  const picos = [];
  for (let anio = ahora.getFullYear(); picos.length < 3; anio++) {
    const pico = F.fechaLongitudSolar(l.lambda, anio);
    if (pico > new Date(ahora.getTime() - 2 * MS_DIA)) picos.push({ pico, noche: F.nocheDeLluvia(l, pico, sitio) });
  }
  const ej = l.thz * Math.sin(60 * RAD) * l.r ** (4 - 6.5);
  const html = `
    <header class="ficha__cabecera">
      <h1 class="ficha__titulo">${escaparHTML(l.nombre)}</h1>
      <p class="ficha__alias">Lluvia de meteoros · ${l.codigo} · radiante en ${escaparHTML(l.constelacion)}</p>
      <div class="ficha__regla-color"></div>
    </header>
    <dl class="datos cifra ficha-objeto__datos">
      <dt>Activa</dt><dd>del ${diaMes(l.actividad[0])} al ${diaMes(l.actividad[1])}</dd>
      <dt>Tasa horaria cenital</dt><dd>${l.thz} meteoros/hora (ideal)</dd>
      <dt>Velocidad</dt><dd>${l.velocidad} km/s</dd>
      <dt>Radiante</dt><dd>AR ${Math.floor(l.ar / 15)}h ${String(Math.round((l.ar / 15 % 1) * 60)).padStart(2, '0')}m · Dec ${l.dec >= 0 ? '+' : '−'}${Math.abs(l.dec)}°</dd>
      <dt>Su origen</dt><dd>${escaparHTML(l.progenitor)}</dd>
    </dl>
    <aside class="capa capa--analogia"><span class="etiqueta">Consejo</span><p>${escaparHTML(l.consejo)}</p></aside>
    <section class="ficha-objeto__fechas">
      <h2 class="panel__titulo">Próximos máximos desde ${escaparHTML(sitio.nombre)}</h2>
      <ul class="mejores-fechas">${picos.map(({ pico, noche }) => `
        <li>
          <span class="mejores-fechas__dia">${fechaLarga(pico)} · ${hora(pico)}</span>
          <span class="mejores-fechas__dato cifra">Luna ${Math.round(noche.iluminacion * 100)} % · <b class="calidad calidad--${noche.calidad}">${noche.calidad === 'buena' ? 'buen año' : noche.calidad === 'regular' ? 'año regular' : 'mal año'}</b></span>
          <span class="mejores-fechas__dato cifra">Por hora: ciudad ${Math.round(noche.tasas[4])} · afueras ${Math.round(noche.tasas[5])} · campo ${Math.round(noche.tasas[6])}${noche.mejorHora ? ` · mejor hacia las ${hora(noche.mejorHora)}` : ''}</span>
          <a class="boton-sec" href="#mapa/${l.id}@${isoLocal(noche.mejorHora || pico)}">${icono('cielo')}Ver el radiante</a>
        </li>`).join('')}</ul>
    </section>
    <aside class="capa capa--cuenta">
      <span class="etiqueta">La cuenta · cuántos verás de verdad</span>
      <p>La THZ es lo que vería un observador con el radiante en el cénit y un cielo perfecto (magnitud límite 6,5).
        En la realidad: <b>tasa = THZ · sen(altura del radiante) · r^(LM − 6,5)</b>, donde r = ${num(l.r)} es el índice de
        población (cuántas veces más meteoros hay por cada magnitud más débil) y LM la magnitud límite de tu cielo.
        Con el radiante a 60° desde una ciudad (LM 4): ${l.thz} · 0,87 · ${num(l.r)}^(−2,5) ≈ <b>${Math.round(ej)}</b> por hora.
        La Luna aclara el cielo y resta magnitud límite: por eso importa tanto la fase.</p>
      <p><a href="#glosario/tasa-horaria-cenital-thz">Tasa horaria cenital en el glosario ›</a></p>
    </aside>`;
  return { color: 'b6', html };
}
const diaMes = (md) => { const [m, d] = md.split('-').map(Number); return `${d} de ${MESES[m - 1]}`; };

/* ==========================================================================
   Ficha de un COMETA (se usa también en la Biblioteca)
   ========================================================================== */
export function fichaCometa(c) {
  if (!c) return { color: 'b7', html: '<p>Cometa no encontrado.</p>' };
  const ahora = new Date();
  const p = F.posicionCometa(c, ahora);
  const { perihelio, mejor } = F.mejorMomentoCometa(c);
  const orbita = c.e < 1 ? `elíptica · vuelve cada ${num((c.q / (1 - c.e)) ** 1.5)} años` : c.e < 1.001 ? 'casi parabólica: viene de la nube de Oort' : 'hiperbólica: no volverá';
  const filas = [];
  for (let d = -120; d <= 150; d += 15) {
    const f = new Date(perihelio.getTime() + d * MS_DIA);
    const q = F.posicionCometa(c, f);
    filas.push(`<tr${Math.abs(f - ahora) < 7.5 * MS_DIA ? ' class="es-hoy"' : ''}><td>${fechaCorta(f)}</td><td>${num(q.magnitud)}</td><td>${num(q.r, 2)}</td><td>${num(q.distancia, 2)}</td><td>${Math.round(q.elongacion)}°</td></tr>`);
  }
  const html = `
    <header class="ficha__cabecera">
      <h1 class="ficha__titulo">${escaparHTML(c.nombre)}</h1>
      <p class="ficha__alias">Cometa · órbita ${orbita}</p>
      <div class="ficha__regla-color"></div>
    </header>
    <dl class="datos cifra ficha-objeto__datos">
      <dt>Perihelio</dt><dd>${fechaLarga(perihelio)} · a ${num(c.q, 2)} UA del Sol</dd>
      <dt>Ahora</dt><dd>magnitud ${num(p.magnitud)} · a ${Math.round(p.elongacion)}° del Sol</dd>
      <dt>Distancias hoy</dt><dd>${num(p.r, 2)} UA del Sol · ${num(p.distancia, 2)} UA de la Tierra</dd>
      <dt>Posición hoy</dt><dd>AR ${Math.floor(p.ra / 15)}h ${String(Math.round((p.ra / 15 % 1) * 60)).padStart(2, '0')}m · Dec ${p.dec >= 0 ? '+' : '−'}${num(Math.abs(p.dec))}°</dd>
      ${mejor ? `<dt>Mejor momento</dt><dd>${fechaLarga(mejor.fecha)} · magnitud ${num(mejor.magnitud)} a ${Math.round(mejor.elongacion)}° del Sol</dd>` : ''}
      <dt>Órbita</dt><dd>e = ${num(c.e, 4)} · inclinación ${num(c.i)}°</dd>
    </dl>
    <aside class="capa capa--nota"><span class="etiqueta">Sobre este cometa</span><p>${escaparHTML(c.nota)}</p></aside>
    <section class="ficha-objeto__fechas">
      <h2 class="panel__titulo">Su paso, quincena a quincena</h2>
      <div class="tabla-desplazable"><table class="tabla-datos cifra">
        <thead><tr><th>Fecha</th><th>Mag.</th><th>Al Sol (UA)</th><th>A la Tierra (UA)</th><th>Del Sol</th></tr></thead>
        <tbody>${filas.join('')}</tbody>
      </table></div>
      <p class="nota">Magnitud total estimada m = M1 + 5·log Δ + K1·log r (M1 = ${num(c.M1)}, K1 = ${num(c.K1, 2)}, del JPL). Por debajo de 20–25° del Sol se pierde en el crepúsculo.
        Con el Seestar se llega a magnitud 12–13; a simple vista, hasta 5–6 en un cielo oscuro.</p>
    </section>
    <div class="ficha__acciones">
      <a class="boton-marca" href="#mapa/${c.id}@${isoLocal(mejor && Math.abs(mejor.fecha - ahora) < 200 * MS_DIA ? new Date(new Date(mejor.fecha).setHours(22, 0, 0, 0)) : ahora)}">${icono('cielo')}<span>Ver en el mapa celeste</span></a>
    </div>
    <p class="nota">Órbita: JPL Horizons (NASA), elementos osculadores cerca del perihelio. Los cometas no son tan predecibles como los planetas: su brillo puede sorprender.</p>`;
  return { color: 'b7', html };
}

/* ==========================================================================
   ECLIPSE DE SOL con el globo
   ========================================================================== */
async function pintarEclipseSol(ec) {
  if (!ec) return pintarLista();
  const { crearGlobo } = await import('../globo.js');
  const fr = E.franja(ec);
  const [a, m, d] = ec.fecha.split('-').map(Number);
  const [h, mi, se] = ec.maxima.horaUT.split(':').map(Number);
  const maximo = new Date(Date.UTC(a, m - 1, d, h, mi, se));
  const local = E.circunstanciasLocales(ec, lugar.lat, lugar.lon);
  const cerca = fr.central.length ? E.puntoCentralMasCercano(fr, lugar.lat, lugar.lon) : null;
  const enCerca = cerca && E.circunstanciasLocales(ec, cerca.lat, cerca.lon);
  const pasado = maximo < new Date();
  const tipoTxt = { total: 'total', anular: 'anular', híbrido: 'híbrido (total y anular)', parcial: 'parcial' }[ec.tipo];

  raiz.innerHTML = `
    <article class="ficha eclipse entrada" style="--color: var(--b8)">
      ${pestanas('cielo', 'efemerides')}
      <nav class="ficha__migas"><a href="#efemerides" class="ficha__volver">${icono('atras')}Efemérides</a>
        <span class="ficha__bloque cifra">Saros ${ec.saros}</span></nav>
      <header class="ficha__cabecera">
        <h1 class="ficha__titulo">Eclipse ${tipoTxt} de Sol</h1>
        <p class="ficha__alias">${fechaLarga(maximo)}${pasado ? ' · ya ocurrió' : ''}</p>
        <div class="ficha__regla-color"></div>
      </header>

      <section class="panel eclipse__aqui">
        <h2 class="panel__titulo">Desde ${escaparHTML(lugar.nombre)}</h2>
        ${htmlCircunstancias(local)}
      </section>

      <section class="eclipse__globo-caja">
        <div class="globo" id="globo"></div>
        <p class="eclipse__info cifra" id="globo-info" role="status">Toca el globo (o pasa el ratón) para ver cómo se ve el eclipse desde cualquier punto.</p>
        <div class="eclipse__botones">
          <button class="boton-sec" type="button" data-ir="lugar">${icono('cielo')}Mi lugar</button>
          ${ec.maxima.anchuraKm ? '<button class="boton-sec" type="button" data-ir="franja">Ir a la franja</button>' : ''}
          ${cerca ? '<button class="boton-sec" type="button" data-ir="cerca">Lo más cerca en la franja</button>' : ''}
          <button class="boton-sec" type="button" data-accion="png-globo">${icono('abajo')}Imagen</button>
          <button class="boton-sec" type="button" data-ics="${ec.id}">${icono('abajo')}Calendario</button>
        </div>
        <div class="mapa__leyenda eclipse__leyenda" aria-label="Leyenda">
          ${ec.maxima.anchuraKm ? `<span><i class="ley-zona ley-zona--${ec.tipo === 'anular' ? 'anular' : 'total'}"></i>Franja de ${ec.tipo === 'anular' ? 'anularidad' : 'totalidad'}</span><span><i class="ley-linea"></i>Línea central</span>` : ''}
          <span><i class="ley-zona ley-zona--parcial"></i>Parcial (más intenso, más tapado)</span>
          <span><i class="ley ley--planeta"></i>Tu lugar</span>
        </div>
      </section>

      ${cerca ? `
      <section class="panel">
        <h2 class="panel__titulo">Dónde ponerse</h2>
        <p>El punto de la línea central más cercano a ${escaparHTML(lugar.nombre)} está a <b>${Math.round(cerca.distancia).toLocaleString('es-ES')} km</b>
          (${coord(cerca.lat, cerca.lon)}). Allí el eclipse es <b>${enCerca?.tipo}</b>${enCerca?.duracion ? ` durante <b>${minSeg(enCerca.duracion)}</b>` : ''},
          a las ${hora(cerca.fecha)}, con el Sol a ${Math.round(enCerca?.altura ?? 0)}° de altura.
          Sobre la línea central la ${ec.tipo === 'anular' ? 'anularidad' : 'totalidad'} dura más; hacia los bordes de la franja se acorta hasta desaparecer.</p>
      </section>` : ''}

      <dl class="datos cifra ficha-objeto__datos">
        <dt>Máximo del eclipse</dt><dd>${hora(maximo)} (${ec.maxima.horaUT} UT) en ${coord(ec.maxima.lat, ec.maxima.lon)}</dd>
        ${ec.maxima.duracionS ? `<dt>Duración máxima</dt><dd>${minSeg(ec.maxima.duracionS)}</dd>` : ''}
        ${ec.maxima.anchuraKm ? `<dt>Anchura de la franja</dt><dd>${Math.round(ec.maxima.anchuraKm)} km</dd>` : ''}
        <dt>Magnitud</dt><dd>${num(ec.magnitud, 4)}${ec.maxima.anchuraKm ? ' (diámetro de la Luna ÷ el del Sol)' : ' (fracción del diámetro del Sol cubierta)'}</dd>
        <dt>Gamma</dt><dd>${num(ec.gamma, 4)} (distancia del eje de la sombra al centro de la Tierra, en radios terrestres)</dd>
      </dl>
      <aside class="capa capa--aviso"><span class="etiqueta">Seguridad</span>
        <p>Nunca mires el Sol sin protección: ni a simple vista ni por el telescopio. Usa gafas de eclipse homologadas (ISO 12312-2)
          y, en el Seestar, su filtro solar. Solo durante la totalidad, y solo entonces, se puede mirar sin filtro.</p></aside>
      <p class="nota">Elementos besselianos: «Eclipse Predictions by Fred Espenak, NASA's GSFC». La franja se calcula en el dispositivo
        a partir de ellos (precisión de pocos km; los bordes reales varían 1–2 km por el relieve de la Luna).
        <a href="#glosario/franja-de-totalidad">Franja de totalidad en el glosario ›</a></p>
    </article>`;

  // --- El globo ---
  const caja = raiz.querySelector('#globo');
  const centro = cerca && cerca.distancia < 3000 ? { lat: (cerca.lat + lugar.lat) / 2, lon: (cerca.lon + lugar.lon) / 2 } : { lat: ec.maxima.lat, lon: ec.maxima.lon };
  const info = raiz.querySelector('#globo-info');
  const describir = (q) => {
    if (!q) return;
    const c = E.circunstanciasLocales(ec, q.lat, q.lon);
    info.innerHTML = `<b>${coord(q.lat, q.lon)}</b> · ${!c || c.altura < 0 ? 'aquí no se ve el eclipse'
      : c.tipo === 'parcial' ? `parcial: ${Math.round(c.oscurecimiento * 100)} % del Sol tapado a las ${hora(c.maximo)}, Sol a ${Math.round(c.altura)}°`
      : `<b>${c.tipo}</b> durante ${minSeg(c.duracion)}, de ${horaSeg(c.c2)} a ${horaSeg(c.c3)}, Sol a ${Math.round(c.altura)}°`}`;
  };
  globo = await crearGlobo(caja, {
    centro, zoom: cerca && cerca.distancia < 3000 ? 3 : 1.3, etiqueta: 'Globo con la franja del eclipse',
    alPasar: describir,
    alTocar: (lat, lon) => {
      describir({ lat, lon });
      globo.ponerCapas({ marcas: [...marcasBase, { lat, lon, tipo: 'punto', texto: '' }] });
    },
  });
  if (vista !== ec.id) { globo.destruir(); globo = null; return; }
  const marcasBase = [{ lat: lugar.lat, lon: lugar.lon, texto: lugar.nombre }];
  let rejilla = E.rejillaMagnitud(ec, 1);           // primero una rejilla rápida de 1°…
  const capaTextura = (c, { rellenar, TW, TH }) => {
      const noche = esNoche();                         // se pregunta en cada dibujo: cambia con el modo noche
      // Parcialidad: rejilla de magnitudes, suavizada al ampliarla
      const can = document.createElement('canvas'); can.width = rejilla.ancho; can.height = rejilla.alto;
      const cc = can.getContext('2d'); const img = cc.createImageData(rejilla.ancho, rejilla.alto);
      for (let i = 0; i < rejilla.datos.length; i++) {
        const mg = Math.min(1, rejilla.datos[i]);
        if (mg <= 0) continue;
        const escalon = Math.ceil(mg * 5) / 5;                       // bandas del 20 %: se leen como curvas de nivel
        img.data.set(noche ? [255, 60 + 60 * (1 - escalon), 0, 50 + 150 * escalon] : [255, 200 - 90 * escalon, 60, 45 + 150 * escalon], i * 4);
      }
      cc.putImageData(img, 0, 0);
      c.imageSmoothingEnabled = true;
      c.drawImage(can, 0, 0, TW, TH);
      // Franja de totalidad / anularidad
      for (const tramo of fr.banda) {
        for (const tipo of ['total', 'anular']) {
          const trozos = [];
          let actual = [];
          for (const b of tramo) { if (b.tipo === tipo) actual.push(b); else if (actual.length) { trozos.push(actual); actual = []; } }
          if (actual.length) trozos.push(actual);
          for (const t of trozos) {
            if (t.length < 2) continue;
            c.fillStyle = noche ? (tipo === 'total' ? '#000000' : '#5a0d00') : (tipo === 'total' ? 'rgba(20,10,45,0.92)' : 'rgba(150,40,10,0.85)');
            rellenar([...t.map((b) => b.n), ...t.slice().reverse().map((b) => b.s)]);
          }
        }
      }
  };
  globo.ponerCapas({
    textura: capaTextura,
    lineas: [
      ...fr.central.map((t) => ({ puntos: t, color: () => (esNoche() ? '#ff3300' : '#f2d27a'), ancho: 1.6, discontinua: true })),
      ...[...fr.norte, ...fr.sur].map((t) => ({ puntos: t, color: () => (esNoche() ? '#c41a00' : '#c9a4ff'), ancho: 1.2 })),
    ],
    marcas: marcasBase,
  });
  // …y después, en segundo plano y por partes, una de 0,5° que deja los bordes más suaves
  rejillaPorPartes(ec, 0.5, () => vista === ec.id).then((fina) => {
    if (!fina || vista !== ec.id || !globo) return;
    rejilla = fina;
    globo.ponerCapas({ textura: capaTextura });
  });
  raiz.querySelector('.eclipse__botones').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir]');
    if (!b) return;
    if (b.dataset.ir === 'lugar') globo.irA(lugar.lat, lugar.lon, Math.max(globo.vista.zoom, 4));
    if (b.dataset.ir === 'franja') globo.irA(ec.maxima.lat, ec.maxima.lon, 2.5);
    if (b.dataset.ir === 'cerca') { globo.irA(cerca.lat, cerca.lon, 8); describir(cerca); globo.ponerCapas({ marcas: [...marcasBase, { lat: cerca.lat, lon: cerca.lon, tipo: 'punto', texto: 'Línea central' }] }); }
  });
}

/** Como E.rejillaMagnitud, pero cediendo el paso a la pantalla cada pocas filas; se abandona si `sigue()` es falso */
async function rejillaPorPartes(ec, paso, sigue) {
  const ancho = Math.round(360 / paso), alto = Math.round(180 / paso);
  const datos = new Float32Array(ancho * alto);
  for (let j = 0; j < alto; j++) {
    const lat = 90 - (j + 0.5) * paso;
    for (let i = 0; i < ancho; i++) {
      const c = E.circunstanciasLocales(ec, lat, -180 + (i + 0.5) * paso);
      datos[j * ancho + i] = c && c.altura > -1 ? Math.max(0, c.magnitud) : 0;
    }
    if (j % 12 === 11) { await new Promise((r) => setTimeout(r, 0)); if (!sigue()) return null; }
  }
  return { ancho, alto, paso, datos };
}

function htmlCircunstancias(c) {
  if (!c || c.altura < 0) return '<p>Desde aquí <b>no se ve</b>: la sombra de la Luna no pasa por tu cielo, o el Sol está bajo el horizonte. Mira en el globo adónde habría que ir.</p>';
  const central = c.tipo !== 'parcial';
  return `
    <p class="eclipse__resumen">${central ? `¡Eclipse <b>${c.tipo}</b> durante <b>${minSeg(c.duracion)}</b>!` : `Eclipse <b>parcial</b>: la Luna tapa el <b>${Math.round(c.oscurecimiento * 100)} %</b> del Sol.`}</p>
    <dl class="datos cifra ficha-objeto__datos">
      <dt>Empieza</dt><dd>${horaSeg(c.c1)}</dd>
      ${central ? `<dt>${c.tipo === 'total' ? 'Totalidad' : 'Anillo'}</dt><dd>de ${horaSeg(c.c2)} a ${horaSeg(c.c3)}</dd>` : ''}
      <dt>Máximo</dt><dd>${horaSeg(c.maximo)} · Sol a ${Math.round(c.altura)}° de altura</dd>
      <dt>Termina</dt><dd>${horaSeg(c.c4)}</dd>
      <dt>Magnitud</dt><dd>${num(c.magnitud, 3)} · oscurecimiento ${num(c.oscurecimiento * 100)} %</dd>
    </dl>`;
}

/* ==========================================================================
   ECLIPSE DE LUNA con el globo de visibilidad
   ========================================================================== */
async function pintarEclipseLuna(id) {
  const fecha = new Date(id.slice(5) + 'T00:00:00Z');
  const ec = F.eclipsesLuna(new Date(fecha.getTime() - MS_DIA), new Date(fecha.getTime() + 2 * MS_DIA)).find((x) => x.id === id);
  if (!ec) return pintarLista();
  const { crearGlobo } = await import('../globo.js');
  const vis = F.visibilidadEclipseLuna(ec, lugar.lat, lugar.lon);
  const CONTACTOS = [['p1', 'Entra en la penumbra'], ['u1', 'Empieza la parcialidad'], ['u2', 'Empieza la totalidad'], ['maximo', 'Máximo'],
    ['u3', 'Acaba la totalidad'], ['u4', 'Acaba la parcialidad'], ['p4', 'Sale de la penumbra']].filter(([k]) => ec[k]);
  raiz.innerHTML = `
    <article class="ficha eclipse entrada" style="--color: var(--b8)">
      ${pestanas('cielo', 'efemerides')}
      <nav class="ficha__migas"><a href="#efemerides" class="ficha__volver">${icono('atras')}Efemérides</a></nav>
      <header class="ficha__cabecera">
        <h1 class="ficha__titulo">Eclipse ${ec.tipo} de Luna</h1>
        <p class="ficha__alias">${fechaLarga(ec.maximo)}${ec.maximo < new Date() ? ' · ya ocurrió' : ''}</p>
        <div class="ficha__regla-color"></div>
      </header>
      <section class="panel">
        <h2 class="panel__titulo">Desde ${escaparHTML(lugar.nombre)}: ${vis.resumen}</h2>
        <ul class="mejores-fechas">${CONTACTOS.map(([k, t]) => `
          <li><span class="mejores-fechas__dia">${t}</span>
            <span class="mejores-fechas__dato cifra">${horaSeg(ec[k])} · Luna ${vis.alturas[k] > 0 ? `a ${Math.round(vis.alturas[k])}°` : 'bajo el horizonte'}</span></li>`).join('')}</ul>
      </section>
      <section class="eclipse__globo-caja">
        <div class="globo" id="globo"></div>
        <p class="eclipse__info cifra" id="globo-info" role="status">Toca el globo para ver desde dónde se ve.</p>
        <div class="eclipse__botones">
          <button class="boton-sec" type="button" data-ir="lugar">${icono('cielo')}Mi lugar</button>
          <button class="boton-sec" type="button" data-ics="${ec.id}">${icono('abajo')}Calendario</button>
        </div>
        <div class="mapa__leyenda eclipse__leyenda">
          <span><i class="ley-zona ley-zona--le"></i>Se ve entero</span>
          <span><i class="ley-zona ley-zona--lm"></i>Se ve el máximo</span>
          <span><i class="ley-zona ley-zona--lp"></i>Se ve en parte</span>
        </div>
      </section>
      <dl class="datos cifra ficha-objeto__datos">
        <dt>Magnitud umbral</dt><dd>${num(ec.magUmbral, 3)}${ec.magUmbral >= 1 ? ' (toda la Luna dentro de la umbra)' : ''}</dd>
        <dt>Magnitud penumbral</dt><dd>${num(ec.magPenumbral, 3)}</dd>
        ${ec.duracionTotal ? `<dt>Totalidad</dt><dd>${Math.round(ec.duracionTotal)} min</dd>` : ''}
        ${ec.duracionParcial ? `<dt>Fase parcial (con la total)</dt><dd>${Math.round(ec.duracionParcial)} min</dd>` : ''}
      </dl>
      <aside class="capa capa--nota"><span class="etiqueta">Para fotografiarlo</span>
        <p>A diferencia del de Sol, un eclipse de Luna se mira sin ningún filtro. Durante la totalidad la Luna se oscurece muchísimo
          (hasta 10 000 veces): alarga la exposición o sube la ganancia, y con el Seestar prueba el modo Luna o tomas de varios segundos.</p></aside>
      <p class="nota">Calculado con el algoritmo de Meeus (cap. 54): precisión de 1–2 minutos.
        <a href="#glosario/eclipse-de-luna">Eclipse de Luna en el glosario ›</a></p>
    </article>`;

  const info = raiz.querySelector('#globo-info');
  const describir = (q) => {
    if (!q) return;
    const v = F.visibilidadEclipseLuna(ec, q.lat, q.lon);
    info.innerHTML = `<b>${coord(q.lat, q.lon)}</b> · ${v.resumen === 'no visible' ? 'desde aquí no se ve' : `se ve ${v.resumen}; en el máximo la Luna está a ${Math.round(v.alturas.maximo)}°`}`;
  };
  const l = A.posicionLuna(ec.maximo);
  const subLon = ((l.ra - A.tiempoSidereoLocal(ec.maximo, 0) + 540) % 360) - 180;
  globo = await crearGlobo(raiz.querySelector('#globo'), {
    centro: { lat: l.dec, lon: subLon }, zoom: 1, etiqueta: 'Globo con la visibilidad del eclipse de Luna',
    alPasar: describir,
    alTocar: (lat, lon) => { describir({ lat, lon }); globo.ponerCapas({ marcas: [{ lat: lugar.lat, lon: lugar.lon, texto: lugar.nombre }, { lat, lon, tipo: 'punto' }] }); },
  });
  if (vista !== id) { globo.destruir(); globo = null; return; }
  // Visibilidad en una rejilla de 1°: altura de la Luna al principio, en el máximo y al final
  const instantes = [ec.u1 || ec.p1, ec.maximo, ec.u4 || ec.p4].map((f) => ({ l: A.posicionLuna(f), gmst: A.tiempoSidereoLocal(f, 0) }));
  globo.ponerCapas({
    textura: (c, { TW, TH }) => {
      const noche = esNoche();
      const can = document.createElement('canvas'); can.width = 360; can.height = 180;
      const cc = can.getContext('2d'); const img = cc.createImageData(360, 180);
      for (let j = 0; j < 180; j++) {
        const lat = 89.5 - j, sl = Math.sin(lat * RAD), cl = Math.cos(lat * RAD);
        for (let i = 0; i < 360; i++) {
          const lon = -179.5 + i;
          const arriba = instantes.map(({ l: q, gmst }) => sl * Math.sin(q.dec * RAD) + cl * Math.cos(q.dec * RAD) * Math.cos((gmst + lon - q.ra) * RAD) > 0);
          const nivel = arriba[0] && arriba[2] ? 3 : arriba[1] ? 2 : arriba[0] || arriba[2] ? 1 : 0;
          if (!nivel) continue;
          const col = noche ? [[0, 0, 0, 0], [255, 40, 0, 50], [255, 40, 0, 100], [255, 40, 0, 160]][nivel]
            : [[0, 0, 0, 0], [255, 190, 90, 60], [240, 120, 50, 110], [190, 40, 30, 150]][nivel];
          img.data.set(col, (j * 360 + i) * 4);
        }
      }
      cc.putImageData(img, 0, 0);
      c.imageSmoothingEnabled = true;
      c.drawImage(can, 0, 0, TW, TH);
    },
    marcas: [{ lat: lugar.lat, lon: lugar.lon, texto: lugar.nombre }, { lat: l.dec, lon: subLon, texto: 'Luna en el cénit', color: esNoche() ? '#ff3300' : '#f1e8d2' }],
  });
  raiz.querySelector('.eclipse__botones').addEventListener('click', (e) => {
    if (e.target.closest('[data-ir="lugar"]')) globo.irA(lugar.lat, lugar.lon, Math.max(globo.vista.zoom, 3));
  });
}

/* ==========================================================================
   Calendario (.ics) y eventos
   ========================================================================== */
async function descargar(blob, nombre) {
  const archivo = new File([blob], nombre, { type: blob.type });
  if (navigator.canShare?.({ files: [archivo] }) && matchMedia('(pointer: coarse)').matches) {
    await navigator.share({ files: [archivo], title: nombre }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function exportarICS(ids) {
  const desde = new Date(); desde.setHours(0, 0, 0, 0);
  const hasta = new Date(desde); hasta.setMonth(hasta.getMonth() + 36);
  // Los eclipses pasados también se pueden exportar desde su página: se buscan en un margen amplio
  const todos = await sucesosEntre(new Date(desde.getTime() - 800 * MS_DIA), hasta, lugar);
  const lista = ids ? todos.filter((s) => ids.includes(s.id)) : sucesosVisibles;
  if (!lista.length) return;
  const texto = F.generarICS(lista);
  const nombre = lista.length === 1 ? `astrokit-${lista[0].id}.ics` : 'astrokit-efemerides.ics';
  descargar(new Blob([texto], { type: 'text/calendar' }), nombre);
}

function alHacerClic(e) {
  const cat = e.target.closest('[data-categoria]');
  if (cat) {
    estado.categoria = cat.dataset.categoria; guardar('efemerides:categoria', estado.categoria);
    raiz.querySelectorAll('[data-categoria]').forEach((b) => b.setAttribute('aria-pressed', String(b === cat)));
    return pintarSucesos();
  }
  const ics = e.target.closest('[data-ics]');
  if (ics) return exportarICS([ics.dataset.ics]);
  const acc = e.target.closest('[data-accion]');
  if (acc?.dataset.accion === 'ics-todo') return exportarICS(null);
  if (acc?.dataset.accion === 'png-globo' && globo) globo.aImagen().then((b) => descargar(b, `astrokit-${vista}.png`));
}
function alCambiar(e) {
  if (e.target.id === 'ef-destacados') { estado.destacados = e.target.checked; guardar('efemerides:destacados', estado.destacados); pintarSucesos(); }
  if (e.target.id === 'ef-meses') { estado.meses = Number(e.target.value); guardar('efemerides:meses', estado.meses); pintarSucesos(); }
}
