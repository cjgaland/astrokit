/* ==========================================================================
   util.js — Pequeñas herramientas que usan varios módulos
   ========================================================================== */

/* ---------- Carga de datos JSON ----------
   fetch() pide el archivo al servidor (o al service worker si no hay
   conexión). Guardamos el resultado en memoria para no pedirlo dos veces. */
const cacheJSON = new Map();

export async function cargarJSON(ruta) {
  if (!cacheJSON.has(ruta)) {
    const promesa = fetch(ruta).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar ${ruta} (${r.status})`);
      return r.json();
    });
    cacheJSON.set(ruta, promesa);
    promesa.catch(() => cacheJSON.delete(ruta)); // si falla, que se pueda reintentar
  }
  return cacheJSON.get(ruta);
}

/* ---------- Texto ---------- */

/** Evita que un texto se interprete como HTML (seguridad y corrección). */
export function escaparHTML(texto = '') {
  return String(texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Markdown "ligero": convierte **negrita** y *cursiva* en HTML.
 * Primero escapamos el texto, así cualquier < o > del JSON no rompe nada.
 */
export function mdLigero(texto = '') {
  return escaparHTML(texto)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

/** Quita las marcas de markdown: "*Deep Sky*" → "Deep Sky". */
export function sinMarcas(texto = '') {
  return String(texto).replace(/\*+/g, '');
}

/** Pone en mayúscula la primera letra ("es el mismo..." → "Es el mismo..."). */
export function capitalizar(texto = '') {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Normaliza para buscar: minúsculas y sin tildes ("Óptica" → "optica").
 * Se hace letra a letra para que el texto normalizado tenga EXACTAMENTE la
 * misma longitud que el original; así podemos marcar la coincidencia en el
 * texto original usando las mismas posiciones.
 */
export function normalizar(texto = '') {
  let salida = '';
  texto = String(texto);
  for (let i = 0; i < texto.length; i++) {
    const letra = texto[i];
    // NFD separa "á" en "a" + tilde; nos quedamos con la primera parte
    const base = letra.normalize('NFD')[0].toLowerCase();
    // algunas letras (p. ej. "ẞ") dan más de un carácter al pasar a minúscula
    salida += base.length === letra.length ? base : letra;
  }
  return salida;
}

/**
 * Resalta las palabras buscadas dentro de un texto plano.
 * Devuelve HTML seguro con <mark> alrededor de cada coincidencia.
 */
export function resaltar(texto, palabras) {
  texto = String(texto);
  if (!palabras.length) return escaparHTML(texto);
  const norm = normalizar(texto);
  // Marcamos qué posiciones del texto forman parte de alguna coincidencia
  const marcado = new Array(texto.length).fill(false);
  for (const p of palabras) {
    let desde = 0, i;
    while (p && (i = norm.indexOf(p, desde)) !== -1) {
      for (let k = i; k < i + p.length; k++) marcado[k] = true;
      desde = i + p.length;
    }
  }
  // Recorremos el texto abriendo y cerrando <mark> donde cambia el estado
  let html = '', abierto = false;
  for (let k = 0; k < texto.length; k++) {
    if (marcado[k] && !abierto) { html += '<mark>'; abierto = true; }
    if (!marcado[k] && abierto) { html += '</mark>'; abierto = false; }
    html += escaparHTML(texto[k]);
  }
  return html + (abierto ? '</mark>' : '');
}

/* ---------- DOM ---------- */

/** Atajo para crear un elemento a partir de un trozo de HTML. */
export function html(cadena) {
  const t = document.createElement('template');
  t.innerHTML = cadena.trim();
  return t.content.firstElementChild;
}

/** Icono del sprite de index.html. */
export function icono(nombre, clase = '') {
  return `<svg class="${clase}" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
}

/* ---------- Pestañas de una sección (Biblioteca, Cielo) ---------- */
const PESTANAS = {
  biblioteca: [{ id: 'glosario', texto: 'Glosario' }, { id: 'objetos', texto: 'Objetos celestes' }],
  cielo: [{ id: 'cielo', texto: 'Planificador' }, { id: 'mapa', texto: 'Mapa celeste' }],
};
/** HTML de la barra de pestañas de una sección, con la activa marcada */
export function pestanas(seccion, activa) {
  return `
    <nav class="pestanas" aria-label="Apartados">
      ${PESTANAS[seccion].map((p) => `<a class="pestanas__pestana" href="#${p.id}" ${p.id === activa ? 'aria-current="page"' : ''}>${p.texto}</a>`).join('')}
    </nav>`;
}
