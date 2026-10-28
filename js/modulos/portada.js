/* ==========================================================================
   modulos/portada.js — Portada de AstroKit (#portada)
   --------------------------------------------------------------------------
   Pantalla de bienvenida: el logo grande, qué es la app, un botón para
   entrar, el mapa de los seis módulos y, abajo, la autoría con la versión
   instalada y la fecha de publicación.

   La versión la contesta el service worker (ver js/actualizaciones.js) y la
   fecha sale de data/novedades.json, así que no hay que tocar nada aquí al
   publicar: publicar_astrokit.sh ya actualiza ambas cosas.

   La segunda vez que se abre la app ya no hace falta pasar por aquí: el
   arranque (app.js) salta directo al Glosario; la portada sigue disponible
   pulsando el logo de la cabecera.
   ========================================================================== */

import { cargarJSON, escaparHTML, icono } from '../util.js';
import { versionActual, versionLegible } from '../actualizaciones.js';

// Las seis secciones, con la frase que las presenta en la portada
const SECCIONES = [
  { id: 'glosario', nombre: 'Glosario', icono: 'glosario', num: 1,
    texto: '155 términos del cielo al procesado, con analogías, la cuenta y qué significan en tu equipo.' },
  { id: 'optica', nombre: 'Óptica', icono: 'optica', num: 2,
    texto: 'Campo, escala de placa y luz recogida de cada telescopio; simulador de encuadre y cuánto tiempo necesitas.' },
  { id: 'cielo', nombre: 'Cielo', icono: 'cielo', num: 3,
    texto: 'La Luna, la noche astronómica y qué objetos conviene fotografiar hoy desde donde estés.' },
  { id: 'checklist', nombre: 'Checklist', icono: 'checklist', num: 4,
    texto: 'Lo que no puede faltar antes de salir al campo, para marcar con guantes.' },
  { id: 'cuaderno', nombre: 'Cuaderno', icono: 'cuaderno', num: 5,
    texto: 'El registro de cada noche, con foto, y la copia de seguridad de todos tus datos.' },
  { id: 'enlaces', nombre: 'Enlaces', icono: 'enlaces', num: 6,
    texto: 'El software para tu Mac y las webs de planificación.' },
];

let raiz = null;

export async function montar(contenedor) {
  raiz = contenedor;
  pintar();
  // Versión y fecha llegan un poco después: se rellenan cuando estén
  const [version, novedades] = await Promise.all([
    versionActual(),
    cargarJSON('data/novedades.json').catch(() => null),
  ]);
  if (!raiz.isConnected) return {};
  const entrada = novedades?.versiones.find((v) => v.version === version) || novedades?.versiones[0];
  const fecha = entrada?.fecha
    ? new Date(entrada.fecha + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const caja = raiz.querySelector('#portada-version');
  if (caja) {
    caja.textContent = [
      version ? versionLegible(version).replace('versión', 'Versión') : 'Versión web (sin instalar)',
      fecha,
    ].filter(Boolean).join(' · ');
  }
  return {};
}

function pintar() {
  raiz.innerHTML = `
    <section class="portada entrada">
      <header class="portada__cabecera">
        <svg class="grafico portada__logo" viewBox="0 0 32 32" aria-hidden="true"><use href="#i-marca"/></svg>
        <h1 class="portada__titulo">Astro<em>Kit</em></h1>
        <p class="portada__lema">Tu cuaderno de campo para la astrofotografía</p>
        <p class="portada__descripcion">Para aprender astrofotografía y para salir a hacerla: glosario,
          calculadora óptica, planificador de la noche, checklist y cuaderno de sesiones. En el bolsillo,
          sin cobertura y con modo noche en rojo.</p>
        <a class="boton-principal portada__entrar" href="#glosario">Entrar${icono('sig')}</a>
      </header>

      <div class="espectro portada__espectro" aria-hidden="true">
        ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<span style="background: var(--b${n})"></span>`).join('')}
      </div>

      <ul class="portada__secciones">
        ${SECCIONES.map((s) => `
          <li>
            <a class="seccion" href="#${s.id}" style="--color: var(--b${s.num})">
              ${icono(s.icono, 'seccion__icono')}
              <span class="seccion__cuerpo">
                <span class="seccion__nombre">${escaparHTML(s.nombre)}<span class="seccion__num cifra">0${s.num}</span></span>
                <span class="seccion__texto">${escaparHTML(s.texto)}</span>
              </span>
            </a>
          </li>`).join('')}
      </ul>

      <footer class="portada__pie">
        <p class="portada__autor">Carlos J. Galán Doval · Córdoba</p>
        <p class="portada__version cifra" id="portada-version">Comprobando la versión…</p>
        <p class="nota">Tus datos (cuaderno, favoritos, lugares) se guardan solo en este dispositivo.</p>
      </footer>
    </section>`;
}
