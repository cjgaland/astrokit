/* ==========================================================================
   modulos/checklist.js — Módulo 4: Checklist de salida al campo
   --------------------------------------------------------------------------
   · La lista ORIGINAL está en data/checklist.json.
   · Si la editas desde la app, tu versión se guarda en el dispositivo
     ("checklist:lista") y a partir de entonces manda la tuya. «Restaurar
     lista original» la borra y vuelve a la del JSON.
   · Lo marcado se guarda aparte ("checklist:marcados"), así reiniciar no
     toca la lista, solo desmarca.

   Pensada para usarla de noche y con guantes: filas grandes, toda la fila
   se puede pulsar y la opción de ocultar lo ya hecho.
   ========================================================================== */

import { cargarJSON, escaparHTML, icono } from '../util.js';
import { leer, guardar, borrar } from '../almacen.js';

/* ---------- Funciones puras (se prueban en pruebas/pruebas.html) ---------- */

/** Cuenta elementos marcados y totales: { hechos, total } */
export function progreso(items, marcados) {
  return { hechos: items.filter((i) => marcados.has(i.id)).length, total: items.length };
}

/** Devuelve una copia del array con el elemento i movido `paso` posiciones (−1 arriba, +1 abajo) */
export function mover(lista, i, paso) {
  const j = i + paso;
  if (j < 0 || j >= lista.length) return lista.slice();
  const copia = lista.slice();
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

/** Identificador nuevo y único para elementos creados a mano */
const nuevoId = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- Estado ---------- */
let grupos = [];                                        // la lista activa (original o la tuya)
let marcados = new Set(leer('checklist:marcados', []));
let editando = false;
let ocultarHechos = leer('checklist:ocultar', false);
let raiz = null;
let primeraVez = true;                                  // la animación de entrada, solo al abrir

const guardarMarcados = () => {
  guardar('checklist:marcados', [...marcados]);
  guardar('checklist:revisada', new Date().toISOString());
};
const guardarLista = () => guardar('checklist:lista', grupos);
const todosLosItems = () => grupos.flatMap((g) => g.items);

/* ==========================================================================
   Montaje
   ========================================================================== */
export async function montar(contenedor) {
  raiz = contenedor;
  primeraVez = true;
  const propia = leer('checklist:lista', null);
  grupos = propia || structuredClone((await cargarJSON('data/checklist.json')).grupos);
  raiz.addEventListener('click', alHacerClic);
  raiz.addEventListener('change', alCambiar);
  raiz.addEventListener('keydown', alPulsarTecla);
  pintar();
  return { desmontar };
}

function desmontar() {
  raiz.removeEventListener('click', alHacerClic);
  raiz.removeEventListener('change', alCambiar);
  raiz.removeEventListener('keydown', alPulsarTecla);
}

/* ==========================================================================
   Pintar
   ========================================================================== */
function pintar() {
  const { hechos, total } = progreso(todosLosItems(), marcados);
  const revisada = leer('checklist:revisada', null);
  const completa = total > 0 && hechos === total;

  raiz.innerHTML = `
    <section class="checklist ${primeraVez ? 'entrada' : ''} ${editando ? 'esta-editando' : ''}">
      <header class="modulo__cabecera checklist__cabecera">
        <div>
          <span class="etiqueta">Módulo 04 · Salida al campo</span>
          <h1 class="titular">Checklist <em>de salida</em>.</h1>
          <p class="entradilla">Repásala antes de cargar el coche. Toca cada fila para marcarla;
            se guarda sola aunque cierres la app.</p>
        </div>
        <div class="progreso">
          <div class="progreso__cifra cifra"><strong>${hechos}</strong><span>/${total}</span></div>
          <div class="progreso__texto">${completa ? 'todo listo' : 'preparado'}${revisada && hechos ? ` · ${new Date(revisada).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</div>
          <div class="progreso__barra">${grupos.map((g, i) => {
            const p = progreso(g.items, marcados);
            return `<span style="flex:${Math.max(p.total, 1)}; --color: var(--b${(i % 8) + 1}); --relleno:${p.total ? (p.hechos / p.total) * 100 : 0}%"></span>`;
          }).join('')}</div>
        </div>
      </header>

      <div class="checklist__barra">
        ${editando ? '' : `<button class="chip chip--estado" type="button" data-accion="ocultar" aria-pressed="${ocultarHechos}">${icono('check')}Ocultar lo hecho</button>`}
        ${editando ? '' : '<button class="boton-sec" type="button" data-accion="reiniciar">' + icono('azar') + 'Reiniciar</button>'}
        <button class="boton-sec ${editando ? 'boton-sec--activo' : ''}" type="button" data-accion="editar">${icono('cuaderno')}${editando ? 'Terminar de editar' : 'Editar la lista'}</button>
      </div>

      ${completa && !editando ? `
        <div class="enhorabuena">
          <p class="enhorabuena__titulo">Todo listo.</p>
          <p>Cielos despejados. Cuando vuelvas, pulsa «Reiniciar» para la próxima salida.</p>
        </div>` : ''}

      <div class="grupos">${grupos.map((g, i) => editando ? grupoEditable(g, i) : grupo(g, i)).join('')}</div>

      ${editando ? `
        <div class="checklist__pie">
          <button class="boton-sec" type="button" data-accion="nuevo-grupo">+ Añadir grupo</button>
          <button class="boton-sec boton-sec--peligro" type="button" data-accion="restaurar">Restaurar lista original</button>
        </div>
        <p class="nota">Tus cambios se guardan en este dispositivo. «Restaurar» vuelve a la lista de <code>data/checklist.json</code>.</p>` : ''}
    </section>`;
  primeraVez = false;
}

/** Grupo en modo normal: filas que se marcan */
function grupo(g, i) {
  const p = progreso(g.items, marcados);
  const visibles = ocultarHechos ? g.items.filter((it) => !marcados.has(it.id)) : g.items;
  const listo = p.total > 0 && p.hechos === p.total;
  if (ocultarHechos && !visibles.length) return '';
  return `
    <section class="grupo ${listo ? 'esta-listo' : ''}" style="--color: var(--b${(i % 8) + 1})">
      <header class="grupo__cabecera">
        <h2 class="grupo__titulo">${escaparHTML(g.titulo)}</h2>
        <span class="grupo__cuenta cifra">${listo ? icono('check') + ' listo' : `${p.hechos}/${p.total}`}</span>
      </header>
      <ul class="tareas">
        ${visibles.map((it) => {
          const hecho = marcados.has(it.id);
          return `
          <li>
            <button class="tarea ${hecho ? 'esta-hecha' : ''}" type="button" role="checkbox" aria-checked="${hecho}" data-marcar="${it.id}">
              <span class="tarea__casilla">${icono('check')}</span>
              <span class="tarea__texto">
                <span>${escaparHTML(it.texto)}</span>
                ${it.nota ? `<small>${escaparHTML(it.nota)}</small>` : ''}
              </span>
            </button>
          </li>`;
        }).join('')}
      </ul>
    </section>`;
}

/** Grupo en modo edición: campos de texto, mover, borrar y añadir */
function grupoEditable(g, i) {
  return `
    <section class="grupo grupo--editable" style="--color: var(--b${(i % 8) + 1})">
      <header class="grupo__cabecera">
        <input class="editable editable--titulo" type="text" value="${escaparHTML(g.titulo)}"
               data-grupo="${g.id}" data-campo="titulo" aria-label="Nombre del grupo">
        <span class="botonera">
          <button class="boton-icono" type="button" data-accion="subir-grupo" data-grupo="${g.id}" aria-label="Subir grupo">${icono('arriba')}</button>
          <button class="boton-icono" type="button" data-accion="bajar-grupo" data-grupo="${g.id}" aria-label="Bajar grupo">${icono('abajo')}</button>
          <button class="boton-icono boton-icono--peligro" type="button" data-accion="borrar-grupo" data-grupo="${g.id}" aria-label="Borrar grupo">${icono('cerrar')}</button>
        </span>
      </header>
      <ul class="tareas tareas--editables">
        ${g.items.map((it) => `
          <li class="tarea-editable">
            <span class="tarea-editable__campos">
              <input class="editable" type="text" value="${escaparHTML(it.texto)}" data-item="${it.id}" data-campo="texto" aria-label="Texto">
              <input class="editable editable--nota" type="text" value="${escaparHTML(it.nota || '')}" placeholder="Nota (opcional)" data-item="${it.id}" data-campo="nota" aria-label="Nota">
            </span>
            <span class="botonera">
              <button class="boton-icono" type="button" data-accion="subir" data-item="${it.id}" aria-label="Subir">${icono('arriba')}</button>
              <button class="boton-icono" type="button" data-accion="bajar" data-item="${it.id}" aria-label="Bajar">${icono('abajo')}</button>
              <button class="boton-icono boton-icono--peligro" type="button" data-accion="borrar" data-item="${it.id}" aria-label="Borrar">${icono('cerrar')}</button>
            </span>
          </li>`).join('')}
      </ul>
      <div class="anadir">
        <input class="editable" type="text" placeholder="Nuevo elemento…" data-nuevo="${g.id}" aria-label="Nuevo elemento en ${escaparHTML(g.titulo)}">
        <button class="boton-sec" type="button" data-accion="anadir" data-grupo="${g.id}">Añadir</button>
      </div>
    </section>`;
}

/* ==========================================================================
   Eventos
   ========================================================================== */
const buscarItem = (id) => {
  for (const g of grupos) {
    const i = g.items.findIndex((it) => it.id === id);
    if (i >= 0) return { g, i };
  }
  return null;
};

function alHacerClic(ev) {
  const b = ev.target.closest('button');
  if (!b) return;

  // Marcar / desmarcar. Se redibuja todo, pero la altura no cambia y la pantalla no salta
  // (salvo con «Ocultar lo hecho», donde la fila desaparece a propósito)
  if (b.dataset.marcar) {
    const id = b.dataset.marcar;
    marcados.has(id) ? marcados.delete(id) : marcados.add(id);
    guardarMarcados();
    pintar();
    return;
  }

  const { accion } = b.dataset;
  const y = window.scrollY;
  switch (accion) {
    case 'ocultar':
      ocultarHechos = !ocultarHechos;
      guardar('checklist:ocultar', ocultarHechos);
      break;
    case 'reiniciar':
      if (!marcados.size || !confirm('¿Desmarcar todo para una nueva salida?')) return;
      marcados = new Set();
      guardarMarcados();
      break;
    case 'editar':
      editando = !editando;
      break;
    case 'subir': case 'bajar': {
      const r = buscarItem(b.dataset.item);
      r.g.items = mover(r.g.items, r.i, accion === 'subir' ? -1 : 1);
      guardarLista();
      break;
    }
    case 'borrar': {
      const r = buscarItem(b.dataset.item);
      r.g.items.splice(r.i, 1);
      marcados.delete(b.dataset.item);
      guardarLista(); guardarMarcados();
      break;
    }
    case 'anadir': anadirElemento(b.dataset.grupo); break;
    case 'subir-grupo': case 'bajar-grupo': {
      const i = grupos.findIndex((g) => g.id === b.dataset.grupo);
      grupos = mover(grupos, i, accion === 'subir-grupo' ? -1 : 1);
      guardarLista();
      break;
    }
    case 'borrar-grupo': {
      const g = grupos.find((x) => x.id === b.dataset.grupo);
      if (!confirm(`¿Borrar el grupo «${g.titulo}» y sus ${g.items.length} elementos?`)) return;
      grupos = grupos.filter((x) => x !== g);
      guardarLista();
      break;
    }
    case 'nuevo-grupo':
      grupos.push({ id: nuevoId(), titulo: 'Nuevo grupo', items: [] });
      guardarLista();
      break;
    case 'restaurar':
      if (!confirm('¿Volver a la lista original? Perderás tus cambios en la lista (no lo marcado).')) return;
      borrar('checklist:lista');
      cargarJSON('data/checklist.json').then((d) => { grupos = structuredClone(d.grupos); pintar(); });
      return;
    default: return;
  }
  pintar();
  window.scrollTo(0, y);
}

function anadirElemento(idGrupo) {
  const campo = raiz.querySelector(`[data-nuevo="${idGrupo}"]`);
  const texto = campo.value.trim();
  if (!texto) { campo.focus(); return; }
  grupos.find((g) => g.id === idGrupo).items.push({ id: nuevoId(), texto });
  guardarLista();
  const y = window.scrollY;
  pintar();
  window.scrollTo(0, y);
  raiz.querySelector(`[data-nuevo="${idGrupo}"]`)?.focus();   // listo para escribir otro
}

/* Los textos se guardan al salir del campo ("change"), sin redibujar, para no perder el foco */
function alCambiar(ev) {
  const t = ev.target;
  if (t.dataset.campo === 'titulo') {
    grupos.find((g) => g.id === t.dataset.grupo).titulo = t.value.trim() || 'Sin nombre';
  } else if (t.dataset.item) {
    const r = buscarItem(t.dataset.item);
    const valor = t.value.trim();
    if (t.dataset.campo === 'nota') {
      if (valor) r.g.items[r.i].nota = valor; else delete r.g.items[r.i].nota;
    } else if (valor) {
      r.g.items[r.i].texto = valor;
    }
  } else return;
  guardarLista();
}

/* Intro en "Nuevo elemento…" equivale a pulsar Añadir */
function alPulsarTecla(ev) {
  if (ev.key === 'Enter' && ev.target.dataset.nuevo) {
    ev.preventDefault();
    anadirElemento(ev.target.dataset.nuevo);
  }
}
