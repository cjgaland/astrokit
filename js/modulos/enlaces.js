/* ==========================================================================
   modulos/enlaces.js — Módulo 6: Enlaces útiles
   --------------------------------------------------------------------------
   Software para Mac y webs de planificación, desde data/enlaces.json.
   Si una URL lleva {lat} y {lon} (p. ej. Clear Outside), se rellenan con el
   lugar elegido en el Planificador, para abrir directamente su previsión.

   Es el único módulo que necesita conexión (son webs externas); se avisa
   arriba si el dispositivo está sin red.
   ========================================================================== */

import { cargarJSON, escaparHTML, icono } from '../util.js';
import { leer } from '../almacen.js';

const NIVELES = {
  empezar: 'Para empezar',
  intermedio: 'Intermedio',
  opcional: 'Opcional',
  futuro: 'Más adelante',
};

let raiz = null;

export async function montar(contenedor) {
  raiz = contenedor;
  const datos = await cargarJSON('data/enlaces.json');
  pintar(datos);
  // Avisar en vivo si se pierde o recupera la conexión
  const repintar = () => pintar(datos);
  window.addEventListener('online', repintar);
  window.addEventListener('offline', repintar);
  return {
    desmontar: () => {
      window.removeEventListener('online', repintar);
      window.removeEventListener('offline', repintar);
    },
  };
}

/** El lugar activo del Planificador (o Córdoba si nunca se abrió) */
function lugarActivo() {
  const lugares = leer('cielo:lugares', [{ id: 'casa', nombre: 'Casa (Córdoba)', lat: 37.89, lon: -4.77 }]);
  return lugares.find((l) => l.id === leer('cielo:lugar', 'casa')) || lugares[0];
}

function pintar(datos) {
  const lugar = lugarActivo();
  const url = (u) => u.replace('{lat}', lugar.lat.toFixed(2)).replace('{lon}', lugar.lon.toFixed(2));
  raiz.innerHTML = `
    <section class="enlaces entrada">
      <header class="modulo__cabecera">
        <span class="etiqueta">Módulo 06 · Recursos</span>
        <h1 class="titular">Enlaces <em>útiles</em>.</h1>
        <p class="entradilla">El software para tu Mac y las webs para planificar, todo gratuito salvo PixInsight.
          Se abren en una pestaña nueva.</p>
      </header>

      ${navigator.onLine ? '' : `
        <p class="aviso-red" role="status">${icono('enlaces')}Ahora no hay conexión: estos enlaces necesitan internet. El resto de AstroKit sigue funcionando.</p>`}

      ${datos.grupos.map((g, i) => `
        <section class="grupo-enlaces" style="--color: var(--b${[1, 4, 7][i % 3]})">
          <header class="grupo-enlaces__cabecera">
            <h2 class="panel__titulo"><span class="panel__num">${String(i + 1).padStart(2, '0')}</span>${escaparHTML(g.titulo)}</h2>
            <p class="lectura__texto">${escaparHTML(g.descripcion)}</p>
          </header>
          <ul class="enlaces__lista" aria-label="${escaparHTML(g.titulo)}">
            ${g.enlaces.map((e) => `
              <li>
                <a class="enlace" href="${escaparHTML(url(e.url))}" target="_blank" rel="noopener noreferrer" aria-label="${escaparHTML(e.nombre)} (se abre en una pestaña nueva)">
                  <span class="enlace__cabecera">
                    <span class="enlace__nombre">${escaparHTML(e.nombre)}</span>
                    ${icono('sig', 'enlace__flecha')}
                  </span>
                  <span class="enlace__texto">${escaparHTML(e.descripcion)}${e.url.includes('{lat}') ? ` <em>Abre la previsión de ${escaparHTML(lugar.nombre)}.</em>` : ''}</span>
                  <span class="enlace__etiquetas">
                    <span class="etiqueta-nivel etiqueta-nivel--${e.nivel}">${NIVELES[e.nivel] || e.nivel}</span>
                    ${e.etiquetas.map((t) => `<span class="etiqueta-plataforma">${escaparHTML(t)}</span>`).join('')}
                  </span>
                  <span class="enlace__dominio cifra">${escaparHTML(new URL(url(e.url)).hostname.replace('www.', ''))}</span>
                </a>
              </li>`).join('')}
          </ul>
        </section>`).join('')}

      <aside class="explica">
        <span class="etiqueta">No funcionan en Mac</span>
        <p>${datos.noMac.map(escaparHTML).join(', ')}: solo existen para Windows. Si un tutorial los usa, busca el equivalente
          en Siril (apilado) o KStars/Ekos (control del equipo).</p>
      </aside>
    </section>`;
}
