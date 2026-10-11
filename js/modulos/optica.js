/* ==========================================================================
   modulos/optica.js — Módulo 2: Calculadora óptica
   --------------------------------------------------------------------------
   Cuatro paneles:
     01 · Tu equipo        predefinido (data/equipos.json) o a mano
     02 · Lecturas         f/, campo, escala de placa (+ muestreo), Dawes, luz
     03 · Encuadre         rectángulo del sensor sobre objetos típicos
     04 · Señal / ruido    cuántas tomas y horas para mejorar la SNR un factor X

   Todas las cuentas están en js/calculos/optica.js; aquí solo se leen los
   campos, se llama a esas funciones y se pinta el resultado CON la fórmula y
   los números sustituidos, para ver de dónde sale cada cifra.
   ========================================================================== */

import * as O from '../calculos/optica.js';
import { cargarJSON, escaparHTML, icono } from '../util.js';
import { leer, guardar } from '../almacen.js';

/* ---------- Estado (se recuerda entre sesiones) ---------- */
const ESTADO_INICIAL = {
  equipo: 's50pro',                       // id del predefinido o 'manual'
  manual: { apertura: 80, focal: 480, pixel: 3.76, resX: 6248, resY: 4176 },
  comparar: 'draco-dso',                  // id o '' para no comparar
  seeing: 3,
  objeto: 'm31',
  girado: false,
  snr: { exposicion: 10, tomas: 360, factor: 2 },
};
const estado = { ...structuredClone(ESTADO_INICIAL), ...leer('optica', {}) };
const guardarEstado = () => guardar('optica', estado);

let equipos = [];
let objetos = [];
let raiz = null;

/* ---------- Formato de números en español (coma decimal, punto de miles) ---------- */
const fmt = (n, dec = 2) =>
  Number.isFinite(n) ? n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';
const ent = (n) => Number.isFinite(n) ? Math.round(n).toLocaleString('es-ES') : '—';
/** Lee un número escrito con coma o con punto ("2,9" o "2.9"). */
const num = (texto) => parseFloat(String(texto).replace(',', '.'));

/* ==========================================================================
   Montaje
   ========================================================================== */
export async function montar(contenedor) {
  raiz = contenedor;
  [{ equipos }, { objetos }] = await Promise.all([
    cargarJSON('data/equipos.json'),
    cargarJSON('data/objetos.json'),
  ]);
  objetos = objetos.filter((o) => o.simulador);

  pintarEsqueleto();
  raiz.addEventListener('input', alCambiar);
  raiz.addEventListener('click', alHacerClic);
  recalcular();
  return { desmontar };
}

function desmontar() {
  raiz.removeEventListener('input', alCambiar);
  raiz.removeEventListener('click', alHacerClic);
}

/** Datos del equipo activo (predefinido o manual) */
function equipoActivo() {
  if (estado.equipo === 'manual') return { id: 'manual', nombre: 'Equipo a mano', corto: 'Tu equipo', ...estado.manual };
  return equipos.find((e) => e.id === estado.equipo) || equipos[0];
}
function equipoComparado() {
  return equipos.find((e) => e.id === estado.comparar && e.id !== estado.equipo) || null;
}

/** Todas las magnitudes derivadas de un equipo */
function calcular(e) {
  const anchoMm = O.tamanoSensor(e.resX, e.pixel);
  const altoMm = O.tamanoSensor(e.resY, e.pixel);
  const diagMm = O.diagonal(anchoMm, altoMm);
  return {
    fRatio: O.relacionFocal(e.focal, e.apertura),
    anchoMm, altoMm, diagMm,
    fovAncho: O.campoVision(anchoMm, e.focal),
    fovAlto: O.campoVision(altoMm, e.focal),
    fovDiag: O.campoVision(diagMm, e.focal),
    fovAnchoAprox: O.campoVisionAprox(anchoMm, e.focal),
    escala: O.escalaPlaca(e.pixel, e.focal),
    dawes: O.limiteDawes(e.apertura),
  };
}

/* ==========================================================================
   Esqueleto (se pinta una vez; luego solo se actualizan las cifras)
   ========================================================================== */
function pintarEsqueleto() {
  const campo = (id, etiqueta, unidad, ayuda) => `
    <label class="campo">
      <span class="campo__etiqueta">${etiqueta}</span>
      <span class="campo__caja">
        <input id="c-${id}" data-campo="${id}" type="text" inputmode="decimal" autocomplete="off">
        <span class="campo__unidad">${unidad}</span>
      </span>
      <span class="campo__ayuda">${ayuda}</span>
    </label>`;

  raiz.innerHTML = `
    <section class="optica entrada">
      <header class="modulo__cabecera">
        <span class="etiqueta">Módulo 02 · Óptica y sensor</span>
        <h1 class="titular">Calculadora <em>óptica</em>.</h1>
        <p class="entradilla">Cada cifra lleva al lado su fórmula con tus números dentro:
          la idea es entender de dónde sale, no solo obtenerla.</p>
      </header>

      <!-- 01 · EQUIPO -->
      <section class="panel">
        <h2 class="panel__titulo"><span class="panel__num">01</span>Tu equipo</h2>
        <div class="selector-equipo" role="group" aria-label="Equipo">
          ${equipos.map((e) => `<button class="chip" type="button" data-equipo="${e.id}">${escaparHTML(e.corto)}</button>`).join('')}
          <button class="chip" type="button" data-equipo="manual">A mano</button>
        </div>
        <div class="campos">
          ${campo('apertura', 'Apertura D', 'mm', 'Diámetro de la óptica')}
          ${campo('focal', 'Focal F', 'mm', 'Distancia focal')}
          ${campo('pixel', 'Píxel', 'µm', 'Tamaño de cada píxel')}
          ${campo('resX', 'Ancho', 'px', 'Píxeles en horizontal')}
          ${campo('resY', 'Alto', 'px', 'Píxeles en vertical')}
        </div>
        <p class="ficha-equipo" id="ficha-equipo"></p>
        <label class="comparar">
          <span class="etiqueta">Comparar con</span>
          <select id="comparar">
            <option value="">— ninguno —</option>
            ${equipos.map((e) => `<option value="${e.id}">${escaparHTML(e.nombre)}</option>`).join('')}
          </select>
        </label>
      </section>

      <!-- 02 · LECTURAS -->
      <section class="panel panel--sin-caja">
        <div class="panel__fila">
          <h2 class="panel__titulo"><span class="panel__num">02</span>Lecturas</h2>
          <!-- El seeing (turbulencia de la noche) afecta al muestreo y al límite útil de detalle -->
          <label class="seeing">
            <span class="etiqueta">Seeing de la noche</span>
            <input type="range" id="seeing" min="1" max="5" step="0.5">
            <output class="cifra" id="seeing-valor"></output>
          </label>
        </div>
        <div class="lecturas" id="lecturas"></div>
      </section>

      <!-- 03 · ENCUADRE -->
      <section class="panel">
        <h2 class="panel__titulo"><span class="panel__num">03</span>Simulador de encuadre</h2>
        <div class="selector-objeto" role="group" aria-label="Objeto">
          ${objetos.map((o) => `<button class="chip" type="button" data-objeto="${o.id}">${escaparHTML(o.catalogo)}</button>`).join('')}
        </div>
        <div class="encuadre">
          <div class="encuadre__lienzo" id="lienzo"></div>
          <div class="encuadre__info">
            <div id="info-encuadre"></div>
            <button class="boton-sec" type="button" data-accion="girar">${icono('azar')}Girar el sensor 90°</button>
          </div>
        </div>
      </section>

      <!-- 04 · SEÑAL / RUIDO -->
      <section class="panel">
        <h2 class="panel__titulo"><span class="panel__num">04</span>Señal/ruido e integración</h2>
        <div class="snr">
          <div class="snr__controles">
            <label class="campo">
              <span class="campo__etiqueta">Exposición por toma</span>
              <span class="campo__caja"><input id="s-exposicion" data-snr="exposicion" type="text" inputmode="decimal"><span class="campo__unidad">s</span></span>
            </label>
            <label class="campo">
              <span class="campo__etiqueta">Tomas que ya tienes</span>
              <span class="campo__caja"><input id="s-tomas" data-snr="tomas" type="text" inputmode="numeric"><span class="campo__unidad">subs</span></span>
              <span class="campo__ayuda" id="s-tomas-horas"></span>
            </label>
            <label class="campo campo--deslizador">
              <span class="campo__etiqueta">Quiero mejorar la SNR</span>
              <span class="deslizador">
                <input id="s-factor" data-snr="factor" type="range" min="1.1" max="5" step="0.1">
                <output class="cifra" id="s-factor-valor"></output>
              </span>
            </label>
          </div>
          <div class="snr__resultado" id="snr-resultado"></div>
        </div>
        <div class="snr__grafica" id="snr-grafica"></div>
        <aside class="explica">
          <span class="etiqueta">Por qué funciona así</span>
          <p>Al apilar <var>N</var> tomas, la señal del objeto se suma <em>N</em> veces, pero el ruido
            aleatorio (de disparo, de lectura, térmico) solo crece como <var>√N</var>, porque unas tomas lo
            compensan con otras. El cociente <var>N ÷ √N = √N</var> es la mejora de la SNR.
            Consecuencia: para <strong>duplicar</strong> la calidad hacen falta <strong>cuatro</strong> veces
            más tomas, y para triplicarla, nueve. La curva se aplana: las primeras horas cunden muchísimo
            y las siguientes, cada vez menos.</p>
        </aside>
      </section>
    </section>`;

  raiz.querySelector('#comparar').value = estado.comparar;
  raiz.querySelector('#seeing').value = estado.seeing;
  raiz.querySelector('#s-exposicion').value = String(estado.snr.exposicion).replace('.', ',');
  raiz.querySelector('#s-tomas').value = estado.snr.tomas;
  raiz.querySelector('#s-factor').value = estado.snr.factor;
  rellenarCampos();
}

/** Vuelca los datos del equipo activo en los campos de texto */
function rellenarCampos() {
  const e = equipoActivo();
  for (const c of ['apertura', 'focal', 'pixel', 'resX', 'resY']) {
    raiz.querySelector(`#c-${c}`).value = String(e[c]).replace('.', ',');
  }
}

/* ==========================================================================
   Recalcular y pintar
   ========================================================================== */
function recalcular() {
  // Chips activos
  raiz.querySelectorAll('[data-equipo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.equipo === estado.equipo)));
  raiz.querySelectorAll('[data-objeto]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.objeto === estado.objeto)));

  const e = equipoActivo();
  const valido = ['apertura', 'focal', 'pixel', 'resX', 'resY'].every((c) => e[c] > 0);
  const ficha = raiz.querySelector('#ficha-equipo');
  if (!valido) {
    ficha.innerHTML = '<span class="aviso">Revisa los campos: todos deben ser números mayores que cero.</span>';
    return;
  }
  ficha.innerHTML = e.sensor
    ? `<strong>${escaparHTML(e.nombre)}</strong> · ${escaparHTML(e.sensor)} · ${escaparHTML(e.exposicion)}${e.nota ? `<br><span class="nota">${escaparHTML(e.nota)}</span>` : ''}`
    : '<strong>Equipo a mano.</strong> Escribe los datos de cualquier telescopio y cámara (por ejemplo un refractor de 80 mm con una cámara ZWO).';

  raiz.querySelector('#seeing-valor').textContent = fmt(estado.seeing, 1) + '″';
  const c = calcular(e);
  const comp = equipoComparado();
  const cc = comp ? calcular(comp) : null;

  pintarLecturas(e, c, comp, cc);
  pintarEncuadre(e, c, comp, cc);
  pintarSNR();
}

/* ---------- 02 · Lecturas ---------- */
function pintarLecturas(e, c, comp, cc) {
  const m = O.muestreo(estado.seeing, c.escala);
  const textoMuestreo = {
    sub: 'Submuestreo: cada píxel ve demasiado cielo; las estrellas pequeñas salen "cuadradas". Es lo habitual en telescopios inteligentes de focal corta y se compensa en parte con el <em>drizzle</em>.',
    optimo: 'Muestreo cómodo: la estrella cubre entre 1,5 y 3,5 píxeles, cerca de la regla de Nyquist (2–3).',
    sobre: 'Sobremuestreo: los píxeles son más finos que lo que deja la atmósfera; desperdicias luz. Agrupar 2×2 (binning) ayudaría.',
  }[m.estado];
  // Posición del marcador en la escala de muestreo (0,5 a 5 px por FWHM)
  const posicion = Math.min(100, Math.max(0, ((m.pixeles - 0.5) / 4.5) * 100));

  const lectura = ({ titulo, glosario, cifra, unidad, sub = '', formula, texto, extra = '' }) => `
    <article class="lectura">
      <header class="lectura__cabecera">
        <h3 class="etiqueta">${titulo}</h3>
        <a class="lectura__glosario" href="#glosario/${glosario}" title="Ver en el glosario">${icono('glosario')}</a>
      </header>
      <div class="lectura__cifra cifra">${cifra}<span>${unidad}</span></div>
      ${sub ? `<div class="lectura__sub cifra">${sub}</div>` : ''}
      <div class="formula cifra">${formula}</div>
      <p class="lectura__texto">${texto}</p>
      ${extra}
    </article>`;

  const luz = comp ? (() => {
    const l = O.luzRelativa(e.apertura, comp.apertura);
    const dm = O.gananciaMagnitudes(e.apertura, comp.apertura);
    const t = (c.fRatio / cc.fRatio) ** 2;
    return lectura({
      titulo: `Luz frente a ${escaparHTML(comp.corto)}`, glosario: 'apertura',
      cifra: '×' + fmt(l), unidad: '',
      sub: `${dm >= 0 ? '+' : '−'}${fmt(Math.abs(dm))} mag`,
      formula: `(D₁ ÷ D₂)² = (${fmt(e.apertura, 0)} ÷ ${fmt(comp.apertura, 0)})² = ${fmt(l)}<br>
                Δm = 2,5 · log₁₀(${fmt(l)}) = ${fmt(dm)}`,
      texto: `La luz recogida crece con el área de la óptica, es decir, con D². ${l >= 1 ? 'Recoges' : 'Recoges solo'} ${fmt(l)} veces la luz del ${escaparHTML(comp.corto)}.`,
      extra: `<div class="formula formula--sec cifra">Objetos extensos: tiempo ∝ (f/)²<br>(${fmt(c.fRatio, 1)} ÷ ${fmt(cc.fRatio, 1)})² = ${fmt(t)}</div>
              <p class="lectura__texto">Para nebulosas y galaxias (luz repartida) manda la relación focal: necesitas ${fmt(t)} veces ${t >= 1 ? 'el' : 'del'} tiempo del ${escaparHTML(comp.corto)} para el mismo nivel de señal por píxel, a igualdad de sensor.</p>`,
    });
  })() : lectura({
    titulo: 'Luz recogida', glosario: 'apertura', cifra: fmt(Math.PI * (e.apertura / 2) ** 2 / 100, 1), unidad: ' cm²',
    formula: `Área = π · (D ÷ 2)² = π · (${fmt(e.apertura, 0)} ÷ 2)² mm²`,
    texto: 'Elige un equipo en «Comparar con» para ver cuántas veces más (o menos) luz recoges.',
  });

  raiz.querySelector('#lecturas').innerHTML = [
    lectura({
      titulo: 'Relación focal', glosario: 'relacion-focal',
      cifra: 'f/' + fmt(c.fRatio, 1), unidad: '',
      formula: `f/ = F ÷ D = ${fmt(e.focal, 0)} ÷ ${fmt(e.apertura, 0)} = ${fmt(c.fRatio)}`,
      texto: 'La "rapidez" de la óptica para objetos extensos: cuanto más bajo, más luz concentra en cada punto del sensor.',
    }),
    lectura({
      titulo: 'Campo de visión', glosario: 'campo-de-vision',
      cifra: `${fmt(c.fovAncho)}° × ${fmt(c.fovAlto)}°`, unidad: '',
      sub: `${fmt(c.fovAncho * 60, 0)}′ × ${fmt(c.fovAlto * 60, 0)}′ · diagonal ${fmt(c.fovDiag)}°`,
      formula: `Sensor = ${ent(e.resX)} × ${fmt(e.pixel, 2)} µm = ${fmt(c.anchoMm)} mm<br>
                FOV = 2 · arctan(${fmt(c.anchoMm)} ÷ (2 · ${fmt(e.focal, 0)})) = ${fmt(c.fovAncho)}°<br>
                <span class="formula__nota">≈ 57,3 × ${fmt(c.anchoMm)} ÷ ${fmt(e.focal, 0)} = ${fmt(c.fovAnchoAprox)}°</span>`,
      texto: `La Luna llena mide 0,5°: en el lado largo caben unas ${fmt(c.fovAncho / 0.52, 1)} lunas.`,
    }),
    lectura({
      titulo: 'Escala de placa', glosario: 'escala-de-placa',
      cifra: fmt(c.escala), unidad: '″/px',
      formula: `206,265 × píxel ÷ F = 206,265 × ${fmt(e.pixel, 2)} ÷ ${fmt(e.focal, 0)} = ${fmt(c.escala)}″`,
      texto: 'Cuánto cielo ve cada píxel. Con seeing típico (2–4″), entre 1 y 2,5″/px es un rango cómodo.',
      extra: `
        <div class="muestreo">
          <div class="muestreo__barra">
            <span class="muestreo__zona muestreo__zona--sub">sub</span>
            <span class="muestreo__zona muestreo__zona--ok">óptimo</span>
            <span class="muestreo__zona muestreo__zona--sobre">sobre</span>
            <i class="muestreo__marca" style="left:${posicion}%"></i>
          </div>
          <p class="formula cifra">FWHM ÷ escala = ${fmt(estado.seeing, 1)} ÷ ${fmt(c.escala)} = ${fmt(m.pixeles, 1)} px</p>
          <p class="lectura__texto">${textoMuestreo}</p>
        </div>`,
    }),
    lectura({
      titulo: 'Límite de Dawes', glosario: 'poder-resolutivo',
      cifra: fmt(c.dawes), unidad: '″',
      formula: `116 ÷ D = 116 ÷ ${fmt(e.apertura, 0)} = ${fmt(c.dawes)}″`,
      texto: c.dawes < estado.seeing
        ? `Tu óptica separa ${fmt(c.dawes)}″, pero con ${fmt(estado.seeing, 1)}″ de seeing manda la atmósfera: la apertura no es lo que te limita esta noche.`
        : `Con ${fmt(estado.seeing, 1)}″ de seeing, la óptica (${fmt(c.dawes)}″) es la que pone el límite al detalle.`,
    }),
    luz,
  ].join('');
}

/* ---------- 03 · Encuadre ---------- */
function pintarEncuadre(e, c, comp, cc) {
  const obj = objetos.find((o) => o.id === estado.objeto) || objetos[0];
  // Campo en minutos de arco (′), girado si se ha pulsado el botón
  const campo = (x) => estado.girado
    ? { ancho: x.fovAlto * 60, alto: x.fovAncho * 60 }
    : { ancho: x.fovAncho * 60, alto: x.fovAlto * 60 };
  const fA = campo(c);
  const fB = cc ? campo(cc) : null;

  // Dibujamos el encuadre IDEAL: el eje largo del objeto a lo largo del lado
  // largo del sensor. (En Alt-Az la orientación real del campo va cambiando
  // durante la noche por la rotación de campo; el botón "girar" muestra el
  // caso contrario.) Si un día quieres el norte arriba, el giro sería 90 − obj.angulo.
  const giro = 0;
  const caja = O.cajaGirada(obj.ancho, obj.alto, giro);

  // Escala del dibujo: que quepan el objeto y los campos con un margen
  const W = 400, H = 260;
  const extAncho = Math.max(caja.ancho, fA.ancho, fB?.ancho || 0) * 1.18;
  const extAlto = Math.max(caja.alto, fA.alto, fB?.alto || 0) * 1.18;
  const k = Math.min(W / extAncho, H / extAlto);   // píxeles de dibujo por minuto de arco
  const cx = W / 2, cy = H / 2;

  // Rectángulo de un campo; la etiqueta del principal va arriba y la del comparado abajo, para no pisarse
  const rect = (f, clase, etiqueta, abajo = false) => {
    const w = f.ancho * k, h = f.alto * k;
    const ty = abajo ? cy + h / 2 - 7 : cy - h / 2 + 15;
    return `<rect class="${clase}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="2"/>
            <text class="encuadre__etiqueta ${clase}-texto" x="${cx - w / 2 + 6}" y="${ty}">${escaparHTML(etiqueta)}</text>`;
  };

  raiz.querySelector('#lienzo').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="grafico encuadre__svg" role="img"
         aria-label="${escaparHTML(obj.nombre)} con el campo de ${escaparHTML(e.corto)} superpuesto">
      <defs>
        <radialGradient id="g-galaxia"><stop offset="0" stop-color="var(--tinta)" stop-opacity=".95"/><stop offset=".25" stop-color="var(--filete)" stop-opacity=".55"/><stop offset="1" stop-color="var(--filete)" stop-opacity="0"/></radialGradient>
        <radialGradient id="g-nebulosa"><stop offset="0" stop-color="var(--b5)" stop-opacity=".75"/><stop offset=".6" stop-color="var(--b6)" stop-opacity=".35"/><stop offset="1" stop-color="var(--b6)" stop-opacity="0"/></radialGradient>
        <radialGradient id="g-luna"><stop offset="0" stop-color="var(--tinta-2)"/><stop offset="1" stop-color="var(--tinta-3)"/></radialGradient>
      </defs>
      ${campoEstrellas(W, H)}
      <g transform="translate(${cx} ${cy}) rotate(${giro})">${dibujarObjeto(obj, k)}</g>
      ${fB ? rect(fB, 'encuadre__campo2', comp.corto, true) : ''}
      ${rect(fA, 'encuadre__campo', e.corto)}
      ${escalaGrafica(k, W, H)}
    </svg>`;

  // Texto: ¿cabe? ¿cuánto ocupa? ¿mosaico?
  const ocupa = Math.max(caja.ancho / fA.ancho, caja.alto / fA.alto);
  const mos = O.panelesMosaico(caja.ancho, caja.alto, fA.ancho, fA.alto);
  let veredicto;
  if (ocupa > 1) veredicto = `<strong>No cabe.</strong> Necesitarías un mosaico de <strong>${mos.columnas} × ${mos.filas}</strong> paneles (con un 15 % de solape), y el tiempo se reparte entre ellos.`;
  else if (ocupa > 0.75) veredicto = `<strong>Cabe justo</strong>: ocupa el ${fmt(ocupa * 100, 0)} % del campo. Encuadra con cuidado y prevé recortar bordes.`;
  else if (ocupa > 0.2) veredicto = `<strong>Cabe holgado</strong>: ocupa el ${fmt(ocupa * 100, 0)} % del campo. Buen encuadre.`;
  else veredicto = `<strong>Muy pequeño</strong>: ocupa solo el ${fmt(ocupa * 100, 0)} % del campo. Se verá diminuto; habrá que recortar mucho, o es objeto para más focal.`;

  const ocupaB = fB ? Math.max(caja.ancho / fB.ancho, caja.alto / fB.alto) : null;
  raiz.querySelector('#info-encuadre').innerHTML = `
    <span class="etiqueta">${escaparHTML(obj.catalogo)}</span>
    <h3 class="encuadre__nombre">${escaparHTML(obj.nombre)}</h3>
    <dl class="datos cifra">
      <dt>Objeto</dt><dd>${fmt(obj.ancho, obj.ancho < 10 ? 1 : 0)}′ × ${fmt(obj.alto, obj.alto < 10 ? 1 : 0)}′</dd>
      <dt>${escaparHTML(e.corto)}</dt><dd>${fmt(fA.ancho, 0)}′ × ${fmt(fA.alto, 0)}′</dd>
      ${fB ? `<dt>${escaparHTML(comp.corto)}</dt><dd>${fmt(fB.ancho, 0)}′ × ${fmt(fB.alto, 0)}′</dd>` : ''}
      <dt>Eje largo</dt><dd>${ent(Math.max(caja.ancho, caja.alto) * 60 / c.escala)} px de tu sensor</dd>
    </dl>
    <p>${veredicto}</p>
    ${fB ? `<p class="nota">Con el ${escaparHTML(comp.corto)} ocuparía el ${fmt(ocupaB * 100, 0)} % del campo.</p>` : ''}`;
}

/** Fondo de estrellas: posiciones "aleatorias" pero siempre las mismas (generador con semilla) */
function campoEstrellas(W, H) {
  let s = 7;
  const azar = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let html = '';
  for (let i = 0; i < 70; i++) {
    html += `<circle class="encuadre__estrella" cx="${(azar() * W).toFixed(1)}" cy="${(azar() * H).toFixed(1)}" r="${(azar() * 0.9 + 0.3).toFixed(2)}"/>`;
  }
  return html;
}

/** Dibujo esquemático de cada tipo de objeto, centrado en (0,0) y con su eje largo en horizontal */
function dibujarObjeto(o, k) {
  const rx = (o.ancho / 2) * k, ry = (o.alto / 2) * k;
  switch (o.tipo) {
    case 'galaxia':
      return `<ellipse rx="${rx}" ry="${ry}" fill="url(#g-galaxia)"/>
              <ellipse rx="${rx * 0.55}" ry="${ry * 0.35}" fill="none" class="encuadre__brazo"/>`;
    case 'luna':
      return `<circle r="${rx}" fill="url(#g-luna)" opacity=".85"/>
              <circle cx="${-rx * 0.3}" cy="${-ry * 0.2}" r="${rx * 0.18}" class="encuadre__crater"/>
              <circle cx="${rx * 0.25}" cy="${ry * 0.3}" r="${rx * 0.12}" class="encuadre__crater"/>
              <circle cx="${rx * 0.35}" cy="${-ry * 0.35}" r="${rx * 0.08}" class="encuadre__crater"/>`;
    case 'cumulo-abierto': {
      let s = 3, html = `<circle r="${rx}" fill="url(#g-galaxia)" opacity=".18"/>`;
      const azar = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 14; i++) {
        const a = azar() * 2 * Math.PI, d = Math.sqrt(azar()) * rx * 0.8;
        html += `<circle cx="${(Math.cos(a) * d).toFixed(1)}" cy="${(Math.sin(a) * d).toFixed(1)}" r="${(1.2 + azar() * 2.4).toFixed(1)}" class="encuadre__estrella-brillante"/>`;
      }
      return html;
    }
    case 'nebulosa-planetaria':
      return `<ellipse rx="${Math.max(rx, 2)}" ry="${Math.max(ry, 1.5)}" fill="none" stroke="var(--b2)" stroke-width="${Math.max(1, rx * 0.35)}"/>`;
    default: // nebulosas de emisión, reflexión...
      return `<ellipse rx="${rx}" ry="${ry}" fill="url(#g-nebulosa)"/>
              <ellipse cx="${rx * 0.15}" cy="${-ry * 0.1}" rx="${rx * 0.45}" ry="${ry * 0.4}" fill="url(#g-nebulosa)"/>`;
  }
}

/** Barra de escala (como en los mapas) con una longitud "redonda" en ′ o ° */
function escalaGrafica(k, W, H) {
  const candidatos = [1, 2, 5, 10, 15, 30, 60, 120, 180];
  const objetivo = 90 / k;                         // unos 90 px de barra
  const valor = candidatos.reduce((a, b) => (Math.abs(b - objetivo) < Math.abs(a - objetivo) ? b : a));
  const largo = valor * k;
  const texto = valor >= 60 ? `${valor / 60}°` : `${valor}′`;
  return `<g class="encuadre__escala" transform="translate(12 ${H - 14})">
            <path d="M0 -4V0H${largo}V-4"/>
            <text x="${largo / 2}" y="-7" text-anchor="middle">${texto}</text>
          </g>`;
}

/* ---------- 04 · Señal / ruido ---------- */
function pintarSNR() {
  const { exposicion, tomas, factor } = estado.snr;
  raiz.querySelector('#s-factor-valor').textContent = '×' + fmt(factor, 1);
  const caja = raiz.querySelector('#snr-resultado');
  if (!(exposicion > 0 && tomas > 0)) {
    caja.innerHTML = '<p class="aviso">Escribe la exposición y las tomas (números mayores que cero).</p>';
    raiz.querySelector('#snr-grafica').innerHTML = '';
    return;
  }
  const h0 = O.horasIntegracion(tomas, exposicion);
  const necesarias = O.tomasParaFactor(tomas, factor);
  const h1 = O.horasIntegracion(necesarias, exposicion);
  raiz.querySelector('#s-tomas-horas').textContent = `= ${duracion(h0)} de integración`;

  caja.innerHTML = `
    <div class="lectura__cifra cifra">${ent(necesarias)}<span> tomas</span></div>
    <div class="lectura__sub cifra">${duracion(h1)} en total · te faltan ${duracion(h1 - h0)}</div>
    <div class="formula cifra">
      N = N₀ × X² = ${ent(tomas)} × ${fmt(factor, 1)}² = ${ent(tomas)} × ${fmt(factor ** 2)} = ${ent(necesarias)}<br>
      t = ${ent(necesarias)} × ${fmt(exposicion, exposicion % 1 ? 1 : 0)} s = ${duracion(h1)}
    </div>
    <p class="lectura__texto">Mejorar la SNR ×${fmt(factor, 1)} cuesta ${fmt(factor ** 2, 1)} veces el tiempo que ya llevas.
      ${h1 > 8 ? 'Es más de una noche: tocará integración multinoche (activa siempre «guardar subexposiciones»).' : ''}</p>`;

  pintarGraficaSNR(h0, h1, factor);
}

/** "1 h 30 min", "45 min", "12 h" */
function duracion(horas) {
  const min = Math.round(horas * 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m && h < 10 ? `${h} h ${m} min` : `${h} h`;
}

/** Curva SNR(t) ∝ √t, relativa a la integración actual */
function pintarGraficaSNR(h0, h1, factor) {
  const W = 440, H = 190, m = { izq: 40, der: 14, arr: 16, aba: 30 };
  const tMax = h1 * 1.25;
  const sMax = Math.sqrt(tMax / h0);
  const x = (t) => m.izq + (t / tMax) * (W - m.izq - m.der);
  const y = (s) => H - m.aba - (s / sMax) * (H - m.arr - m.aba);
  // La curva: muchos puntos unidos
  let d = '';
  for (let i = 0; i <= 80; i++) {
    const t = (tMax * i) / 80;
    d += `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(Math.sqrt(t / h0)).toFixed(1)}`;
  }
  // Marcas del eje X en horas "redondas"
  const paso = [0.25, 0.5, 1, 2, 4, 8, 12, 24].find((p) => tMax / p <= 6) || 48;
  let marcas = '';
  for (let t = 0; t <= tMax; t += paso) {
    marcas += `<line x1="${x(t)}" x2="${x(t)}" y1="${H - m.aba}" y2="${H - m.aba + 4}"/>
               <text x="${x(t)}" y="${H - m.aba + 17}" text-anchor="middle">${t < 1 && t > 0 ? t * 60 + ' min' : t + ' h'}</text>`;
  }
  raiz.querySelector('#snr-grafica').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="grafico grafica" role="img" aria-label="Curva de la SNR frente al tiempo de integración">
      <g class="grafica__ejes">
        <line x1="${m.izq}" x2="${W - m.der}" y1="${H - m.aba}" y2="${H - m.aba}"/>
        ${marcas}
        <text x="${m.izq - 8}" y="${y(1) + 4}" text-anchor="end">×1</text>
        <text x="${m.izq - 8}" y="${y(factor) + 4}" text-anchor="end">×${fmt(factor, 1)}</text>
      </g>
      <line class="grafica__guia" x1="${m.izq}" x2="${x(h1)}" y1="${y(factor)}" y2="${y(factor)}"/>
      <line class="grafica__guia" x1="${x(h1)}" x2="${x(h1)}" y1="${y(factor)}" y2="${H - m.aba}"/>
      <line class="grafica__guia" x1="${m.izq}" x2="${x(h0)}" y1="${y(1)}" y2="${y(1)}"/>
      <path class="grafica__curva" d="${d}"/>
      <circle class="grafica__punto grafica__punto--ahora" cx="${x(h0)}" cy="${y(1)}" r="5"/>
      <circle class="grafica__punto" cx="${x(h1)}" cy="${y(factor)}" r="6"/>
      <text class="grafica__texto" x="${x(h0) + 9}" y="${y(1) + 16}">ahora</text>
      <text class="grafica__texto grafica__texto--meta" x="${x(h1) - 9}" y="${y(factor) - 10}" text-anchor="end">objetivo</text>
    </svg>`;
}

/* ==========================================================================
   Eventos
   ========================================================================== */
function alCambiar(ev) {
  const t = ev.target;
  if (t.dataset.campo) {
    // Si tocas un campo de un equipo predefinido, pasa a "a mano" partiendo de sus datos
    if (estado.equipo !== 'manual') {
      const base = equipoActivo();
      estado.manual = { apertura: base.apertura, focal: base.focal, pixel: base.pixel, resX: base.resX, resY: base.resY };
      estado.equipo = 'manual';
    }
    estado.manual[t.dataset.campo] = num(t.value);
  } else if (t.id === 'comparar') {
    estado.comparar = t.value;
  } else if (t.id === 'seeing') {
    estado.seeing = num(t.value);
  } else if (t.dataset.snr) {
    estado.snr[t.dataset.snr] = num(t.value);
  } else return;
  guardarEstado();
  recalcular();
}

function alHacerClic(ev) {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.equipo) {
    estado.equipo = b.dataset.equipo;
    rellenarCampos();
  } else if (b.dataset.objeto) {
    estado.objeto = b.dataset.objeto;
  } else if (b.dataset.accion === 'girar') {
    estado.girado = !estado.girado;
  } else return;
  guardarEstado();
  recalcular();
}
