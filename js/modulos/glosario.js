/* ==========================================================================
   modulos/glosario.js — Módulo 1: Glosario
   --------------------------------------------------------------------------
   Dos vistas:
     · Lista   (#glosario)          buscador, filtros por bloque y por estado,
                                    progreso de "ya lo sé".
     · Ficha   (#glosario/apertura) definición, analogía, la cuenta, regla
                                    práctica y "en tu equipo".

   Los datos vienen de data/glosario.json. Favoritos y "ya lo sé" se guardan
   en el dispositivo (localStorage) mediante almacen.js.

   Todo módulo exporta montar(contenedor, parametro) y devuelve un objeto con
   actualizar(parametro) y desmontar(), que es lo que usa el router de app.js.
   ========================================================================== */

import { cargarJSON, mdLigero, sinMarcas, capitalizar, normalizar, resaltar, escaparHTML, icono } from '../util.js';
import { leer, guardar, conjunto } from '../almacen.js';

/* ---------- Estado del módulo ----------
   Al ser un módulo ES, estas variables sobreviven aunque cambies de pantalla:
   al volver al glosario se conserva la búsqueda y la posición. */
const favoritos = conjunto('glosario:favoritos');
const sabidos = conjunto('glosario:sabidos');
const estado = {
  consulta: '',
  bloque: leer('glosario:bloque', 0),        // 0 = todos los bloques
  filtro: leer('glosario:filtro', 'todos'),  // todos | favoritos | pendientes | sabidos
  scrollLista: 0,
};

let datos = null;          // { bloques, terminos } del JSON
let indice = [];           // términos con su texto normalizado para buscar
let raiz = null;           // contenedor donde dibujamos
let vistaActual = null;    // 'lista' o el id de la ficha abierta

const FILTROS = [
  { id: 'todos', texto: 'Todos' },
  { id: 'pendientes', texto: 'Por aprender' },
  { id: 'sabidos', texto: 'Ya lo sé', icono: 'check' },
  { id: 'favoritos', texto: 'Favoritos', icono: 'estrella' },
];

/* ==========================================================================
   Montaje
   ========================================================================== */
export async function montar(contenedor, parametro) {
  raiz = contenedor;
  datos = await cargarJSON('data/glosario.json');

  // Preparamos un índice de búsqueda: por cada término, su nombre normalizado
  // y un "pajar" con todo su texto, para buscar sin tildes ni mayúsculas.
  indice = datos.terminos.map((t, orden) => ({
    t, orden,
    nombre: normalizar(sinMarcas(t.termino)),
    alias: normalizar(sinMarcas(t.alias)),
    pajar: normalizar(sinMarcas([
      t.termino, t.alias, t.definicion, t.analogia, t.cuenta, t.regla, t.equipo,
      ...(t.lista || []).flatMap((l) => [l.nombre, l.texto]),
    ].filter(Boolean).join(' '))),
  }));

  // Delegación de eventos: un solo "escuchador" en el contenedor atiende los
  // clics de todos los botones, aunque se redibujen.
  raiz.addEventListener('click', alHacerClic);
  raiz.addEventListener('input', alEscribir);
  document.addEventListener('keydown', atajosTeclado);

  actualizar(parametro);
  return { actualizar, desmontar };
}

function desmontar() {
  raiz.removeEventListener('click', alHacerClic);
  raiz.removeEventListener('input', alEscribir);
  document.removeEventListener('keydown', atajosTeclado);
  if (vistaActual === 'lista') estado.scrollLista = window.scrollY;
}

/** El router nos llama aquí cada vez que cambia lo que va detrás de #glosario/ */
function actualizar(parametro) {
  if (vistaActual === 'lista') estado.scrollLista = window.scrollY;
  const termino = parametro && datos.terminos.find((t) => t.id === parametro);
  if (termino) {
    pintarFicha(termino);
    window.scrollTo(0, 0);
  } else {
    pintarLista();
    requestAnimationFrame(() => window.scrollTo(0, estado.scrollLista));
  }
}

/* ==========================================================================
   Vista LISTA
   ========================================================================== */
function pintarLista() {
  vistaActual = 'lista';
  const total = datos.terminos.length;
  raiz.innerHTML = `
    <section class="glosario entrada">
      <header class="glosario__cabecera">
        <div>
          <span class="etiqueta">Módulo 01 · ${total} términos en ${datos.bloques.length} bloques</span>
          <h1 class="titular">Glosario<em>.</em></h1>
          <p class="entradilla">Del cielo al procesado, en el orden en que te lo vas a encontrar.
            Cada ficha tiene <span class="marca-texto">qué es</span>, una analogía, la cuenta
            y qué significa en tu equipo.</p>
        </div>
        <div class="progreso" id="progreso"></div>
      </header>

      <div class="buscador">
        ${icono('buscar', 'buscador__lupa')}
        <input id="busqueda" type="search" placeholder="Buscar: escala, Bortle, rotación…"
               autocomplete="off" autocorrect="off" spellcheck="false"
               aria-label="Buscar en el glosario" value="${escaparHTML(estado.consulta)}">
        <kbd class="buscador__atajo">/</kbd>
        <button class="boton-azar" data-accion="azar" type="button" title="Un término al azar de los que aún no sabes">
          ${icono('azar')}<span>Al azar</span>
        </button>
      </div>

      <div class="filtros" role="group" aria-label="Filtrar por bloque">
        <button class="chip" data-bloque="0" type="button">Todos</button>
        ${datos.bloques.map((b) => `
          <button class="chip" data-bloque="${b.id}" type="button" style="--color: var(--b${b.id})">
            <span class="chip__num">${b.id}</span>${b.corto}
          </button>`).join('')}
      </div>
      <div class="filtros filtros--estado" role="group" aria-label="Filtrar por estado">
        ${FILTROS.map((f) => `
          <button class="chip chip--estado" data-filtro="${f.id}" type="button">
            ${f.icono ? icono(f.icono) : ''}${f.texto}
          </button>`).join('')}
      </div>

      <div id="resultados" aria-live="polite"></div>
    </section>`;
  pintarProgreso();
  pintarResultados();
}

/** Barra de progreso: cuántos términos marcados como "ya lo sé" */
function pintarProgreso() {
  const caja = raiz.querySelector('#progreso');
  if (!caja) return;
  const total = datos.terminos.length;
  const n = datos.terminos.filter((t) => sabidos.tiene(t.id)).length;
  const pct = Math.round((n / total) * 100);
  // Un segmento por bloque, relleno según lo aprendido en ese bloque (dirección C: espectro)
  const segmentos = datos.bloques.map((b) => {
    const del = datos.terminos.filter((t) => t.bloque === b.id);
    const sab = del.filter((t) => sabidos.tiene(t.id)).length;
    return `<span style="flex:${del.length}; --color: var(--b${b.id}); --relleno:${(sab / del.length) * 100}%"
                  title="${b.corto}: ${sab}/${del.length}"></span>`;
  }).join('');
  caja.innerHTML = `
    <div class="progreso__cifra cifra"><strong>${n}</strong><span>/${total}</span></div>
    <div class="progreso__texto">ya lo sé · ${pct}%</div>
    <div class="progreso__barra">${segmentos}</div>`;
}

/** Busca y filtra; devuelve la lista de términos a mostrar, ordenada. */
function filtrar() {
  // Cada palabra de la búsqueda tiene que aparecer en algún sitio del término
  const palabras = normalizar(estado.consulta).split(/\s+/).filter(Boolean);
  let lista = indice.filter(({ t, pajar }) => {
    if (estado.bloque && t.bloque !== estado.bloque) return false;
    if (estado.filtro === 'favoritos' && !favoritos.tiene(t.id)) return false;
    if (estado.filtro === 'sabidos' && !sabidos.tiene(t.id)) return false;
    if (estado.filtro === 'pendientes' && sabidos.tiene(t.id)) return false;
    return palabras.every((p) => pajar.includes(p));
  });

  if (palabras.length) {
    // Puntuación: mejor si la búsqueda está en el nombre, y mejor aún al principio
    const frase = palabras.join(' ');
    const puntos = ({ nombre, alias }) =>
      (nombre.startsWith(frase) ? 100 : 0) +
      (nombre.includes(frase) ? 50 : 0) +
      (alias.includes(frase) ? 30 : 0) +
      palabras.filter((p) => nombre.includes(p)).length * 10;
    lista = lista
      .map((e) => ({ ...e, puntos: puntos(e) }))
      .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden);
  }
  return { lista, palabras };
}

function pintarResultados() {
  const caja = raiz.querySelector('#resultados');
  if (!caja) return;

  // Estado visual de los chips
  raiz.querySelectorAll('[data-bloque]').forEach((b) =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.bloque) === estado.bloque)));
  raiz.querySelectorAll('[data-filtro]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.filtro === estado.filtro)));

  const { lista, palabras } = filtrar();

  if (!lista.length) {
    caja.innerHTML = `
      <div class="vacio">
        <p class="vacio__titulo">Ni una estrella por aquí.</p>
        <p>${estado.filtro === 'favoritos' ? 'Marca términos con la estrella para tenerlos a mano.'
             : 'Prueba con otra palabra o quita algún filtro.'}</p>
      </div>`;
    return;
  }

  // Sin búsqueda: agrupado por bloques con su cabecera. Con búsqueda: por relevancia.
  if (!palabras.length) {
    caja.innerHTML = datos.bloques.map((b) => {
      const delBloque = lista.filter((e) => e.t.bloque === b.id);
      if (!delBloque.length) return '';
      return `
        <section class="bloque" style="--color: var(--b${b.id})">
          <header class="bloque__cabecera">
            <span class="bloque__num">${b.id}</span>
            <div>
              <h2 class="bloque__titulo">${escaparHTML(b.titulo)}</h2>
              <p class="bloque__sub">${escaparHTML(b.subtitulo)} · ${delBloque.length}</p>
            </div>
          </header>
          <ul class="tarjetas ${b.id === 8 ? 'tarjetas--siglas' : ''}">
            ${delBloque.map((e) => tarjeta(e.t, [])).join('')}
          </ul>
        </section>`;
    }).join('');
  } else {
    caja.innerHTML = `
      <p class="recuento cifra">${lista.length} resultado${lista.length === 1 ? '' : 's'}</p>
      <ul class="tarjetas">${lista.map((e) => tarjeta(e.t, palabras)).join('')}</ul>`;
  }
}

/** HTML de una tarjeta de la lista */
function tarjeta(t, palabras) {
  const bloque = datos.bloques.find((b) => b.id === t.bloque);
  // Extracto: la definición sin marcas. Algún término no tiene definición:
  // "Mosaico 8K" solo trae "en tu equipo" y "Las líneas clave" solo una lista.
  const extracto = sinMarcas(t.definicion || t.equipo || (t.lista || []).map((l) => l.nombre).join(' · '));
  const fav = favoritos.tiene(t.id);
  const sab = sabidos.tiene(t.id);
  return `
    <li class="tarjeta ${sab ? 'es-sabido' : ''}" style="--color: var(--b${t.bloque})">
      <a class="tarjeta__enlace" href="#glosario/${t.id}">
        <span class="tarjeta__bloque cifra">${t.bloque} · ${bloque.corto}</span>
        <span class="tarjeta__nombre">${resaltar(sinMarcas(t.termino), palabras)}</span>
        ${t.alias ? `<span class="tarjeta__alias">${resaltar(sinMarcas(t.alias), palabras)}</span>` : ''}
        <span class="tarjeta__extracto">${resaltar(extracto, palabras)}</span>
      </a>
      <div class="tarjeta__marcas">
        <button class="marcador marcador--fav" data-accion="fav" data-id="${t.id}" type="button"
                aria-pressed="${fav}" aria-label="Favorito">${icono('estrella')}</button>
        <button class="marcador marcador--sab" data-accion="sab" data-id="${t.id}" type="button"
                aria-pressed="${sab}" aria-label="Ya lo sé">${icono('check')}</button>
      </div>
    </li>`;
}

/* ==========================================================================
   Vista FICHA
   ========================================================================== */
function pintarFicha(t) {
  vistaActual = t.id;
  const bloque = datos.bloques.find((b) => b.id === t.bloque);
  // Anterior / siguiente dentro del mismo bloque
  const hermanos = datos.terminos.filter((x) => x.bloque === t.bloque);
  const i = hermanos.indexOf(t);
  const anterior = hermanos[i - 1];
  const siguiente = hermanos[i + 1];

  // Bloques opcionales de la ficha: solo se dibujan si el término los tiene
  const lista = t.lista?.length ? `
    <ul class="ficha__lista">
      ${t.lista.map((l) => `<li><strong>${mdLigero(l.nombre)}</strong> ${mdLigero(capitalizar(l.texto))}</li>`).join('')}
    </ul>` : '';
  const analogia = t.analogia ? `
    <aside class="capa capa--analogia">
      <span class="etiqueta">Analogía</span>
      <p>${mdLigero(capitalizar(t.analogia))}</p>
    </aside>` : '';
  const cuenta = t.cuenta ? `
    <aside class="capa capa--cuenta">
      <span class="etiqueta">${escaparHTML(t.cuentaEtiqueta || 'La cuenta')}</span>
      <p>${mdLigero(capitalizar(t.cuenta))}</p>
    </aside>` : '';
  const regla = t.regla ? `
    <aside class="capa capa--regla">
      <span class="etiqueta">${escaparHTML(t.reglaEtiqueta || 'Regla práctica')}</span>
      <p>${mdLigero(capitalizar(t.regla))}</p>
    </aside>` : '';
  const equipo = t.equipo ? `
    <aside class="capa capa--equipo">
      <span class="etiqueta">${icono('telescopio')} En tu equipo</span>
      <p>${mdLigero(capitalizar(t.equipo))}</p>
    </aside>` : '';

  raiz.innerHTML = `
    <article class="ficha entrada" style="--color: var(--b${t.bloque})">
      <nav class="ficha__migas">
        <a href="#glosario" class="ficha__volver">${icono('atras')}Glosario</a>
        <span class="ficha__bloque cifra">${bloque.id} · ${escaparHTML(bloque.titulo)}</span>
      </nav>

      <header class="ficha__cabecera">
        <h1 class="ficha__titulo">${mdLigero(t.termino)}</h1>
        ${t.alias ? `<p class="ficha__alias">${mdLigero(t.alias)}</p>` : ''}
        <div class="ficha__regla-color"></div>
      </header>

      <div class="ficha__cuerpo">
        ${t.definicion ? `<p class="ficha__definicion">${mdLigero(t.definicion)}</p>` : ''}
        ${lista}
        <div class="capas">${analogia}${cuenta}${regla}${equipo}</div>
      </div>

      <div class="ficha__acciones">
        <button class="boton-marca" data-accion="fav" data-id="${t.id}" type="button"
                aria-pressed="${favoritos.tiene(t.id)}">${icono('estrella')}<span>Favorito</span></button>
        <button class="boton-marca boton-marca--sab" data-accion="sab" data-id="${t.id}" type="button"
                aria-pressed="${sabidos.tiene(t.id)}">${icono('check')}<span>Ya lo sé</span></button>
      </div>

      ${verTambien(t)}

      <nav class="ficha__paso">
        ${anterior ? `<a href="#glosario/${anterior.id}" class="paso paso--ant">
            <span class="etiqueta">${icono('atras')} Anterior</span>
            <span class="paso__nombre">${escaparHTML(sinMarcas(anterior.termino))}</span></a>` : '<span></span>'}
        ${siguiente ? `<a href="#glosario/${siguiente.id}" class="paso paso--sig">
            <span class="etiqueta">Siguiente ${icono('sig')}</span>
            <span class="paso__nombre">${escaparHTML(sinMarcas(siguiente.termino))}</span></a>` : '<span></span>'}
      </nav>
    </article>`;
}

/** "Ver también": los términos relacionados (campo "relacionados" del JSON) */
function verTambien(t) {
  const relacionados = (t.relacionados || [])
    .map((id) => datos.terminos.find((x) => x.id === id))
    .filter(Boolean);
  if (!relacionados.length) return '';
  return `
    <aside class="ver-tambien">
      <span class="etiqueta">Ver también</span>
      <ul class="ver-tambien__lista">
        ${relacionados.map((r) => {
          const b = datos.bloques.find((x) => x.id === r.bloque);
          return `
          <li>
            <a class="relacionado" href="#glosario/${r.id}" style="--color: var(--b${r.bloque})">
              <span class="relacionado__bloque cifra">${r.bloque} · ${escaparHTML(b.corto)}</span>
              <span class="relacionado__nombre">${escaparHTML(sinMarcas(r.termino))}</span>
            </a>
          </li>`;
        }).join('')}
      </ul>
    </aside>`;
}

/* ==========================================================================
   Eventos
   ========================================================================== */
function alHacerClic(evento) {
  const boton = evento.target.closest('button');
  if (!boton) return;

  if (boton.dataset.bloque !== undefined) {
    estado.bloque = Number(boton.dataset.bloque);
    guardar('glosario:bloque', estado.bloque);
    pintarResultados();
    return;
  }
  if (boton.dataset.filtro) {
    estado.filtro = boton.dataset.filtro;
    guardar('glosario:filtro', estado.filtro);
    pintarResultados();
    return;
  }

  const { accion, id } = boton.dataset;
  if (accion === 'fav' || accion === 'sab') {
    const marcado = (accion === 'fav' ? favoritos : sabidos).alternar(id);
    // Actualizamos todos los botones de ese término que haya en pantalla
    raiz.querySelectorAll(`[data-accion="${accion}"][data-id="${id}"]`)
      .forEach((b) => b.setAttribute('aria-pressed', String(marcado)));
    if (accion === 'sab') {
      boton.closest('.tarjeta')?.classList.toggle('es-sabido', marcado);
      pintarProgreso();
    }
    return;
  }
  if (accion === 'azar') {
    // Preferimos un término que aún no sepas; si ya los sabes todos, cualquiera
    const pendientes = datos.terminos.filter((t) => !sabidos.tiene(t.id));
    const bolsa = pendientes.length ? pendientes : datos.terminos;
    location.hash = 'glosario/' + bolsa[Math.floor(Math.random() * bolsa.length)].id;
  }
}

function alEscribir(evento) {
  if (evento.target.id !== 'busqueda') return;
  estado.consulta = evento.target.value;
  pintarResultados();
}

function atajosTeclado(evento) {
  const escribiendo = /input|textarea|select/i.test(document.activeElement?.tagName);
  // "/" lleva al buscador (como en muchas webs)
  if (evento.key === '/' && !escribiendo && vistaActual === 'lista') {
    evento.preventDefault();
    raiz.querySelector('#busqueda')?.focus();
  }
  // En una ficha: flechas ← → para pasar de término, Esc para volver
  if (vistaActual !== 'lista' && !escribiendo) {
    if (evento.key === 'ArrowLeft') raiz.querySelector('.paso--ant')?.click();
    if (evento.key === 'ArrowRight') raiz.querySelector('.paso--sig')?.click();
    if (evento.key === 'Escape') location.hash = 'glosario';
  }
  // Esc dentro del buscador: borrar
  if (evento.key === 'Escape' && document.activeElement?.id === 'busqueda') {
    estado.consulta = '';
    document.activeElement.value = '';
    pintarResultados();
  }
}
