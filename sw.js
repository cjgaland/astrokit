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

   ⚠ Cuando cambies archivos de la app publicada, sube el número de VERSION:
     así el navegador detecta un service worker nuevo y renueva la caché.
   ========================================================================== */

const VERSION = 'astrokit-v1';

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
  'js/util.js',
  'js/modulos/glosario.js',
  'data/glosario.json',
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
      .then(() => self.skipWaiting())          // activarse sin esperar a cerrar pestañas
  );
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
