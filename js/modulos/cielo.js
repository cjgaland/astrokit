/* ==========================================================================
   modulos/cielo.js — Módulo 3: Planificador
   --------------------------------------------------------------------------
   Para un LUGAR y una NOCHE calcula, sin internet:
     · la fase de la Luna, su salida y su puesta, y las próximas nueva y llena
     · la línea de tiempo de la noche: puesta de Sol, crepúsculos civil,
       náutico y astronómico, y la ventana oscura sin Luna
     · los objetos de data/objetos.json recomendados para esa noche, con su
       altura máxima, la hora de culminación y el tiempo útil (por encima de
       30° con noche astronómica)

   Lugares: "Casa (Córdoba)", los que añadas tú y "Mi posición" (GPS del móvil).
   Se guardan solo en este dispositivo.

   Todas las cuentas están en js/calculos/astro.js.
   ========================================================================== */

import * as A from '../calculos/astro.js';
import { cargarJSON, escaparHTML, icono } from '../util.js';
import { leer, guardar } from '../almacen.js';

/* ---------- Estado ---------- */
// Coordenadas redondeadas a propósito (≈ 1–2 km): de sobra para la astronomía
// y sin publicar una dirección exacta en un repositorio público.
const LUGARES_INICIALES = [
  { id: 'casa', nombre: 'Casa (Córdoba)', lat: 37.89, lon: -4.77 },
];
const estado = {
  lugares: leer('cielo:lugares', LUGARES_INICIALES),
  lugarId: leer('cielo:lugar', 'casa'),
  gpsAlAbrir: leer('cielo:gpsAlAbrir', true),
  fecha: null,                 // 'AAAA-MM-DD' o null = hoy
  tipo: 'todos',               // filtro de objetos
  abierto: null,               // id del objeto desplegado
  editando: false,
};
const guardarLugares = () => {
  guardar('cielo:lugares', estado.lugares);
  guardar('cielo:lugar', estado.lugarId);
};

const ALTURA_UTIL = 30;        // por debajo de 30° la atmósfera estropea la imagen
const PASO = 10;               // minutos entre muestras
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TIPOS = [
  { id: 'todos', texto: 'Todos' },
  { id: 'galaxia', texto: 'Galaxias' },
  { id: 'nebulosa', texto: 'Nebulosas' },
  { id: 'cumulo', texto: 'Cúmulos' },
];
const NOMBRE_TIPO = {
  'galaxia': 'Galaxia', 'nebulosa-emision': 'Neb. de emisión', 'nebulosa-reflexion': 'Neb. de reflexión',
  'nebulosa-planetaria': 'Neb. planetaria', 'remanente': 'Remanente', 'cumulo-abierto': 'Cúmulo abierto',
  'cumulo-globular': 'Cúmulo globular',
};
// Objetos cuya luz sale en líneas de emisión: el filtro dual (Hα + OIII) los salva con Luna
const DE_EMISION = new Set(['nebulosa-emision', 'remanente', 'nebulosa-planetaria']);

let objetos = [];
let raiz = null;
let noche = null;              // resultados del último cálculo

/* ---------- Formato ---------- */
const hora = (f) => f ? f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—';
const fechaCorta = (f) => f.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const grados = (x, dec = 0) => x.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '°';
const duracion = (min) => {
  if (min <= 0) return '0 min';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')} min` : ''}` : `${m} min`;
};
const coordenadas = (l) =>
  `${grados(Math.abs(l.lat), 2)} ${l.lat >= 0 ? 'N' : 'S'} · ${grados(Math.abs(l.lon), 2)} ${l.lon >= 0 ? 'E' : 'O'}`;
const num = (t) => parseFloat(String(t).replace(',', '.'));

/** 'AAAA-MM-DD' de una fecha en hora local */
function aTextoFecha(f) {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}
/** Mediodía local del día elegido: la "noche de hoy" va de este mediodía al siguiente */
function mediodiaElegido() {
  const [a, m, d] = (estado.fecha || aTextoFecha(new Date())).split('-').map(Number);
  return new Date(a, m - 1, d, 12, 0, 0);
}
function lugarActivo() {
  return estado.lugares.find((l) => l.id === estado.lugarId) || estado.lugares[0];
}

/* ==========================================================================
   Montaje
   ========================================================================== */
export async function montar(contenedor) {
  raiz = contenedor;
  ({ objetos } = await cargarJSON('data/objetos.json'));
  objetos = objetos.filter((o) => o.ar !== undefined);

  pintarEsqueleto();
  raiz.addEventListener('click', alHacerClic);
  raiz.addEventListener('change', alCambiar);
  recalcular();
  if (estado.gpsAlAbrir) pedirGPS(true);
  return { desmontar };
}

function desmontar() {
  raiz.removeEventListener('click', alHacerClic);
  raiz.removeEventListener('change', alCambiar);
}

/* ==========================================================================
   Cálculo de la noche
   ========================================================================== */
function calcularNoche() {
  const lugar = lugarActivo();
  const { lat, lon } = lugar;
  const mediodia = mediodiaElegido();
  const s = A.sucesosNoche(mediodia, lat, lon);

  // Ventana que se dibuja: de 1 h antes de la puesta a 1 h después de la salida del Sol
  const H = 3600000;
  const desde = new Date((s.puesta.inicio?.getTime() ?? mediodia.getTime() + 6 * H) - H);
  const hasta = new Date((s.puesta.fin?.getTime() ?? mediodia.getTime() + 20 * H) + H);

  // Noche astronómica (Sol < −18°). Si no la hay (verano en latitudes altas), no hay "útil"
  const oscIni = s.astronomico.inicio?.getTime() ?? null;
  const oscFin = s.astronomico.fin?.getTime() ?? null;
  const esOscuro = (t) => oscIni !== null && t >= oscIni && t <= oscFin;

  const sol = A.muestrear((t) => A.alturaSol(t, lat, lon), desde, hasta, 5);
  const luna = A.muestrear((t) => A.alturaLuna(t, lat, lon), desde, hasta, PASO);
  const lunaArriba = (t) => {
    const i = Math.round((t - desde.getTime()) / (PASO * 60000));
    return (luna[i]?.alt ?? -90) > 0;
  };

  // Fase a medianoche (la mitad de la noche, aproximadamente)
  const medianoche = new Date(mediodia.getTime() + 12 * H);
  const fase = A.faseLunar(medianoche);
  const posLuna = A.posicionLuna(medianoche);

  // Minutos de oscuridad total sin Luna
  let oscuroSinLuna = 0;
  for (const p of luna) if (esOscuro(p.t) && p.alt <= 0) oscuroSinLuna += PASO;

  // Cada objeto: curva de altura, tiempo útil, culminación, mejor mes, distancia a la Luna
  const lista = objetos.map((o) => {
    const ra = o.ar * 15;                                       // horas → grados
    const curva = A.muestrear((t) => A.altAz(ra, o.dec, lat, lon, t).alt, desde, hasta, PASO);
    let util = 0, utilSinLuna = 0;
    for (const p of curva) {
      if (esOscuro(p.t) && p.alt >= ALTURA_UTIL) {
        util += PASO;
        if (!lunaArriba(p.t)) utilSinLuna += PASO;
      }
    }
    const conLuna = util - utilSinLuna;
    // Puntuación para ordenar: el tiempo sin Luna vale entero; el tiempo con Luna vale
    // más o menos según lo iluminada que esté y si el objeto admite filtro dual
    const pesoLuna = DE_EMISION.has(o.tipo) ? 0.8 : Math.max(0, 1 - fase.iluminada * 1.6);
    return {
      o, curva, util, utilSinLuna, conLuna,
      puntos: utilSinLuna + conLuna * pesoLuna,
      altMax: A.alturaMaxima(o.dec, lat),
      culmina: A.proximaCulminacion(ra, lon, mediodia),
      mejorMes: mejorMes(ra, lon),
      distLuna: separacion(ra, o.dec, posLuna.ra, posLuna.dec),
    };
  });
  lista.sort((a, b) => b.puntos - a.puntos || b.altMax - a.altMax);

  return {
    lugar, mediodia, s, desde, hasta, sol, luna, fase, oscuroSinLuna,
    nueva: A.proximaFase(mediodia, 0),
    llena: A.proximaFase(mediodia, 180),
    objetos: lista,
  };
}

/** Mes en que el objeto culmina hacia medianoche (su "temporada") */
function mejorMes(ra, lon) {
  const año = new Date().getFullYear();
  let mejor = 0, menor = 999;
  for (let m = 0; m < 12; m++) {
    const H = Math.abs(((A.tiempoSidereoLocal(new Date(año, m, 15, 0, 0), lon) - ra + 540) % 360) - 180);
    if (H < menor) { menor = H; mejor = m; }
  }
  return MESES[mejor];
}

/** Separación angular entre dos puntos del cielo (fórmula del coseno esférico) */
function separacion(ra1, dec1, ra2, dec2) {
  const r = Math.PI / 180;
  const c = Math.sin(dec1 * r) * Math.sin(dec2 * r) + Math.cos(dec1 * r) * Math.cos(dec2 * r) * Math.cos((ra1 - ra2) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
}

/* ==========================================================================
   Pintar
   ========================================================================== */
function pintarEsqueleto() {
  raiz.innerHTML = `
    <section class="cielo entrada">
      <header class="modulo__cabecera">
        <span class="etiqueta">Módulo 03 · Planificador</span>
        <h1 class="titular">El cielo <em>de esta noche</em>.</h1>
        <p class="entradilla" id="subtitulo-noche"></p>
      </header>

      <section class="panel panel--lugar">
        <div class="lugar">
          <div class="lugar__fila">
            <div class="selector-lugar" id="selector-lugar" role="group" aria-label="Lugar"></div>
            <button class="boton-sec" type="button" data-accion="gps">${icono('cielo')}Mi posición</button>
            <button class="boton-icono" type="button" data-accion="editar" aria-label="Editar lugares" title="Editar lugares">${icono('cuaderno')}</button>
          </div>
          <p class="lugar__coordenadas cifra" id="coordenadas"></p>
          <p class="lugar__estado" id="estado-gps" aria-live="polite"></p>
          <div id="editor-lugar"></div>
        </div>
        <div class="fecha">
          <button class="boton-icono" type="button" data-accion="dia-" aria-label="Noche anterior">${icono('atras')}</button>
          <input type="date" id="fecha" aria-label="Fecha de la noche">
          <button class="boton-icono" type="button" data-accion="dia+" aria-label="Noche siguiente">${icono('sig')}</button>
          <button class="boton-sec" type="button" data-accion="hoy">Hoy</button>
        </div>
      </section>

      <div class="noche">
        <section class="panel luna" id="luna"></section>
        <section class="panel linea" id="linea"></section>
      </div>

      <section class="panel panel--sin-caja">
        <div class="panel__fila">
          <h2 class="panel__titulo"><span class="panel__num">03</span><span id="titulo-objetos">Objetos recomendados</span></h2>
          <div class="filtros" role="group" aria-label="Tipo de objeto">
            ${TIPOS.map((t) => `<button class="chip chip--estado" type="button" data-tipo="${t.id}">${t.texto}</button>`).join('')}
          </div>
        </div>
        <p class="nota">Ordenados por tiempo útil: por encima de ${ALTURA_UTIL}° y con noche astronómica, dando prioridad a las horas sin Luna. Toca un objeto para ver su curva de altura.</p>
        <div id="objetos"></div>
      </section>
    </section>`;
}

function recalcular() {
  noche = calcularNoche();
  pintarLugar();
  pintarLuna();
  pintarLinea();
  pintarObjetos();
}

/* ---------- Lugar y fecha ---------- */
function pintarLugar() {
  const l = lugarActivo();
  raiz.querySelector('#selector-lugar').innerHTML = estado.lugares.map((x) => `
    <button class="chip" type="button" data-lugar="${x.id}" aria-pressed="${x.id === l.id}">
      ${x.id === 'gps' ? icono('cielo') : ''}${escaparHTML(x.nombre)}
    </button>`).join('');
  raiz.querySelector('#coordenadas').textContent =
    coordenadas(l) + (l.actualizado ? ` · GPS ${new Date(l.actualizado).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '');
  raiz.querySelector('#fecha').value = aTextoFecha(noche.mediodia);

  const manana = new Date(noche.mediodia.getTime() + 86400000);
  raiz.querySelector('#subtitulo-noche').textContent =
    `Noche del ${noche.mediodia.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })} al ` +
    `${manana.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} desde ${l.nombre}. ` +
    'Horas en la zona horaria de tu dispositivo.';
  raiz.querySelector('#titulo-objetos').textContent = `Objetos para ${MESES[noche.mediodia.getMonth()]}`;

  pintarEditor();
}

function pintarEditor() {
  const caja = raiz.querySelector('#editor-lugar');
  if (!estado.editando) { caja.innerHTML = ''; return; }
  const l = lugarActivo();
  caja.innerHTML = `
    <div class="editor">
      <label class="campo"><span class="campo__etiqueta">Nombre</span>
        <span class="campo__caja"><input id="e-nombre" type="text" value="${escaparHTML(l.nombre)}"></span></label>
      <label class="campo"><span class="campo__etiqueta">Latitud (norte +)</span>
        <span class="campo__caja"><input id="e-lat" type="text" inputmode="decimal" value="${String(l.lat).replace('.', ',')}"><span class="campo__unidad">°</span></span></label>
      <label class="campo"><span class="campo__etiqueta">Longitud (oeste −)</span>
        <span class="campo__caja"><input id="e-lon" type="text" inputmode="decimal" value="${String(l.lon).replace('.', ',')}"><span class="campo__unidad">°</span></span></label>
      <label class="interruptor">
        <input type="checkbox" id="e-gps-auto" ${estado.gpsAlAbrir ? 'checked' : ''}>
        <span>Usar el GPS al abrir el planificador</span>
      </label>
      <div class="editor__botones">
        <button class="boton-sec" type="button" data-accion="guardar-lugar">Guardar</button>
        <button class="boton-sec" type="button" data-accion="nuevo-lugar">Nuevo lugar</button>
        ${estado.lugares.length > 1 ? '<button class="boton-sec boton-sec--peligro" type="button" data-accion="borrar-lugar">Borrar este</button>' : ''}
        <button class="boton-sec" type="button" data-accion="editar">Cerrar</button>
      </div>
      <p class="nota">Las coordenadas salen, por ejemplo, de Google Maps (clic derecho sobre el sitio). Se guardan solo en este dispositivo.</p>
    </div>`;
}

/* ---------- Luna ---------- */
function pintarLuna() {
  const { fase, s, nueva, llena } = noche;
  raiz.querySelector('#luna').innerHTML = `
    <h2 class="panel__titulo"><span class="panel__num">01</span>La Luna</h2>
    <div class="luna__cuerpo">
      ${dibujoLuna(fase, 92)}
      <div>
        <p class="luna__nombre">${fase.nombre}</p>
        <p class="lectura__cifra cifra">${Math.round(fase.iluminada * 100)}<span> % iluminada</span></p>
        <p class="lectura__sub cifra">${fase.edad.toLocaleString('es-ES', { maximumFractionDigits: 1 })} días desde la nueva</p>
      </div>
    </div>
    <dl class="datos cifra">
      ${salidaPuestaLuna(s.luna)}
      <dt>Nueva</dt><dd>${nueva ? fechaCorta(nueva) : '—'}</dd>
      <dt>Llena</dt><dd>${llena ? fechaCorta(llena) : '—'}</dd>
    </dl>
    <p class="lectura__texto">${consejoLuna(fase)}</p>`;
}

/** Salida y puesta de la Luna en orden cronológico (a veces se pone antes de salir) */
function salidaPuestaLuna(l) {
  const filas = [
    { t: l.sale, html: `<dt>Sale</dt><dd>${l.sale ? `${hora(l.sale)} · ${fechaCorta(l.sale)}` : 'no sale en estas 24 h'}</dd>` },
    { t: l.sePone, html: `<dt>Se pone</dt><dd>${l.sePone ? `${hora(l.sePone)} · ${fechaCorta(l.sePone)}` : 'no se pone en estas 24 h'}</dd>` },
  ];
  return filas.sort((a, b) => (a.t?.getTime() ?? Infinity) - (b.t?.getTime() ?? Infinity)).map((f) => f.html).join('');
}

function consejoLuna(f) {
  if (f.iluminada < 0.25) return 'Luna discreta: noche para galaxias y nebulosas tenues en banda ancha.';
  if (f.iluminada < 0.6) return 'Luna a medias: aprovecha las horas en que esté bajo el horizonte, o pasa a nebulosas de emisión con filtro dual.';
  return 'Mucha Luna: nebulosas de emisión con filtro dual, cúmulos… o la propia Luna.';
}

/**
 * Dibujo de la fase: medio disco iluminado más una media elipse (el terminador)
 * cuya anchura es r·|1 − 2k|, donde k es la fracción iluminada.
 * En el hemisferio norte la Luna creciente se ilumina por la derecha.
 */
function dibujoLuna(fase, tam) {
  const r = tam / 2 - 2, k = fase.iluminada;
  const rx = Math.abs(r * (1 - 2 * k));
  const barrido = k > 0.5 ? 1 : 0;
  const d = `M0 ${-r} A${r} ${r} 0 0 1 0 ${r} A${rx} ${r} 0 0 ${barrido} 0 ${-r}Z`;
  return `
    <svg class="grafico luna__dibujo" viewBox="${-tam / 2} ${-tam / 2} ${tam} ${tam}" width="${tam}" height="${tam}" role="img" aria-label="${fase.nombre}">
      <circle r="${r}" class="luna__sombra"/>
      <path d="${d}" class="luna__luz" transform="${fase.creciente ? '' : 'scale(-1 1)'}"/>
    </svg>`;
}

/* ---------- Línea de tiempo de la noche ---------- */
function pintarLinea() {
  const { s, desde, hasta, sol, luna, fase, oscuroSinLuna } = noche;
  const W = 440, H = 96, top = 18, alto = 40;
  const x = (t) => ((t - desde.getTime()) / (hasta.getTime() - desde.getTime())) * W;

  // Bandas de color según la altura del Sol
  const clase = (alt) => alt > -0.833 ? 'dia' : alt > -6 ? 'civil' : alt > -12 ? 'nautico' : alt > -18 ? 'astro' : 'noche';
  let bandas = '';
  for (let i = 0; i < sol.length - 1; i++) {
    bandas += `<rect class="banda banda--${clase(sol[i].alt)}" x="${x(sol[i].t)}" y="${top}" width="${x(sol[i + 1].t) - x(sol[i].t) + 0.5}" height="${alto}"/>`;
  }
  // Tira de la Luna sobre el horizonte, más opaca cuanto más iluminada
  let tira = '';
  for (let i = 0; i < luna.length - 1; i++) {
    if (luna[i].alt > 0) tira += `<rect class="tira-luna" x="${x(luna[i].t)}" y="${top + alto + 6}" width="${x(luna[i + 1].t) - x(luna[i].t) + 0.5}" height="7" style="opacity:${0.25 + fase.iluminada * 0.75}"/>`;
  }
  // Marcas de hora en punto
  let marcas = '';
  const primera = new Date(desde); primera.setMinutes(0, 0, 0);
  for (let t = primera.getTime() + 3600000; t < hasta.getTime(); t += 3600000) {
    const h = new Date(t).getHours();
    marcas += `<line x1="${x(t)}" x2="${x(t)}" y1="${top + alto}" y2="${top + alto + 4}" class="marca"/>`;
    if (h % 2 === 0) marcas += `<text x="${x(t)}" y="${top - 6}" text-anchor="middle" class="marca-texto">${String(h).padStart(2, '0')}h</text>`;
  }

  const ast = s.astronomico;
  const largaNoche = ast.inicio && ast.fin ? (ast.fin - ast.inicio) / 60000 : 0;
  raiz.querySelector('#linea').innerHTML = `
    <h2 class="panel__titulo"><span class="panel__num">02</span>La noche</h2>
    <svg class="grafico linea__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Línea de tiempo de la noche">
      ${bandas}${tira}${marcas}
      <text x="2" y="${top + alto + 26}" class="marca-texto">Luna sobre el horizonte</text>
    </svg>
    <div class="leyenda">
      <span><i class="banda--dia"></i>Día</span><span><i class="banda--civil"></i>Civil</span>
      <span><i class="banda--nautico"></i>Náutico</span><span><i class="banda--astro"></i>Astronómico</span>
      <span><i class="banda--noche"></i>Noche cerrada</span>
    </div>
    <dl class="datos datos--linea cifra">
      <dt>Puesta del Sol</dt><dd>${hora(s.puesta.inicio)}</dd>
      <dt>Empieza la noche astronómica</dt><dd>${hora(ast.inicio)}</dd>
      <dt>Termina</dt><dd>${hora(ast.fin)}</dd>
      <dt>Salida del Sol</dt><dd>${hora(s.puesta.fin)}</dd>
    </dl>
    <div class="resumen-noche">
      <div><span class="etiqueta">Noche astronómica</span><span class="lectura__cifra cifra">${largaNoche ? duracion(largaNoche) : 'no hay'}</span></div>
      <div><span class="etiqueta">Oscura y sin Luna</span><span class="lectura__cifra cifra">${duracion(oscuroSinLuna)}</span></div>
    </div>
    <p class="lectura__texto">El cielo solo está oscuro de verdad con el Sol más de 18° bajo el horizonte.</p>`;
}

/* ---------- Objetos ---------- */
function pintarObjetos() {
  raiz.querySelectorAll('[data-tipo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === estado.tipo)));
  const pasa = (o) => estado.tipo === 'todos' || o.tipo.startsWith(estado.tipo);
  const lista = noche.objetos.filter((x) => pasa(x.o));
  const buenos = lista.filter((x) => x.util >= 60);
  const resto = lista.filter((x) => x.util < 60);

  raiz.querySelector('#objetos').innerHTML = `
    ${buenos.length ? `<ul class="objetos">${buenos.map(filaObjeto).join('')}</ul>`
      : '<div class="vacio"><p class="vacio__titulo">Nada a buena altura esta noche.</p><p>Prueba otro tipo de objeto u otra fecha.</p></div>'}
    ${resto.length ? `
      <details class="otros">
        <summary>Otros ${resto.length} objetos: bajos, de día o con menos de 1 h útil</summary>
        <ul class="objetos">${resto.map(filaObjeto).join('')}</ul>
      </details>` : ''}`;
}

function filaObjeto(x) {
  const { o } = x;
  const abierto = estado.abierto === o.id;
  const lunaUtil = noche.fase.iluminada > 0.3 && x.conLuna > 0;
  const filtro = DE_EMISION.has(o.tipo) ? (lunaUtil ? 'Filtro dual' : 'UV/IR o dual') : 'UV/IR';
  const culminaDeNoche = noche.s.astronomico.inicio && x.culmina >= noche.s.astronomico.inicio && x.culmina <= noche.s.astronomico.fin;
  return `
    <li class="objeto ${abierto ? 'esta-abierto' : ''}" style="--color: var(--${o.tipo.startsWith('galaxia') ? 'b1' : o.tipo.startsWith('cumulo') ? 'b4' : DE_EMISION.has(o.tipo) ? 'b5' : 'b2'})">
      <button class="objeto__cabecera" type="button" data-objeto="${o.id}" aria-expanded="${abierto}">
        <span class="objeto__nombre">
          <span class="objeto__catalogo cifra">${escaparHTML(o.catalogo)}</span>
          <span class="objeto__titulo">${escaparHTML(o.nombre)}</span>
          <span class="objeto__meta">${NOMBRE_TIPO[o.tipo] || o.tipo} · mag ${o.mag.toLocaleString('es-ES')} · ${o.ancho}′×${o.alto}′</span>
        </span>
        <span class="objeto__dato cifra"><b>${x.altMax > 0 ? grados(x.altMax) : 'no sale'}</b><small>altura máx.</small></span>
        <span class="objeto__dato cifra"><b>${hora(x.culmina)}</b><small>culmina${culminaDeNoche ? '' : ' (de día)'}</small></span>
        <span class="objeto__dato cifra"><b>${duracion(x.util)}</b><small>útil${x.util ? ` · ${duracion(x.utilSinLuna)} sin Luna` : ''}</small></span>
        ${miniCurva(x.curva)}
      </button>
      ${abierto ? detalleObjeto(x, filtro) : ''}
    </li>`;
}

/** Curva pequeña de altura (sparkline) con la línea de 30° y la noche astronómica sombreada */
function miniCurva(curva) {
  const W = 110, H = 34;
  const { desde, hasta, s } = noche;
  const x = (t) => ((t - desde.getTime()) / (hasta.getTime() - desde.getTime())) * W;
  const y = (alt) => H - (Math.max(alt, 0) / 90) * H;
  const d = curva.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.alt).toFixed(1)}`).join('');
  const osc = s.astronomico.inicio ? `<rect class="mini__noche" x="${x(s.astronomico.inicio)}" y="0" width="${x(s.astronomico.fin) - x(s.astronomico.inicio)}" height="${H}"/>` : '';
  return `<svg class="grafico mini" viewBox="0 0 ${W} ${H}" aria-hidden="true">${osc}
            <line class="mini__30" x1="0" x2="${W}" y1="${y(ALTURA_UTIL)}" y2="${y(ALTURA_UTIL)}"/>
            <path class="mini__curva" d="${d}"/></svg>`;
}

/** Panel desplegado: curva grande de altura del objeto y de la Luna */
function detalleObjeto(x, filtro) {
  const { desde, hasta, sol, luna, s } = noche;
  const W = 440, H = 200, m = { izq: 34, der: 8, arr: 10, aba: 24 };
  const X = (t) => m.izq + ((t - desde.getTime()) / (hasta.getTime() - desde.getTime())) * (W - m.izq - m.der);
  const Y = (alt) => m.arr + (1 - Math.max(alt, 0) / 90) * (H - m.arr - m.aba);
  const camino = (puntos) => puntos.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.alt).toFixed(1)}`).join('');

  // Fondo: oscuro durante la noche astronómica
  const fondo = s.astronomico.inicio
    ? `<rect class="det__noche" x="${X(s.astronomico.inicio)}" y="${m.arr}" width="${X(s.astronomico.fin) - X(s.astronomico.inicio)}" height="${H - m.arr - m.aba}"/>` : '';
  let ejes = '';
  for (const a of [0, 30, 60, 90]) {
    ejes += `<line class="det__rejilla ${a === ALTURA_UTIL ? 'det__rejilla--30' : ''}" x1="${m.izq}" x2="${W - m.der}" y1="${Y(a)}" y2="${Y(a)}"/>
             <text class="det__texto" x="${m.izq - 6}" y="${Y(a) + 4}" text-anchor="end">${a}°</text>`;
  }
  const primera = new Date(desde); primera.setMinutes(0, 0, 0);
  for (let t = primera.getTime() + 3600000; t < hasta.getTime(); t += 3600000) {
    const h = new Date(t).getHours();
    if (h % 2 === 0) ejes += `<text class="det__texto" x="${X(t)}" y="${H - 8}" text-anchor="middle">${String(h).padStart(2, '0')}h</text>`;
  }
  const maxP = x.curva.reduce((a, b) => (b.alt > a.alt ? b : a));
  const distLuna = Math.round(x.distLuna);

  return `
    <div class="objeto__detalle">
      <svg class="grafico det" viewBox="0 0 ${W} ${H}" role="img" aria-label="Altura de ${escaparHTML(x.o.nombre)} durante la noche">
        ${fondo}${ejes}
        <path class="det__luna" d="${camino(luna)}"/>
        <path class="det__curva" d="${camino(x.curva)}"/>
        ${maxP.alt > 0 ? `<circle class="det__punto" cx="${X(maxP.t)}" cy="${Y(maxP.alt)}" r="4"/>` : ''}
      </svg>
      <div class="leyenda"><span><i class="leyenda__objeto"></i>${escaparHTML(x.o.catalogo)}</span><span><i class="leyenda__luna"></i>Luna</span><span><i class="leyenda__oscuro"></i>Noche astronómica</span></div>
      <p class="objeto__consejo">${escaparHTML(x.o.consejo || '')}</p>
      <dl class="datos cifra">
        <dt>Filtro</dt><dd>${filtro}</dd>
        <dt>Temporada</dt><dd>culmina a medianoche en ${x.mejorMes}</dd>
        <dt>Luna</dt><dd>a ${distLuna}° del objeto${distLuna < 30 && noche.fase.iluminada > 0.3 ? ' · demasiado cerca' : ''}</dd>
        <dt>Coordenadas</dt><dd>AR ${horasAR(x.o.ar)} · Dec ${x.o.dec >= 0 ? '+' : '−'}${grados(Math.abs(x.o.dec), 1)}</dd>
      </dl>
      <a class="enlace-glosario" href="#glosario/culminacion">${icono('glosario')}Qué es la culminación</a>
    </div>`;
}

const horasAR = (h) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

/* ==========================================================================
   GPS
   ========================================================================== */
function pedirGPS(automatico = false) {
  const aviso = raiz.querySelector('#estado-gps');
  if (!('geolocation' in navigator)) {
    if (!automatico) aviso.textContent = 'Este navegador no ofrece la posición.';
    return;
  }
  aviso.textContent = 'Buscando tu posición…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const gps = {
        id: 'gps', nombre: 'Mi posición',
        lat: Math.round(pos.coords.latitude * 1000) / 1000,     // ≈ 100 m: de sobra
        lon: Math.round(pos.coords.longitude * 1000) / 1000,
        actualizado: new Date().toISOString(),
      };
      const i = estado.lugares.findIndex((l) => l.id === 'gps');
      if (i >= 0) estado.lugares[i] = gps; else estado.lugares.push(gps);
      estado.lugarId = 'gps';
      guardarLugares();
      aviso.textContent = '';
      if (raiz.isConnected) recalcular();
    },
    (error) => {
      // 1 = permiso denegado, 2 = posición no disponible, 3 = tiempo agotado
      aviso.textContent = error.code === 1
        ? 'Sin permiso para usar la ubicación. En el iPhone: Ajustes › Privacidad › Localización › Sitios web de Safari.'
        : 'No se pudo obtener la posición; uso el último lugar elegido.';
      if (automatico && error.code === 1) {
        estado.gpsAlAbrir = false;                        // no volver a preguntar cada vez
        guardar('cielo:gpsAlAbrir', false);
      }
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 },
  );
}

/* ==========================================================================
   Eventos
   ========================================================================== */
function alHacerClic(ev) {
  const b = ev.target.closest('button');
  if (!b) return;
  const accion = b.dataset.accion;

  if (b.dataset.lugar) { estado.lugarId = b.dataset.lugar; guardarLugares(); recalcular(); return; }
  if (b.dataset.tipo) { estado.tipo = b.dataset.tipo; pintarObjetos(); return; }
  if (b.dataset.objeto) { estado.abierto = estado.abierto === b.dataset.objeto ? null : b.dataset.objeto; pintarObjetos(); return; }

  if (accion === 'gps') pedirGPS();
  else if (accion === 'editar') { estado.editando = !estado.editando; pintarEditor(); }
  else if (accion === 'dia-' || accion === 'dia+') {
    const f = mediodiaElegido();
    f.setDate(f.getDate() + (accion === 'dia+' ? 1 : -1));
    estado.fecha = aTextoFecha(f);
    recalcular();
  } else if (accion === 'hoy') { estado.fecha = null; recalcular(); }
  else if (accion === 'guardar-lugar') guardarLugarEditado();
  else if (accion === 'nuevo-lugar') {
    const nuevo = { id: 'l' + Date.now(), nombre: 'Nuevo lugar', lat: lugarActivo().lat, lon: lugarActivo().lon };
    estado.lugares.push(nuevo);
    estado.lugarId = nuevo.id;
    guardarLugares();
    recalcular();
  } else if (accion === 'borrar-lugar') {
    if (!confirm(`¿Borrar «${lugarActivo().nombre}»?`)) return;
    estado.lugares = estado.lugares.filter((l) => l.id !== estado.lugarId);
    estado.lugarId = estado.lugares[0].id;
    guardarLugares();
    recalcular();
  }
}

function guardarLugarEditado() {
  const lat = num(raiz.querySelector('#e-lat').value);
  const lon = num(raiz.querySelector('#e-lon').value);
  const nombre = raiz.querySelector('#e-nombre').value.trim() || 'Sin nombre';
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
    raiz.querySelector('#estado-gps').textContent = 'Latitud entre −90 y 90, longitud entre −180 y 180.';
    return;
  }
  Object.assign(lugarActivo(), { nombre, lat, lon });
  estado.editando = false;
  guardarLugares();
  raiz.querySelector('#estado-gps').textContent = '';
  recalcular();
}

function alCambiar(ev) {
  if (ev.target.id === 'fecha' && ev.target.value) {
    estado.fecha = ev.target.value;
    recalcular();
  } else if (ev.target.id === 'e-gps-auto') {
    estado.gpsAlAbrir = ev.target.checked;
    guardar('cielo:gpsAlAbrir', estado.gpsAlAbrir);
  }
}
