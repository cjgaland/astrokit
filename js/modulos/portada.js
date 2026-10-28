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
import { listaEquipos, idMiEquipo, elegirMiEquipo, selectorMiEquipo } from '../equipo.js';

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
  { id: 'info', nombre: 'Info', icono: 'info', num: 7,
    texto: 'Versión instalada, historial de cambios, manual de uso en PDF y sugerencias.' },
];

let raiz = null;

export async function montar(contenedor) {
  raiz = contenedor;
  pintar();
  raiz.addEventListener('change', alCambiar);
  pintarEstaNoche();          // va por su cuenta: tarda unas décimas en calcular
  pintarMiEquipo();
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
  return { desmontar: () => raiz.removeEventListener('change', alCambiar) };
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
        <a class="boton-principal portada__entrar" href="#glosario" aria-label="Entrar en AstroKit (abre el Glosario)">Entrar${icono('sig')}</a>
      </header>

      <!-- Resumen de la noche de hoy (lo rellena pintarEstaNoche con los cálculos del Planificador) -->
      <section class="esta-noche" id="esta-noche" aria-live="polite">
        <span class="etiqueta">Esta noche</span>
        <p class="nota">Calculando el cielo de hoy…</p>
      </section>

      <div class="mi-equipo-portada" id="mi-equipo-portada"></div>

      <div class="espectro portada__espectro" aria-hidden="true">
        ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<span style="background: var(--b${n})"></span>`).join('')}
      </div>

      <nav aria-label="Secciones de AstroKit"><ul class="portada__secciones">
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
      </ul></nav>

      <footer class="portada__pie">
        <p class="portada__autor">Carlos J. Galán Doval · Córdoba</p>
        <p class="portada__version cifra" id="portada-version">Comprobando la versión…</p>
        <p class="nota">Tus datos (cuaderno, favoritos, lugares) se guardan solo en este dispositivo.</p>
      </footer>
    </section>`;
}

/* ---------- «Esta noche»: la Luna, la noche astronómica y los 3 mejores objetos ---------- */
async function pintarEstaNoche() {
  const caja = raiz.querySelector('#esta-noche');
  try {
    // El módulo Cielo hace todo el cálculo; aquí solo se resume
    const C = await import('./cielo.js');
    await C.prepararCatalogo();
    const n = C.calcularNoche();
    if (!raiz.isConnected) return;
    const hora = (f) => f ? f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—';
    const duracion = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')} min` : ''}` : `${m} min`; };
    // Los tres con más tiempo útil, sin la Luna y con un planeta como mucho
    // (Urano y Neptuno pasan muchas horas altos pero son puntitos: no deben copar la lista)
    const mejores = [];
    let planetas = 0;
    for (const x of n.objetos) {
      if (x.util < 60 || x.o.tipo === 'luna') continue;
      if (x.o.tipo === 'planeta' && planetas++ >= 1) continue;
      mejores.push(x);
      if (mejores.length === 3) break;
    }
    const lunaPct = Math.round(n.fase.iluminada * 100);
    caja.innerHTML = `
      <div class="esta-noche__cabecera">
        <span class="etiqueta">Esta noche · ${escaparHTML(n.lugar.nombre)}</span>
        <a class="esta-noche__mas" href="#cielo">Ver el planificador ${icono('sig')}</a>
      </div>
      <div class="esta-noche__datos">
        <div class="esta-noche__dato">
          <span class="esta-noche__cifra cifra">${lunaPct} %</span>
          <span class="esta-noche__texto">${escaparHTML(n.fase.nombre)}</span>
        </div>
        <div class="esta-noche__dato">
          <span class="esta-noche__cifra cifra">${hora(n.s.astronomico.inicio)}</span>
          <span class="esta-noche__texto">noche astronómica</span>
        </div>
        <div class="esta-noche__dato">
          <span class="esta-noche__cifra cifra">${duracion(n.oscuroSinLuna)}</span>
          <span class="esta-noche__texto">oscuro y sin Luna</span>
        </div>
      </div>
      ${mejores.length ? `
        <ul class="esta-noche__objetos">
          ${mejores.map((x) => `
            <li><a href="#cielo">
              <span class="esta-noche__objeto">${escaparHTML(x.o.nombre)}</span>
              <span class="esta-noche__meta cifra">${escaparHTML(x.o.catalogo)} · ${Math.round(x.altMax)}° · ${duracion(x.util)}</span>
            </a></li>`).join('')}
        </ul>` : '<p class="nota">Ningún objeto a buena altura con noche cerrada: prueba a mirar el Sistema Solar.</p>'}`;
  } catch (e) {
    console.warn('Resumen de la noche:', e);
    caja.innerHTML = '<span class="etiqueta">Esta noche</span><p class="nota">No se pudo calcular el cielo de hoy.</p>';
  }
}

/* ---------- «Mi equipo» ---------- */
async function pintarMiEquipo() {
  const equipos = await listaEquipos();
  const caja = raiz.querySelector('#mi-equipo-portada');
  if (caja) caja.innerHTML = selectorMiEquipo(equipos) + '<span class="nota">Lo usan la calculadora, el planificador y el cuaderno.</span>';
}

function alCambiar(e) {
  if (e.target.id === 'selector-mi-equipo') elegirMiEquipo(e.target.value);
}
