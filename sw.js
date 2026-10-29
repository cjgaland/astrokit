/* ==========================================================================
   sw.js — Service worker: lo que hace que AstroKit funcione sin conexión
   --------------------------------------------------------------------------
   Un service worker es un pequeño programa que el navegador instala aparte
   y que se pone "en medio" de todas las peticiones de la app, como un
   portero: cuando la app pide un archivo, él decide si lo saca de su caché
   (su almacén local) o lo pide a internet.

   Estrategia:
     · Al instalarse, descarga y guarda TODOS los archivos de la app.
     · Después, sirve siempre la copia guardada al instante (rápido y sin
       cobertura) y, en segundo plano, pide la versión nueva para la
       próxima vez ("stale-while-revalidate").
     · En localhost (cuando estamos desarrollando) hace lo contrario: primero
       la red, para ver los cambios al recargar, y la caché solo si falla.

   Actualizaciones (ver js/actualizaciones.js):
     · Cuando se publica una versión nueva, el navegador descarga este archivo,
       ve que ha cambiado (VERSION distinta) e instala el service worker nuevo
       con todos los archivos nuevos, pero lo deja ESPERANDO.
     · La app lo detecta y muestra el aviso «Hay una versión nueva · Actualizar».
       Al pulsar, la app le manda el mensaje 'actualizar', el nuevo toma el
       control y la página se recarga ya con la versión nueva.

   ⚠ VERSION debe cambiar en cada publicación: publicar_astrokit.sh la sube
     solo si detecta cambios en AstroKit y nadie la ha subido a mano.
   ========================================================================== */

const VERSION = 'astrokit-v17';

// Archivos que forman la app (rutas relativas a esta carpeta)
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/modulos.css',
  'js/app.js',
  'js/almacen.js',
  'js/equipo.js',
  'js/util.js',
  'js/modulos/portada.js',
  'js/modulos/glosario.js',
  'js/modulos/optica.js',
  'js/calculos/optica.js',
  'js/modulos/cielo.js',
  'js/modulos/objetos.js',
  'js/modulos/mapa.js',
  'js/calculos/proyeccion.js',
  'js/pdf.js',
  'data/cielo.json',
  'js/modulos/efemerides.js',
  'js/calculos/efemerides.js',
  'js/calculos/eclipses.js',
  'js/globo.js',
  'data/efemerides.json',
  'data/eclipses.json',
  'data/mundo.json',
  'data/ciudades.json',
  'js/calculos/astro.js',
  'js/modulos/checklist.js',
  'js/modulos/cuaderno.js',
  'js/modulos/enlaces.js',
  'js/modulos/info.js',
  'data/info.json',
  'docs/Manual_de_uso_AstroKit.pdf',
  'js/actualizaciones.js',
  'data/novedades.json',
  'data/enlaces.json',
  'data/checklist.json',
  'data/glosario.json',
  'data/equipos.json',
  'data/objetos.json',
  'iconos/icono.svg',
  'iconos/icono-180.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
];

const EN_DESARROLLO = ['localhost', '127.0.0.1'].includes(self.location.hostname);

// 1) Instalación: llenar la caché
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ARCHIVOS))
    // Sin skipWaiting(): si ya hay una versión funcionando, la nueva espera a
    // que el usuario pulse «Actualizar» (así no cambia nada a mitad de uso).
  );
});

// Mensajes de la app:
//   'actualizar' → el usuario aceptó: tomar el control ya
//   'version'    → responder con la versión (se muestra en Enlaces)
self.addEventListener('message', (evento) => {
  if (evento.data === 'actualizar') self.skipWaiting();
  if (evento.data === 'version' && evento.ports[0]) evento.ports[0].postMessage(VERSION);
});

// 2) Activación: borrar cachés de versiones anteriores
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())         // tomar el control de las pestañas abiertas
  );
});

// 3) Cada petición pasa por aquí
self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  const esPropia = url.origin === self.location.origin;
  const esFuente = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!esPropia && !esFuente) return;           // lo demás (enlaces externos) no se toca

  if (esPropia && EN_DESARROLLO) {
    evento.respondWith(primeroRed(peticion));
  } else {
    evento.respondWith(primeroCache(peticion, evento));
  }
});

/** Sirve la caché al instante y actualiza en segundo plano. */
async function primeroCache(peticion, evento) {
  const cache = await caches.open(VERSION);
  // ignoreSearch: "index.html?x=1" usa la copia de "index.html"
  const guardada = await cache.match(peticion, { ignoreSearch: true });
  const deRed = fetch(peticion)
    .then((respuesta) => {
      // ok = respuesta propia correcta; opaque = fuente de Google (no podemos leerla, pero sí guardarla)
      if (respuesta.ok || respuesta.type === 'opaque') cache.put(peticion, respuesta.clone());
      return respuesta;
    })
    .catch(() => null);
  if (guardada) {
    evento.waitUntil(deRed);                    // que la actualización termine aunque ya respondimos
    return guardada;
  }
  return (await deRed) || respuestaSinConexion(peticion);
}

/** Pide a la red; si falla, usa la caché. */
async function primeroRed(peticion) {
  const cache = await caches.open(VERSION);
  try {
    // cache: 'no-cache' obliga a preguntar al servidor si el archivo cambió
    const respuesta = await fetch(peticion, { cache: 'no-cache' });
    if (respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch {
    return (await cache.match(peticion, { ignoreSearch: true })) || respuestaSinConexion(peticion);
  }
}

/** Si piden una página y no hay nada: devolvemos la app (index.html) de la caché. */
async function respuestaSinConexion(peticion) {
  if (peticion.mode === 'navigate') {
    const app = await caches.match('index.html');
    if (app) return app;
  }
  return new Response('Sin conexión y sin copia guardada.', { status: 503, statusText: 'Sin conexión' });
}
