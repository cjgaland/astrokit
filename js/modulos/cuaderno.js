/* ==========================================================================
   modulos/cuaderno.js — Módulo 5: Cuaderno de sesiones
   --------------------------------------------------------------------------
   Vistas (por la dirección):
     #cuaderno              lista de noches, con totales y buscador
     #cuaderno/nueva        formulario vacío
     #cuaderno/<id>         ficha de una sesión
     #cuaderno/<id>/editar  formulario con sus datos
     #cuaderno/<id>/repetir formulario copiando objeto, equipo, filtro y lugar
                            (para la integración multinoche)

   Datos: un array de sesiones en localStorage ("astrokit:cuaderno:sesiones").
   La foto se guarda como miniatura JPEG de 400 px (≈ 30 KB) dentro del propio
   registro, codificada en texto (data URL). localStorage da unos 5 MB, así
   que caben del orden de 150 sesiones con foto.

   Copia de seguridad: «Exportar» descarga un JSON con TODO AstroKit (cuaderno,
   checklist, favoritos del glosario, lugares...). «Importar» mezcla las
   sesiones sin duplicar y, si quieres, restaura también lo demás.
   ========================================================================== */

import { cargarJSON, escaparHTML, icono } from '../util.js';
import { leer, guardar } from '../almacen.js';
import { faseLunar } from '../calculos/astro.js';
import { idMiEquipo } from '../equipo.js';

/* ==========================================================================
   Funciones puras (se prueban en pruebas/pruebas.html)
   ========================================================================== */

/** Integración total en minutos */
export const integracionMin = (s) => ((Number(s.subs) || 0) * (Number(s.exposicion) || 0)) / 60;

/** Tamaño de la miniatura conservando la proporción, con el lado mayor ≤ max */
export function dimensionesMiniatura(ancho, alto, max = 400) {
  const k = Math.min(1, max / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * k), alto: Math.round(alto * k) };
}

/**
 * Mezcla las sesiones importadas con las que ya hay, sin duplicar:
 * si un id existe en ambas, gana la modificada más recientemente.
 * Devuelve { lista, nuevas, actualizadas }.
 */
export function mezclarSesiones(actuales, importadas) {
  const porId = new Map(actuales.map((s) => [s.id, s]));
  let nuevas = 0, actualizadas = 0;
  for (const s of importadas) {
    if (!s || !s.id) continue;
    const ya = porId.get(s.id);
    if (!ya) { porId.set(s.id, s); nuevas++; }
    else if ((s.modificado || '') > (ya.modificado || '')) { porId.set(s.id, s); actualizadas++; }
  }
  return { lista: [...porId.values()], nuevas, actualizadas };
}

/** Totales por objeto (nombre normalizado): { minutos, noches } */
export function totalesPorObjeto(sesiones, objeto) {
  const clave = (t) => String(t || '').trim().toLowerCase();
  const de = sesiones.filter((s) => clave(s.objeto) === clave(objeto));
  return { minutos: de.reduce((a, s) => a + integracionMin(s), 0), noches: de.length };
}

/* ==========================================================================
   Estado
   ========================================================================== */
const CLAVE = 'cuaderno:sesiones';
const FILTROS = ['Sin filtro / UV-IR', 'Dual-band (Hα + OIII)', 'Dual SII + OIII', 'Filtro solar', 'Otro'];

let sesiones = leer(CLAVE, []);
let raiz = null;
let consulta = '';
let datosAux = { objetos: [], equipos: [] };   // para las sugerencias del formulario
let fotoNueva;                                 // undefined = sin cambios; null = quitada; texto = nueva

const guardarSesiones = () => guardar(CLAVE, sesiones);
const ordenadas = () => sesiones.slice().sort((a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado));
const buscar = (id) => sesiones.find((s) => s.id === id);

/* ---------- Formato ---------- */
const duracion = (min) => {
  if (!min) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')} min` : ''}` : `${m} min`;
};
const fechaLarga = (t) => new Date(t + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fechaCorta = (t) => new Date(t + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const hoy = () => { const f = new Date(); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`; };
const e = escaparHTML;

/* ==========================================================================
   Montaje y rutas
   ========================================================================== */
export async function montar(contenedor, parametro) {
  raiz = contenedor;
  sesiones = leer(CLAVE, []);
  const [o, q] = await Promise.all([cargarJSON('data/objetos.json'), cargarJSON('data/equipos.json')]);
  datosAux = { objetos: o.objetos, equipos: q.equipos };
  raiz.addEventListener('click', alHacerClic);
  raiz.addEventListener('input', alEscribir);
  raiz.addEventListener('change', alCambiar);
  raiz.addEventListener('submit', alEnviar);
  actualizar(parametro);
  return { actualizar, desmontar };
}

function desmontar() {
  raiz.removeEventListener('click', alHacerClic);
  raiz.removeEventListener('input', alEscribir);
  raiz.removeEventListener('change', alCambiar);
  raiz.removeEventListener('submit', alEnviar);
}

function actualizar(parametro) {
  const [id, accion] = (parametro || '').split('/');
  fotoNueva = undefined;
  if (id === 'nueva') pintarFormulario(null);
  else if (id && buscar(id) && accion === 'editar') pintarFormulario(buscar(id));
  else if (id && buscar(id) && accion === 'repetir') pintarFormulario(buscar(id), true);
  else if (id && buscar(id)) pintarFicha(buscar(id));
  else pintarLista();
  window.scrollTo(0, 0);
}

/* ==========================================================================
   Vista LISTA
   ========================================================================== */
function pintarLista() {
  const lista = ordenadas();
  const totalMin = lista.reduce((a, s) => a + integracionMin(s), 0);
  const objetosDistintos = new Set(lista.map((s) => s.objeto.trim().toLowerCase())).size;

  raiz.innerHTML = `
    <section class="cuaderno entrada">
      <header class="modulo__cabecera">
        <span class="etiqueta">Módulo 05 · Cuaderno de observación</span>
        <h1 class="titular">Cuaderno <em>de noches</em>.</h1>
        <p class="entradilla">Cada salida, con sus datos y una miniatura de la foto. Se guarda en este
          dispositivo: exporta una copia de vez en cuando.</p>
      </header>

      <div class="estadisticas">
        <div><span class="etiqueta">Noches</span><span class="lectura__cifra cifra">${lista.length}</span></div>
        <div><span class="etiqueta">Integración</span><span class="lectura__cifra cifra">${duracion(totalMin)}</span></div>
        <div><span class="etiqueta">Objetos</span><span class="lectura__cifra cifra">${objetosDistintos}</span></div>
      </div>

      <div class="cuaderno__barra">
        <a class="boton-principal" href="#cuaderno/nueva">+ Nueva sesión</a>
        ${lista.length ? `
          <div class="buscador buscador--pequeno">
            ${icono('buscar', 'buscador__lupa')}
            <input id="buscar-sesion" type="search" placeholder="Buscar objeto, lugar…" value="${e(consulta)}" aria-label="Buscar en el cuaderno">
          </div>` : ''}
      </div>

      <div id="sesiones">${tarjetasSesiones(lista)}</div>

      <section class="panel copia">
        <h2 class="panel__titulo">Copia de seguridad</h2>
        <p class="lectura__texto">Exporta un archivo JSON con todo AstroKit: el cuaderno con sus fotos, la checklist,
          los favoritos del glosario, tus lugares y los ajustes. Guárdalo en iCloud Drive o en el Mac;
          con «Importar» lo recuperas en cualquier dispositivo.</p>
        <div class="copia__botones">
          <button class="boton-sec" type="button" data-accion="exportar">${icono('abajo')}Exportar copia</button>
          <label class="boton-sec boton-archivo">${icono('arriba')}Importar copia
            <input type="file" id="importar" accept="application/json,.json" hidden>
          </label>
        </div>
        <p class="nota" id="uso-almacen">${textoUsoAlmacen()}</p>
        <p class="lugar__estado" id="estado-copia" aria-live="polite"></p>
      </section>
    </section>`;
}

function tarjetasSesiones(lista) {
  if (!sesiones.length) {
    return `
      <div class="vacio">
        <p class="vacio__titulo">Tu primera noche te espera.</p>
        <p>Cuando vuelvas de observar, pulsa «Nueva sesión» y apunta qué hiciste.<br>
          La tradición dice que el <em>first light</em> no tiene que salir perfecto.</p>
      </div>`;
  }
  const q = consulta.trim().toLowerCase();
  const filtradas = q ? lista.filter((s) => [s.objeto, s.lugar, s.equipo, s.notas, s.filtro].join(' ').toLowerCase().includes(q)) : lista;
  if (!filtradas.length) return '<div class="vacio"><p>Ninguna sesión coincide.</p></div>';
  return `<ul class="sesiones">${filtradas.map((s) => `
    <li>
      <a class="sesion" href="#cuaderno/${s.id}">
        <span class="sesion__foto foto">${s.foto ? `<img src="${s.foto}" alt="" loading="lazy">` : icono('telescopio')}</span>
        <span class="sesion__texto">
          <span class="sesion__fecha cifra">${fechaCorta(s.fecha)}${s.lugar ? ` · ${e(s.lugar)}` : ''}</span>
          <span class="sesion__objeto">${e(s.objeto)}</span>
          <span class="sesion__meta">${[duracion(integracionMin(s)), s.filtro, s.bortle ? `Bortle ${s.bortle}` : ''].filter(Boolean).map(e).join(' · ')}</span>
          ${s.valoracion ? `<span class="sesion__estrellas" aria-label="${s.valoracion} de 5">${'★'.repeat(s.valoracion)}<span>${'★'.repeat(5 - s.valoracion)}</span></span>` : ''}
        </span>
      </a>
    </li>`).join('')}</ul>`;
}

/** Cuánto ocupa AstroKit en el almacenamiento local (aprox.: 2 bytes por carácter) */
function textoUsoAlmacen() {
  let caracteres = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('astrokit:')) caracteres += k.length + (localStorage.getItem(k) || '').length;
    }
  } catch { return ''; }
  const mb = (caracteres * 2) / 1048576;
  return `Ocupado en este dispositivo: ${mb.toLocaleString('es-ES', { maximumFractionDigits: 2 })} MB de unos 5 MB disponibles.`;
}

/* ==========================================================================
   Vista FICHA
   ========================================================================== */
function pintarFicha(s) {
  const tot = totalesPorObjeto(sesiones, s.objeto);
  const fila = (etiqueta, valor) => valor ? `<dt>${etiqueta}</dt><dd>${valor}</dd>` : '';
  raiz.innerHTML = `
    <article class="ficha-sesion entrada">
      <nav class="ficha__migas">
        <a href="#cuaderno" class="ficha__volver">${icono('atras')}Cuaderno</a>
        <span class="ficha__bloque cifra">${fechaCorta(s.fecha)}</span>
      </nav>
      <header>
        <span class="etiqueta">${e(fechaLarga(s.fecha))}</span>
        <h1 class="ficha__titulo">${e(s.objeto)}</h1>
        ${s.valoracion ? `<p class="sesion__estrellas sesion__estrellas--grande">${'★'.repeat(s.valoracion)}<span>${'★'.repeat(5 - s.valoracion)}</span></p>` : ''}
      </header>
      ${s.foto ? `<figure class="ficha-sesion__foto foto"><img src="${s.foto}" alt="Foto de ${e(s.objeto)}"></figure>` : ''}
      <div class="ficha-sesion__datos">
        <dl class="datos cifra">
          ${fila('Lugar', e(s.lugar))}
          ${fila('Equipo', e(s.equipo))}
          ${fila('Filtro', e(s.filtro))}
          ${fila('Tomas', s.subs ? `${s.subs} × ${String(s.exposicion).replace('.', ',')} s` : '')}
          ${fila('Integración', duracion(integracionMin(s)))}
          ${fila('Cielo', [s.bortle ? `Bortle ${s.bortle}` : '', s.sqm ? `SQM ${String(s.sqm).replace('.', ',')}` : ''].filter(Boolean).join(' · '))}
          ${fila('Luna', s.luna !== undefined && s.luna !== null ? `${Math.round(s.luna * 100)} % iluminada` : '')}
        </dl>
        ${tot.noches > 1 ? `
          <aside class="capa capa--cuenta">
            <span class="etiqueta">Integración multinoche</span>
            <p>Llevas <strong>${duracion(tot.minutos)}</strong> en ${e(s.objeto)} repartidas en ${tot.noches} noches.
              Apila los FITS de todas para sumar señal: la SNR crece como √t.</p>
          </aside>` : ''}
      </div>
      ${s.notas ? `<div class="ficha-sesion__notas"><span class="etiqueta">Notas</span><p>${e(s.notas).replace(/\n/g, '<br>')}</p></div>` : ''}
      <div class="ficha__acciones">
        <a class="boton-marca" href="#cuaderno/${s.id}/editar">${icono('cuaderno')}<span>Editar</span></a>
        <a class="boton-marca" href="#cuaderno/${s.id}/repetir" title="Otra noche del mismo objeto">${icono('azar')}<span>Otra noche igual</span></a>
        <button class="boton-marca" type="button" data-accion="compartir" data-id="${s.id}">${icono('arriba')}<span>Compartir</span></button>
        <button class="boton-marca boton-marca--peligro" type="button" data-accion="borrar" data-id="${s.id}">${icono('cerrar')}<span>Borrar</span></button>
      </div>
    </article>`;
}

/* ==========================================================================
   Vista FORMULARIO
   ========================================================================== */
function pintarFormulario(s, repetir = false) {
  const editando = s && !repetir;
  // Valores por defecto: vacío, o copia del original (repetir), o los suyos (editar)
  const v = editando ? s : {
    fecha: hoy(),
    lugar: repetir ? s.lugar : (leer('cielo:lugares', [])?.find((l) => l.id === leer('cielo:lugar', 'casa'))?.nombre || ''),
    objeto: repetir ? s.objeto : '',
    equipo: repetir ? s.equipo : (datosAux.equipos.find((q) => q.id === idMiEquipo())?.nombre || datosAux.equipos[0]?.nombre || ''),
    filtro: repetir ? s.filtro : FILTROS[0],
    subs: '', exposicion: repetir ? s.exposicion : 10,
    bortle: repetir ? s.bortle : '', sqm: repetir ? s.sqm : '',
    valoracion: 0, notas: '', foto: null,
  };
  const lugares = leer('cielo:lugares', []).map((l) => l.nombre);

  raiz.innerHTML = `
    <section class="formulario-sesion entrada">
      <nav class="ficha__migas">
        <a href="${editando ? `#cuaderno/${s.id}` : '#cuaderno'}" class="ficha__volver">${icono('atras')}${editando ? 'Volver' : 'Cuaderno'}</a>
      </nav>
      <h1 class="titular">${editando ? 'Editar' : 'Nueva'} <em>sesión</em>.</h1>

      <form class="panel formulario" id="formulario" data-id="${editando ? s.id : ''}" novalidate>
        <div class="formulario__rejilla">
          <label class="campo"><span class="campo__etiqueta">Fecha (inicio de la noche)</span>
            <span class="campo__caja"><input name="fecha" type="date" required value="${e(v.fecha)}"></span></label>
          <label class="campo campo--ancho"><span class="campo__etiqueta">Objeto *</span>
            <span class="campo__caja"><input name="objeto" type="text" required list="lista-objetos" placeholder="M31, Nebulosa de Orión…" value="${e(v.objeto)}" autocomplete="off"></span>
            <span class="campo__ayuda campo__error" id="error-objeto"></span></label>
          <label class="campo"><span class="campo__etiqueta">Lugar</span>
            <span class="campo__caja"><input name="lugar" type="text" list="lista-lugares" placeholder="Casa, un sitio oscuro en la sierra…" value="${e(v.lugar)}"></span></label>
          <label class="campo"><span class="campo__etiqueta">Equipo</span>
            <span class="campo__caja"><input name="equipo" type="text" list="lista-equipos" value="${e(v.equipo)}"></span></label>
          <label class="campo"><span class="campo__etiqueta">Filtro</span>
            <span class="campo__caja"><select name="filtro">${FILTROS.map((f) => `<option ${f === v.filtro ? 'selected' : ''}>${f}</option>`).join('')}</select></span></label>
          <label class="campo"><span class="campo__etiqueta">Nº de tomas (subs)</span>
            <span class="campo__caja"><input name="subs" type="text" inputmode="numeric" value="${e(v.subs)}"><span class="campo__unidad">subs</span></span></label>
          <label class="campo"><span class="campo__etiqueta">Exposición por toma</span>
            <span class="campo__caja"><input name="exposicion" type="text" inputmode="decimal" value="${e(String(v.exposicion).replace('.', ','))}"><span class="campo__unidad">s</span></span>
            <span class="campo__ayuda" id="integracion"></span></label>
          <label class="campo"><span class="campo__etiqueta">Bortle</span>
            <span class="campo__caja"><select name="bortle"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => `<option ${Number(v.bortle) === b ? 'selected' : ''}>${b}</option>`).join('')}</select></span></label>
          <label class="campo"><span class="campo__etiqueta">SQM</span>
            <span class="campo__caja"><input name="sqm" type="text" inputmode="decimal" placeholder="21,3" value="${e(String(v.sqm || '').replace('.', ','))}"><span class="campo__unidad">mag/″²</span></span></label>
        </div>

        <fieldset class="valoracion">
          <legend class="campo__etiqueta">Cómo fue la noche</legend>
          ${[1, 2, 3, 4, 5].map((n) => `
            <label><input type="radio" name="valoracion" value="${n}" ${Number(v.valoracion) === n ? 'checked' : ''}><span aria-label="${n} de 5">★</span></label>`).join('')}
        </fieldset>

        <label class="campo"><span class="campo__etiqueta">Notas</span>
          <textarea name="notas" rows="4" placeholder="Seeing, viento, rocío, qué aprendiste, qué cambiarías…">${e(v.notas)}</textarea></label>

        <div class="foto-campo">
          <span class="campo__etiqueta">Miniatura de la foto</span>
          <div class="foto-campo__fila">
            <div class="foto-campo__vista foto" id="vista-foto">${v.foto ? `<img src="${v.foto}" alt="">` : icono('telescopio')}</div>
            <div class="foto-campo__botones">
              <label class="boton-sec boton-archivo">${icono('arriba')}${v.foto ? 'Cambiar foto' : 'Añadir foto'}
                <input type="file" id="foto" accept="image/*" hidden></label>
              ${v.foto ? '<button class="boton-sec boton-sec--peligro" type="button" data-accion="quitar-foto">Quitar</button>' : ''}
              <span class="nota">Se reduce a 400 px para que quepa en el dispositivo; el original sigue en tu carrete.</span>
            </div>
          </div>
        </div>

        <p class="nota" id="dato-luna"></p>
        <p class="lugar__estado" id="estado-formulario" aria-live="polite"></p>
        <div class="formulario__botones">
          <button class="boton-principal" type="submit">${editando ? 'Guardar cambios' : 'Guardar sesión'}</button>
          <a class="boton-sec" href="${editando ? `#cuaderno/${s.id}` : '#cuaderno'}">Cancelar</a>
        </div>
      </form>

      <datalist id="lista-objetos">${datosAux.objetos.map((o) => `<option value="${e(o.catalogo)}">${e(o.nombre)}</option><option value="${e(o.nombre)}"></option>`).join('')}</datalist>
      <datalist id="lista-equipos">${datosAux.equipos.map((q) => `<option value="${e(q.nombre)}"></option>`).join('')}</datalist>
      <datalist id="lista-lugares">${lugares.map((l) => `<option value="${e(l)}"></option>`).join('')}</datalist>
    </section>`;
  actualizarCalculados();
}

/** Integración y Luna del formulario, en vivo */
function actualizarCalculados() {
  const f = raiz.querySelector('#formulario');
  if (!f) return;
  const subs = parseInt(f.subs.value, 10), exp = parseFloat(f.exposicion.value.replace(',', '.'));
  raiz.querySelector('#integracion').textContent = subs > 0 && exp > 0 ? `= ${duracion((subs * exp) / 60)} de integración` : '';
  if (f.fecha.value) {
    const luna = faseLunar(new Date(f.fecha.value + 'T23:59'));
    raiz.querySelector('#dato-luna').textContent = `Luna esa noche: ${luna.nombre.toLowerCase()}, ${Math.round(luna.iluminada * 100)} % iluminada (se guarda con la sesión).`;
  }
}

/* ---------- Foto: leer, reducir con un canvas y convertir a JPEG ---------- */
async function procesarFoto(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();                                   // espera a que la imagen esté lista
    const { ancho, alto } = dimensionesMiniatura(img.naturalWidth, img.naturalHeight, 400);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho; lienzo.height = alto;
    lienzo.getContext('2d').drawImage(img, 0, 0, ancho, alto);
    return lienzo.toDataURL('image/jpeg', 0.78);          // texto "data:image/jpeg;base64,..."
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ==========================================================================
   Compartir una sesión como imagen (tarjeta 1080 × 1350, formato de Instagram)
   --------------------------------------------------------------------------
   Se dibuja en un <canvas>: fondo tinta, la miniatura de la foto, el objeto,
   los datos y la firma. En el iPhone se abre el menú Compartir; en el Mac se
   descarga como PNG.
   ========================================================================== */
async function compartirSesion(s, boton) {
  const texto = boton.querySelector('span');
  texto.textContent = 'Preparando…';
  try {
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    // Fondo: azul tinta con una retícula suave, como la app
    x.fillStyle = '#0b1222'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(201,168,92,0.08)'; x.lineWidth = 1;
    for (let i = 0; i < W; i += 54) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
    for (let j = 0; j < H; j += 54) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); }

    // Foto (si hay): cuadrada, arriba, con filete dorado
    let y = 70;
    if (s.foto) {
      const img = new Image(); img.src = s.foto; await img.decode();
      const lado = W - 140, k = Math.max(lado / img.width, lado / img.height);
      const w = img.width * k, h = img.height * k;
      x.save(); x.beginPath(); x.rect(70, y, lado, lado); x.clip();
      x.drawImage(img, 70 + (lado - w) / 2, y + (lado - h) / 2, w, h); x.restore();
      x.strokeStyle = '#c9a85c'; x.lineWidth = 3; x.strokeRect(70, y, lado, lado);
      y += lado + 60;
    } else { y = 260; }

    // Textos
    const serif = '"Instrument Serif", Georgia, serif', mono = '"IBM Plex Mono", Menlo, monospace', sans = '"Space Grotesk", system-ui, sans-serif';
    x.fillStyle = '#c9a85c'; x.font = `500 26px ${mono}`;
    x.fillText(fechaLarga(s.fecha).toUpperCase() + (s.lugar ? '  ·  ' + s.lugar.toUpperCase() : ''), 70, y); y += 20;
    x.fillStyle = '#ebe2cb'; x.font = `400 ${s.objeto.length > 18 ? 72 : 96}px ${serif}`;
    x.fillText(s.objeto, 66, y + 96); y += 140;
    const lineas = [
      s.equipo, s.filtro,
      s.subs ? `${s.subs} × ${String(s.exposicion).replace('.', ',')} s  ·  ${duracion(integracionMin(s))} de integración` : '',
      [s.bortle ? `Bortle ${s.bortle}` : '', s.sqm ? `SQM ${String(s.sqm).replace('.', ',')}` : '', s.luna != null ? `Luna ${Math.round(s.luna * 100)} %` : ''].filter(Boolean).join('  ·  '),
    ].filter(Boolean);
    x.fillStyle = '#b4b3ad'; x.font = `400 34px ${sans}`;
    for (const l of lineas) { x.fillText(l, 70, y); y += 50; }
    if (s.valoracion) { x.fillStyle = '#f2a33a'; x.font = `400 44px ${sans}`; x.fillText('★'.repeat(s.valoracion), 70, y + 10); }
    // Firma
    x.fillStyle = '#7d8496'; x.font = `400 26px ${mono}`;
    x.fillText('AstroKit · cjgaland.github.io/astrokit', 70, H - 60);

    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const nombre = `astrokit-${s.fecha}-${s.objeto.replace(/[^\w]+/g, '-').toLowerCase()}.png`;
    const archivo = new File([blob], nombre, { type: 'image/png' });
    if (navigator.canShare?.({ files: [archivo] }) && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ files: [archivo], title: `${s.objeto} · ${fechaCorta(s.fecha)}` }).catch(() => {});
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = nombre;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  } catch (err) {
    console.warn('Compartir:', err);
  } finally {
    texto.textContent = 'Compartir';
  }
}

/* ==========================================================================
   Copia de seguridad
   ========================================================================== */
function exportar() {
  // Todas las claves de AstroKit, tal cual
  const datos = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('astrokit:')) datos[k.slice('astrokit:'.length)] = leer(k.slice('astrokit:'.length));
  }
  const copia = { app: 'AstroKit', formato: 1, exportado: new Date().toISOString(), datos };
  const nombre = `astrokit-copia-${hoy()}.json`;
  const archivo = new File([JSON.stringify(copia, null, 1)], nombre, { type: 'application/json' });

  // En el iPhone/iPad, el menú Compartir permite guardarlo en Archivos/iCloud o mandarlo por AirDrop
  if (navigator.canShare?.({ files: [archivo] }) && matchMedia('(pointer: coarse)').matches) {
    navigator.share({ files: [archivo], title: 'Copia de AstroKit' }).catch(() => {});
    return;
  }
  // En el Mac: descarga normal
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  aviso(`Copia exportada: ${nombre}`);
}

async function importar(archivo) {
  let copia;
  try {
    copia = JSON.parse(await archivo.text());
  } catch {
    aviso('Ese archivo no es un JSON válido.'); return;
  }
  if (copia?.app !== 'AstroKit' || typeof copia.datos !== 'object') {
    aviso('Ese archivo no parece una copia de AstroKit.'); return;
  }
  const importadas = Array.isArray(copia.datos[CLAVE]) ? copia.datos[CLAVE] : [];
  const { lista, nuevas, actualizadas } = mezclarSesiones(sesiones, importadas);
  const otras = Object.keys(copia.datos).filter((k) => k !== CLAVE);
  const restaurarResto = otras.length && confirm(
    `La copia trae ${importadas.length} sesiones (${nuevas} nuevas, ${actualizadas} más recientes que las tuyas).\n\n` +
    '¿Restaurar también la checklist, los favoritos del glosario, los lugares y los ajustes? ' +
    '(Aceptar = sí; Cancelar = solo el cuaderno)');

  sesiones = lista;
  if (!guardarSesiones()) { aviso('No hay espacio suficiente en el dispositivo para importar.'); return; }
  if (restaurarResto) for (const k of otras) guardar(k, copia.datos[k]);
  pintarLista();
  aviso(`Importado: ${nuevas} sesiones nuevas y ${actualizadas} actualizadas${restaurarResto ? ', más el resto de datos' : ''}.`);
}

function aviso(texto) {
  const caja = raiz.querySelector('#estado-copia');
  if (caja) caja.textContent = texto;
}

/* ==========================================================================
   Eventos
   ========================================================================== */
function alHacerClic(ev) {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.accion === 'exportar') exportar();
  else if (b.dataset.accion === 'borrar') {
    const s = buscar(b.dataset.id);
    if (!confirm(`¿Borrar la sesión de ${s.objeto} del ${fechaCorta(s.fecha)}? No se puede deshacer (salvo desde una copia).`)) return;
    sesiones = sesiones.filter((x) => x.id !== s.id);
    guardarSesiones();
    location.hash = 'cuaderno';
  } else if (b.dataset.accion === 'compartir') {
    compartirSesion(buscar(b.dataset.id), b);
  } else if (b.dataset.accion === 'quitar-foto') {
    fotoNueva = null;
    raiz.querySelector('#vista-foto').innerHTML = icono('telescopio');
    b.remove();
  }
}

function alEscribir(ev) {
  if (ev.target.id === 'buscar-sesion') {
    consulta = ev.target.value;
    raiz.querySelector('#sesiones').innerHTML = tarjetasSesiones(ordenadas());
  } else if (ev.target.closest('#formulario')) {
    actualizarCalculados();
    if (ev.target.name === 'objeto') raiz.querySelector('#error-objeto').textContent = '';
  }
}

async function alCambiar(ev) {
  if (ev.target.id === 'importar' && ev.target.files[0]) {
    await importar(ev.target.files[0]);
  } else if (ev.target.id === 'foto' && ev.target.files[0]) {
    const estado = raiz.querySelector('#estado-formulario');
    estado.textContent = 'Preparando la miniatura…';
    try {
      fotoNueva = await procesarFoto(ev.target.files[0]);
      raiz.querySelector('#vista-foto').innerHTML = `<img src="${fotoNueva}" alt="">`;
      estado.textContent = '';
    } catch {
      estado.textContent = 'No se pudo leer esa imagen (prueba con JPEG o HEIC desde Fotos).';
    }
  } else if (ev.target.name === 'fecha') {
    actualizarCalculados();
  }
}

function alEnviar(ev) {
  if (ev.target.id !== 'formulario') return;
  ev.preventDefault();
  const f = ev.target;
  const objeto = f.objeto.value.trim();
  if (!objeto) {
    raiz.querySelector('#error-objeto').textContent = 'Escribe qué objeto fotografiaste.';
    f.objeto.focus();
    return;
  }
  const num = (t) => { const n = parseFloat(String(t).replace(',', '.')); return Number.isFinite(n) ? n : ''; };
  const ahora = new Date().toISOString();
  const id = f.dataset.id;
  const previa = id ? buscar(id) : null;
  const sesion = {
    id: id || 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    creado: previa?.creado || ahora,
    modificado: ahora,
    fecha: f.fecha.value || hoy(),
    objeto,
    lugar: f.lugar.value.trim(),
    equipo: f.equipo.value.trim(),
    filtro: f.filtro.value,
    subs: parseInt(f.subs.value, 10) || '',
    exposicion: num(f.exposicion.value),
    bortle: f.bortle.value ? Number(f.bortle.value) : '',
    sqm: num(f.sqm.value),
    valoracion: Number(f.valoracion.value) || 0,
    notas: f.notas.value.trim(),
    luna: Math.round(faseLunar(new Date((f.fecha.value || hoy()) + 'T23:59')).iluminada * 100) / 100,
    foto: fotoNueva === undefined ? (previa?.foto || null) : fotoNueva,
  };
  const copiaSeguridad = sesiones;
  sesiones = previa ? sesiones.map((s) => (s.id === id ? sesion : s)) : [...sesiones, sesion];
  if (!guardarSesiones()) {
    sesiones = copiaSeguridad;
    raiz.querySelector('#estado-formulario').textContent =
      'No queda espacio en el dispositivo. Exporta una copia y borra fotos de sesiones antiguas.';
    return;
  }
  location.hash = 'cuaderno/' + sesion.id;
}
