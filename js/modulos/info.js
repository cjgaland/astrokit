/* ==========================================================================
   modulos/info.js — Módulo 7: Información de la aplicación
   --------------------------------------------------------------------------
   Tres apartados:
     01 · Acerca de        qué es AstroKit, autoría, tecnología y créditos
     02 · Versiones        la versión instalada, buscar actualizaciones y el
                           historial de cambios (data/novedades.json)
     03 · Ayuda            el manual de uso en PDF (verlo o descargarlo) y el
                           botones para enviar sugerencias por correo o por WhatsApp

   Los textos están en data/info.json; el historial lo mantiene
   publicar_astrokit.sh en data/novedades.json.
   ========================================================================== */

import { cargarJSON, escaparHTML, icono } from '../util.js';
import { versionActual, versionLegible, buscarActualizacion } from '../actualizaciones.js';
import { listaEquipos, elegirMiEquipo, selectorMiEquipo } from '../equipo.js';

let raiz = null;
let info = null;
let novedades = null;

export async function montar(contenedor) {
  raiz = contenedor;
  [info, novedades] = await Promise.all([
    cargarJSON('data/info.json'),
    cargarJSON('data/novedades.json').catch(() => ({ versiones: [] })),
  ]);
  pintar();
  raiz.addEventListener('click', alHacerClic);
  raiz.addEventListener('change', alCambiar);
  pintarVersion();
  listaEquipos().then((eq) => { const c = raiz.querySelector('#mi-equipo-info'); if (c) c.innerHTML = selectorMiEquipo(eq, undefined, 'selector-mi-equipo'); });
  return { desmontar: () => { raiz.removeEventListener('click', alHacerClic); raiz.removeEventListener('change', alCambiar); } };
}

const fechaLarga = (t) => new Date(t + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

function pintar() {
  const asunto = encodeURIComponent('Sugerencia para AstroKit');
  const cuerpo = encodeURIComponent('Hola, Carlos:\n\nMi sugerencia para AstroKit es…\n\n(Versión que uso: ' + (raiz.dataset.version || '—') + ')');
  const telefono = String(info.whatsapp || '').replace(/\D/g, '');   // solo cifras, con prefijo de país (wa.me lo exige así)

  raiz.innerHTML = `
    <section class="info entrada">
      <header class="modulo__cabecera">
        <span class="etiqueta">Módulo 07 · Acerca de la aplicación</span>
        <h1 class="titular">Info <em>y ayuda</em>.</h1>
      </header>

      <section class="panel">
        <h2 class="panel__titulo"><span class="panel__num">01</span>Acerca de AstroKit</h2>
        <div class="info__acerca">
          <svg class="grafico info__logo" viewBox="0 0 32 32" aria-hidden="true"><use href="#i-marca"/></svg>
          <div>
            <p class="info__descripcion">${escaparHTML(info.descripcion)}</p>
            <dl class="datos info__datos">
              <dt>Autor</dt><dd>${escaparHTML(info.autor)} · ${escaparHTML(info.lugar)}, desde ${escaparHTML(info.inicio)}</dd>
              <dt>Dirección</dt><dd><a href="${escaparHTML(info.web)}" target="_blank" rel="noopener">${escaparHTML(info.web.replace('https://', ''))}</a></dd>
              <dt>Tecnología</dt><dd>${escaparHTML(info.tecnologia)}</dd>
            </dl>
          </div>
        </div>
        <div class="info__equipo" id="mi-equipo-info"></div>
        <details class="info__creditos">
          <summary>Créditos y fuentes</summary>
          <ul>${info.creditos.map((c) => `<li>${escaparHTML(c)}</li>`).join('')}</ul>
        </details>
      </section>

      <section class="panel">
        <h2 class="panel__titulo"><span class="panel__num">02</span>Control de versiones</h2>
        <div class="info__version">
          <div>
            <span class="etiqueta">Versión instalada</span>
            <p class="lectura__cifra cifra" id="version-numero">…</p>
            <p class="nota" id="version-estado">Comprobando…</p>
          </div>
          <button class="boton-sec" type="button" id="buscar-actualizacion">${icono('azar')}Buscar actualizaciones</button>
        </div>
        <h3 class="etiqueta info__subtitulo">Historial de cambios</h3>
        <ol class="historial" aria-label="Historial de versiones">
          ${novedades.versiones.map((v, i) => `
            <li class="historial__version ${i === 0 ? 'es-actual' : ''}" data-version="${escaparHTML(v.version)}">
              <div class="historial__cabecera">
                <span class="historial__numero cifra">${escaparHTML(versionLegible(v.version))}</span>
                <span class="historial__fecha cifra">${v.fecha ? fechaLarga(v.fecha) : ''}</span>
              </div>
              <ul>${(v.cambios || []).map((c) => `<li>${escaparHTML(c)}</li>`).join('')}</ul>
            </li>`).join('')}
        </ol>
      </section>

      <section class="panel">
        <h2 class="panel__titulo"><span class="panel__num">03</span>Ayuda</h2>
        <div class="ayuda">
          <article class="ayuda__tarjeta">
            ${icono('cuaderno', 'ayuda__icono')}
            <h3>Manual de uso</h3>
            <p>Guía completa de la aplicación, con capturas de pantalla y preguntas frecuentes, en PDF.</p>
            <div class="ayuda__botones">
              <a class="boton-principal" href="${escaparHTML(info.manual)}" target="_blank" rel="noopener" aria-label="Ver el manual de uso (PDF, se abre en una pestaña nueva)">${icono('glosario')}Ver el manual</a>
              <a class="boton-sec" href="${escaparHTML(info.manual)}" download="Manual_de_uso_AstroKit.pdf">${icono('abajo')}Descargar</a>
            </div>
          </article>
          <article class="ayuda__tarjeta">
            ${icono('enlaces', 'ayuda__icono')}
            <h3>Sugerencias</h3>
            <p>¿Echas algo en falta o has visto un error? Escríbeme: cada sugerencia ayuda a mejorar AstroKit.</p>
            <div class="ayuda__botones">
              <a class="boton-sec" data-sugerencia href="mailto:${escaparHTML(info.correo)}?subject=${asunto}&body=${cuerpo}" aria-label="Enviar una sugerencia por correo">${icono('sobre')}Correo</a>
              ${telefono ? `<a class="boton-sec" data-sugerencia href="https://wa.me/${telefono}?text=${cuerpo}" target="_blank" rel="noopener" aria-label="Enviar una sugerencia por WhatsApp (se abre WhatsApp)">${icono('whatsapp')}WhatsApp</a>` : ''}
            </div>
            <p class="nota">Se abre tu app de correo o WhatsApp con el mensaje ya empezado y la versión que usas anotada.</p>
          </article>
        </div>
      </section>
    </section>`;
}

/** Versión instalada; también la mete en el correo de sugerencias para saber desde cuál se escribe */
async function pintarVersion() {
  const v = await versionActual();
  if (!raiz.isConnected) return;
  raiz.querySelector('#version-numero').textContent = v ? versionLegible(v).replace('versión ', 'v') : '—';
  raiz.querySelector('#version-estado').textContent = v
    ? `Instalada en este dispositivo${novedades.versiones[0]?.fecha && v === novedades.versiones[0].version ? ` · publicada el ${fechaLarga(novedades.versiones[0].fecha)}` : ''}.`
    : 'Versión web sin instalar: abre la app desde su dirección para instalarla.';
  raiz.querySelectorAll('.historial__version').forEach((li) => li.classList.toggle('es-actual', li.dataset.version === v));
  if (v) raiz.querySelectorAll('[data-sugerencia]').forEach((a) => { a.href = a.href.replace(encodeURIComponent('—'), encodeURIComponent(versionLegible(v))); });
}

function alCambiar(e) {
  if (e.target.id === 'selector-mi-equipo') elegirMiEquipo(e.target.value);
}

async function alHacerClic(e) {
  const boton = e.target.closest('#buscar-actualizacion');
  if (!boton) return;
  const estado = raiz.querySelector('#version-estado');
  if (!navigator.onLine) { estado.textContent = 'Sin conexión: no se puede comprobar ahora.'; return; }
  boton.disabled = true;
  estado.textContent = 'Buscando…';
  const hay = await buscarActualizacion();
  boton.disabled = false;
  if (hay) estado.textContent = 'Hay una versión nueva: pulsa «Actualizar» en el aviso.';
  else { await pintarVersion(); estado.textContent += ' Es la más reciente.'; }
}
