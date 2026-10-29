/* ==========================================================================
   app.js — Arranque de AstroKit
   --------------------------------------------------------------------------
   Se encarga de:
     1. Dibujar la barra de navegación con los módulos.
     2. El "router": mirar la dirección (#glosario, #glosario/apertura...)
        y montar el módulo que toca.
     3. Los temas: claro / oscuro / auto, y el modo noche con su atenuador.
     4. Registrar el service worker (sin conexión) y avisar de actualizaciones.

   Cómo funciona el router: todo lo que va detrás de "#" en la dirección
   no recarga la página; el navegador solo avisa con el evento "hashchange".
   Así cada pantalla tiene su propia dirección (sirve el botón Atrás y los
   marcadores) sin necesitar un servidor que entienda rutas.
   ========================================================================== */

import { leer, guardar } from './almacen.js';
import { icono } from './util.js';
import { iniciarActualizaciones } from './actualizaciones.js';

/* ---------- 1. Lista de módulos ----------
   `cargar` importa el código del módulo solo cuando hace falta (import()
   dinámico): la app arranca más rápido. Los que aún no existen llevan la
   fase en la que se construirán. */
const MODULOS = [
  // La portada no sale en la barra de navegación (enNav: false): se llega a ella pulsando el logo
  { id: 'portada', nombre: 'Portada', icono: 'marca', enNav: false,
    cargar: () => import('./modulos/portada.js') },
  // «Biblioteca» agrupa dos pestañas: Glosario y Objetos celestes (grupo: 'glosario')
  { id: 'glosario', nombre: 'Biblioteca', titulo: 'Glosario', icono: 'glosario',
    cargar: () => import('./modulos/glosario.js') },
  { id: 'objetos', nombre: 'Objetos celestes', icono: 'glosario', enNav: false, grupo: 'glosario',
    cargar: () => import('./modulos/objetos.js') },
  { id: 'optica', nombre: 'Óptica', icono: 'optica',
    cargar: () => import('./modulos/optica.js') },
  // «Cielo» agrupa tres pestañas: Planificador, Mapa celeste y Efemérides (grupo: 'cielo')
  { id: 'cielo', nombre: 'Cielo', titulo: 'Planificador', icono: 'cielo',
    cargar: () => import('./modulos/cielo.js') },
  { id: 'mapa', nombre: 'Mapa celeste', icono: 'cielo', enNav: false, grupo: 'cielo',
    cargar: () => import('./modulos/mapa.js') },
  { id: 'efemerides', nombre: 'Efemérides', icono: 'cielo', enNav: false, grupo: 'cielo',
    cargar: () => import('./modulos/efemerides.js') },
  { id: 'checklist', nombre: 'Checklist', icono: 'checklist',
    cargar: () => import('./modulos/checklist.js') },
  { id: 'cuaderno', nombre: 'Cuaderno', icono: 'cuaderno',
    cargar: () => import('./modulos/cuaderno.js') },
  { id: 'enlaces', nombre: 'Enlaces', icono: 'enlaces',
    cargar: () => import('./modulos/enlaces.js') },
  { id: 'info', nombre: 'Info', icono: 'info',
    cargar: () => import('./modulos/info.js') },
];
// La primera vez se entra por la portada; las siguientes, directo al glosario
const MODULO_INICIAL = leer('yaAbierta', false) ? 'glosario' : 'portada';

const contenido = document.getElementById('contenido');
const tituloModulo = document.getElementById('titulo-modulo');
const nav = document.getElementById('navegacion');

/* ---------- Navegación ---------- */
function dibujarNavegacion() {
  nav.innerHTML = MODULOS.filter((m) => m.enNav !== false).map((m, i) => `
    <a class="nav__enlace" href="#${m.id}" data-modulo="${m.id}">
      ${icono(m.icono)}
      <span>${m.nombre}</span>
      <span class="nav__num">${String(i + 1).padStart(2, '0')}</span>
    </a>`).join('');
}

/* ---------- 2. Router ---------- */
let moduloActivo = null;       // el objeto del módulo montado ahora mismo
let idActivo = null;

async function enrutar() {
  // "#glosario/apertura" → id = "glosario", parametro = "apertura"
  const [id, ...resto] = decodeURIComponent(location.hash.slice(1)).split('/');
  const modulo = MODULOS.find((m) => m.id === id);
  if (!modulo) { location.replace('#' + MODULO_INICIAL); return; }
  const parametro = resto.join('/') || null;

  // Marcar el enlace activo en la navegación
  nav.querySelectorAll('.nav__enlace').forEach((a) => {
    if (a.dataset.modulo === (modulo.grupo || id)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  tituloModulo.textContent = modulo.id === 'portada' ? '' : (modulo.titulo || modulo.nombre);
  document.body.classList.toggle('en-portada', modulo.id === 'portada');
  if (modulo.id !== 'portada') guardar('yaAbierta', true);

  // Si seguimos en el mismo módulo y sabe actualizarse (p. ej. abrir una ficha
  // del glosario), le pasamos el nuevo parámetro sin desmontarlo.
  if (idActivo === id && moduloActivo?.actualizar) {
    moduloActivo.actualizar(parametro);
    return;
  }

  // Desmontar el anterior (por si tenía algo que limpiar)
  moduloActivo?.desmontar?.();
  moduloActivo = null;
  idActivo = id;
  contenido.innerHTML = '';

  if (!modulo.cargar) { pintarProximamente(modulo); return; }

  try {
    const codigo = await modulo.cargar();
    if (idActivo !== id) return;          // el usuario ya se fue a otro sitio
    moduloActivo = await codigo.montar(contenido, parametro);
  } catch (error) {
    console.error(error);
    contenido.innerHTML = `
      <div class="pronto">
        ${icono('cerrar')}
        <h1 class="titular">Algo ha fallado</h1>
        <p class="entradilla">${error.message}</p>
      </div>`;
  }
}

function pintarProximamente(modulo) {
  contenido.innerHTML = `
    <section class="pronto entrada">
      ${icono(modulo.icono)}
      <span class="etiqueta">Módulo ${String(MODULOS.indexOf(modulo) + 1).padStart(2, '0')}</span>
      <h1 class="titular">${modulo.nombre}<em>.</em></h1>
      <p class="entradilla">${modulo.resumen}</p>
      <span class="pronto__fase">En construcción · fase ${modulo.fase}</span>
    </section>`;
}

/* ---------- 3. Temas y modo noche ---------- */
const raiz = document.documentElement;
const botonTema = document.getElementById('boton-tema');
const botonNoche = document.getElementById('boton-noche');
const brillo = document.getElementById('brillo-noche');
const velo = document.getElementById('velo');

// Ciclo del botón de tema: auto → claro → oscuro → auto...
const TEMAS = {
  auto:   { siguiente: 'claro',  icono: 'auto', texto: 'Tema automático (según el sistema)' },
  claro:  { siguiente: 'oscuro', icono: 'sol',  texto: 'Tema claro' },
  oscuro: { siguiente: 'auto',   icono: 'oscuro', texto: 'Tema oscuro' },
};

function aplicarTema(tema) {
  raiz.dataset.tema = tema;
  guardar('tema', tema);
  botonTema.innerHTML = icono(TEMAS[tema].icono);
  botonTema.setAttribute('aria-label', `${TEMAS[tema].texto}. Pulsa para cambiar.`);
  botonTema.title = TEMAS[tema].texto;
  actualizarColorBarra();
}

function aplicarNoche(activo) {
  if (activo) raiz.dataset.noche = 'si'; else delete raiz.dataset.noche;
  guardar('noche', activo);
  botonNoche.setAttribute('aria-pressed', String(activo));
  actualizarColorBarra();
}

function aplicarBrillo(valor) {
  velo.style.opacity = valor / 100;
  brillo.value = valor;
  guardar('brilloNoche', Number(valor));
}

/* La barra de estado del móvil toma el color de <meta name="theme-color">.
   Lo igualamos al fondo actual, leyendo la variable CSS --fondo. */
function actualizarColorBarra() {
  const color = getComputedStyle(raiz).getPropertyValue('--fondo').trim();
  document.querySelector('meta[name="theme-color"]').setAttribute('content', color || '#0b1222');
}

botonTema.addEventListener('click', () => aplicarTema(TEMAS[raiz.dataset.tema]?.siguiente || 'auto'));
botonNoche.addEventListener('click', () => aplicarNoche(raiz.dataset.noche !== 'si'));
brillo.addEventListener('input', () => aplicarBrillo(brillo.value));
// Si el sistema cambia entre claro y oscuro (p. ej. al anochecer) y estamos en "auto"
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', actualizarColorBarra);

/* ---------- 4. Service worker y aviso de actualizaciones ----------
   Todo está en js/actualizaciones.js: registra el service worker y, cuando se
   publica una versión nueva, muestra el aviso «Hay una versión nueva · Actualizar». */

/* ---------- Arranque ---------- */
dibujarNavegacion();
aplicarTema(leer('tema', 'auto'));
aplicarNoche(leer('noche', false));
aplicarBrillo(leer('brilloNoche', 0));
window.addEventListener('hashchange', enrutar);
enrutar();
iniciarActualizaciones();
