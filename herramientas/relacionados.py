#!/usr/bin/env python3
"""
relacionados.py — Añade a data/glosario.json el campo "relacionados" ("Ver también").

Cómo usarlo (desde la carpeta AstroKit):
    python3 herramientas/relacionados.py

Cómo decide qué términos están relacionados:
  1. AUTOMÁTICO: si el texto de un término menciona el nombre (o la sigla) de otro,
     están relacionados. Mencionar vale más en un sentido (A habla de B: +3) que
     en el otro (B habla de A: +2); estar en el mismo bloque suma un poco (+0,5)
     para desempatar.
  2. A MANO: el diccionario MANUAL de abajo añade relaciones que el texto no
     dice explícitamente pero que conviene ver juntas (van siempre primero).

Se guardan hasta 6 por término. Puedes editar luego el JSON directamente;
si vuelves a ejecutar este script, recalcula y sobrescribe "relacionados".
Las siglas del bloque 8 enlazan con su término completo.
"""

import json
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUTA = RAIZ / "data" / "glosario.json"
MAXIMO = 6

# Relaciones curadas a mano: id → ids que deben aparecer en "Ver también"
MANUAL = {
    # --- 1. El cielo
    "cielo-profundo": ["nebulosa", "galaxia", "cumulo-abierto-cumulo-globular", "catalogos-messier-m-ngc-ic-caldwell-c-sharpless-sh2"],
    "nebulosa": ["las-lineas-clave", "filtro-de-banda-dual", "espectro-continuo-frente-a-lineas-de-emision", "cielo-profundo"],
    "galaxia": ["filtro-de-banda-ancha-uv-ir-cut", "brillo-superficial", "escala-de-bortle", "via-lactea"],
    "cumulo-abierto-cumulo-globular": ["cielo-profundo", "catalogos-messier-m-ngc-ic-caldwell-c-sharpless-sh2", "contaminacion-luminica"],
    "catalogos-messier-m-ngc-ic-caldwell-c-sharpless-sh2": ["cielo-profundo", "nebulosa", "galaxia", "paleta-sho-o-paleta-hubble"],
    "magnitud-aparente": ["brillo-superficial", "sqm-sky-quality-meter-y-mag-arcsec"],
    "brillo-superficial": ["magnitud-aparente", "sqm-sky-quality-meter-y-mag-arcsec", "galaxia"],
    "tamano-angular-grado-minuto-y-segundo-de-arco": ["campo-de-vision", "escala-de-placa", "poder-resolutivo", "seeing"],
    "coordenadas-ascension-recta-ar-y-declinacion-dec": ["polo-norte-celeste", "goto", "plate-solving", "cenit-horizonte-altitud-y-acimut"],
    "cenit-horizonte-altitud-y-acimut": ["montura-altazimutal", "culminacion", "masa-de-aire-y-la-regla-de-los-30", "coordenadas-ascension-recta-ar-y-declinacion-dec"],
    "culminacion": ["meridiano", "masa-de-aire-y-la-regla-de-los-30", "cenit-horizonte-altitud-y-acimut"],
    "masa-de-aire-y-la-regla-de-los-30": ["culminacion", "seeing", "transparencia", "cupula-de-luz"],
    "ecliptica": ["fase-lunar-y-luna-nueva", "coordenadas-ascension-recta-ar-y-declinacion-dec", "via-lactea"],
    "fase-lunar-y-luna-nueva": ["noche-astronomica", "contaminacion-luminica", "filtro-de-banda-dual", "ecliptica"],
    "noche-astronomica": ["fase-lunar-y-luna-nueva", "escala-de-bortle", "contaminacion-luminica"],
    "via-lactea": ["galaxia", "nebulosa", "ecliptica"],
    # --- 2. Óptica
    "apertura": ["relacion-focal", "poder-resolutivo", "distancia-focal", "relacion-senal-ruido"],
    "distancia-focal": ["campo-de-vision", "escala-de-placa", "relacion-focal", "apertura"],
    "relacion-focal": ["apertura", "distancia-focal", "tiempo-de-integracion"],
    "campo-de-vision": ["distancia-focal", "formato-del-sensor", "mosaico", "tamano-angular-grado-minuto-y-segundo-de-arco"],
    "poder-resolutivo": ["apertura", "seeing", "escala-de-placa", "tamano-angular-grado-minuto-y-segundo-de-arco"],
    "refractor": ["acromatico-apocromatico", "aberracion-cromatica", "reflector", "catadioptrico"],
    "reflector": ["obstruccion-central", "colimacion", "refractor", "catadioptrico"],
    "catadioptrico": ["diseno-plegado", "obstruccion-central", "reflector", "refractor"],
    "diseno-plegado": ["catadioptrico", "refractor", "distancia-focal"],
    "aberracion-cromatica": ["acromatico-apocromatico", "vidrio-ed-extra-low-dispersion-y-fluorita", "refractor"],
    "acromatico-apocromatico": ["aberracion-cromatica", "vidrio-ed-extra-low-dispersion-y-fluorita", "refractor"],
    "cuadruplete-aplanador-de-campo-corrector": ["coma-astigmatismo-curvatura-de-campo-vineteo", "acromatico-apocromatico", "refractor"],
    "coma-astigmatismo-curvatura-de-campo-vineteo": ["cuadruplete-aplanador-de-campo-corrector", "frames-de-calibracion", "colimacion"],
    "enfoque": ["hfd-fwhm", "seeing", "rocio-dew-y-calentador-antirrocio"],
    "seeing": ["transparencia", "hfd-fwhm", "lucky-imaging", "poder-resolutivo"],
    "transparencia": ["seeing", "masa-de-aire-y-la-regla-de-los-30", "contaminacion-luminica"],
    "rocio-dew-y-calentador-antirrocio": ["refrigeracion-activa", "enfoque", "transparencia"],
    # --- 3. Sensor
    "sensor-cmos": ["pixel-y-tamano-de-pixel", "eficiencia-cuantica", "ruido", "matriz-de-bayer-y-camara-en-color"],
    "pixel-y-tamano-de-pixel": ["escala-de-placa", "binning", "megapixeles-mp-y-resolucion", "formato-del-sensor"],
    "formato-del-sensor": ["campo-de-vision", "pixel-y-tamano-de-pixel", "megapixeles-mp-y-resolucion"],
    "megapixeles-mp-y-resolucion": ["pixel-y-tamano-de-pixel", "muestreo-submuestreo-y-sobremuestreo", "binning"],
    "escala-de-placa": ["muestreo-submuestreo-y-sobremuestreo", "pixel-y-tamano-de-pixel", "seeing", "distancia-focal"],
    "muestreo-submuestreo-y-sobremuestreo": ["escala-de-placa", "seeing", "hfd-fwhm", "binning"],
    "binning": ["pixel-y-tamano-de-pixel", "muestreo-submuestreo-y-sobremuestreo", "relacion-senal-ruido"],
    "eficiencia-cuantica": ["sensor-cmos", "relacion-senal-ruido", "camara-monocroma"],
    "matriz-de-bayer-y-camara-en-color": ["camara-monocroma", "reduccion-del-verde", "filtro-de-banda-dual"],
    "camara-monocroma": ["matriz-de-bayer-y-camara-en-color", "filtro-de-banda-estrecha", "combinacion-de-canales"],
    "ruido": ["relacion-senal-ruido", "frames-de-calibracion", "refrigeracion-activa", "dithering"],
    "relacion-senal-ruido": ["ruido", "apilado", "tiempo-de-integracion", "subexposicion"],
    "ganancia-gain-e-iso": ["rango-dinamico", "ruido", "saturacion"],
    "rango-dinamico": ["ganancia-gain-e-iso", "saturacion", "profundidad-de-bits", "histograma"],
    "profundidad-de-bits": ["fits-fit", "tiff-png-jpeg", "rango-dinamico"],
    "saturacion": ["rango-dinamico", "subexposicion", "histograma"],
    "refrigeracion-activa": ["ruido", "frames-de-calibracion", "rocio-dew-y-calentador-antirrocio"],
    # --- 4. Montura
    "rotacion-terrestre-y-seguimiento-sidereo": ["montura", "rotacion-de-campo", "montura-ecuatorial"],
    "montura": ["montura-altazimutal", "montura-ecuatorial", "goto", "rotacion-terrestre-y-seguimiento-sidereo"],
    "rotacion-de-campo": ["montura-altazimutal", "desrotador-de-campo", "modo-eq-en-un-telescopio-inteligente-cuna-ecuatorial", "recorte"],
    "montura-altazimutal": ["rotacion-de-campo", "montura-ecuatorial", "cenit-horizonte-altitud-y-acimut", "nivelacion"],
    "desrotador-de-campo": ["rotacion-de-campo", "montura-altazimutal", "autoguiado"],
    "montura-ecuatorial": ["alineacion-polar", "polo-norte-celeste", "latitud", "meridian-flip"],
    "modo-eq-en-un-telescopio-inteligente-cuna-ecuatorial": ["latitud", "alineacion-polar", "rotacion-de-campo", "montura-ecuatorial"],
    "latitud": ["polo-norte-celeste", "modo-eq-en-un-telescopio-inteligente-cuna-ecuatorial", "alineacion-polar"],
    "alineacion-polar": ["montura-ecuatorial", "polo-norte-celeste", "latitud", "deriva-y-drift"],
    "goto": ["plate-solving", "coordenadas-ascension-recta-ar-y-declinacion-dec", "nivelacion"],
    "plate-solving": ["goto", "coordenadas-ascension-recta-ar-y-declinacion-dec", "calibracion-fotometrica-del-color"],
    "error-periodico": ["autoguiado", "holgura", "montura"],
    "holgura": ["error-periodico", "autoguiado", "montura"],
    "autoguiado": ["error-periodico", "telescopio-guia-oag", "subexposicion"],
    "telescopio-guia-oag": ["autoguiado", "error-periodico"],
    "deriva-y-drift": ["alineacion-polar", "nivelacion", "recorte"],
    "nivelacion": ["montura-altazimutal", "goto", "tripode-y-rosca-3-8"],
    "tripode-y-rosca-3-8": ["nivelacion", "deriva-y-drift", "modo-eq-en-un-telescopio-inteligente-cuna-ecuatorial"],
    "meridian-flip": ["meridiano", "montura-ecuatorial"],
    # --- 5. Captura
    "subexposicion": ["tiempo-de-integracion", "subs-cortas-o-largas", "rotacion-de-campo", "autoguiado"],
    "tiempo-de-integracion": ["relacion-senal-ruido", "subexposicion", "integracion-multinoche", "subs-cortas-o-largas"],
    "subs-cortas-o-largas": ["subexposicion", "ruido", "tiempo-de-integracion", "contaminacion-luminica"],
    "apilado": ["relacion-senal-ruido", "rechazo-de-pixeles", "apilado-en-vivo", "tiempo-de-integracion"],
    "apilado-en-vivo": ["apilado", "subexposicion", "integracion-multinoche"],
    "rechazo-de-pixeles": ["apilado", "dithering", "ruido"],
    "frames-de-calibracion": ["master-dark-master-flat", "ruido", "dithering", "coma-astigmatismo-curvatura-de-campo-vineteo"],
    "master-dark-master-flat": ["frames-de-calibracion", "ruido", "refrigeracion-activa"],
    "dithering": ["rechazo-de-pixeles", "frames-de-calibracion", "ruido"],
    "histograma": ["estirado-stretch-e-imagen-no-lineal", "saturacion", "rango-dinamico"],
    "mosaico": ["campo-de-vision", "mosaico-8k", "tiempo-de-integracion"],
    "mosaico-8k": ["mosaico", "campo-de-vision"],
    "modo-plan-plan-de-sesion": ["integracion-multinoche", "culminacion", "goto"],
    "integracion-multinoche": ["tiempo-de-integracion", "apilado", "fits-fit"],
    "lucky-imaging": ["seeing", "apilado", "filtro-solar"],
    "sesion-first-light-y-noche-de-pruebas": ["apilado-en-vivo", "modo-plan-plan-de-sesion"],
    # --- 6. Luz y filtros
    "contaminacion-luminica": ["escala-de-bortle", "sqm-sky-quality-meter-y-mag-arcsec", "cupula-de-luz", "gradiente"],
    "escala-de-bortle": ["sqm-sky-quality-meter-y-mag-arcsec", "contaminacion-luminica", "cupula-de-luz"],
    "sqm-sky-quality-meter-y-mag-arcsec": ["escala-de-bortle", "magnitud-aparente", "brillo-superficial"],
    "cupula-de-luz": ["contaminacion-luminica", "gradiente", "masa-de-aire-y-la-regla-de-los-30"],
    "gradiente": ["eliminacion-de-gradientes", "contaminacion-luminica", "cupula-de-luz"],
    "espectro-continuo-frente-a-lineas-de-emision": ["las-lineas-clave", "filtro-de-banda-dual", "nebulosa", "galaxia"],
    "las-lineas-clave": ["espectro-continuo-frente-a-lineas-de-emision", "filtro-de-banda-dual", "paleta-sho-o-paleta-hubble", "nanometro-nm-y-ancho-de-banda"],
    "nanometro-nm-y-ancho-de-banda": ["filtro-de-banda-estrecha", "filtro-de-banda-dual", "las-lineas-clave"],
    "filtro-de-banda-ancha-uv-ir-cut": ["galaxia", "filtro-antipolucion-de-banda-ancha", "filtro-de-banda-dual"],
    "filtro-antipolucion-de-banda-ancha": ["contaminacion-luminica", "filtro-de-banda-ancha-uv-ir-cut", "filtro-de-banda-dual"],
    "filtro-de-banda-dual": ["las-lineas-clave", "paleta-hoo", "filtro-de-banda-estrecha", "nebulosa"],
    "filtro-de-banda-estrecha": ["las-lineas-clave", "paleta-sho-o-paleta-hubble", "camara-monocroma", "nanometro-nm-y-ancho-de-banda"],
    "paleta-sho-o-paleta-hubble": ["paleta-hoo", "las-lineas-clave", "falso-color-frente-a-color-natural", "combinacion-de-canales"],
    "paleta-hoo": ["paleta-sho-o-paleta-hubble", "filtro-de-banda-dual", "falso-color-frente-a-color-natural"],
    "falso-color-frente-a-color-natural": ["paleta-sho-o-paleta-hubble", "paleta-hoo", "calibracion-fotometrica-del-color"],
    "filtro-solar": ["halfa-solar", "lucky-imaging"],
    "halfa-solar": ["filtro-solar", "las-lineas-clave"],
    # --- 7. Procesado
    "fits-fit": ["tiff-png-jpeg", "profundidad-de-bits", "imagen-lineal"],
    "tiff-png-jpeg": ["fits-fit", "profundidad-de-bits"],
    "imagen-lineal": ["estirado-stretch-e-imagen-no-lineal", "autoestirado", "eliminacion-de-gradientes", "deconvolucion"],
    "estirado-stretch-e-imagen-no-lineal": ["imagen-lineal", "autoestirado", "histograma"],
    "autoestirado": ["estirado-stretch-e-imagen-no-lineal", "imagen-lineal"],
    "eliminacion-de-gradientes": ["gradiente", "contaminacion-luminica", "imagen-lineal"],
    "calibracion-fotometrica-del-color": ["balance-de-blancos-neutralizacion-del-fondo", "plate-solving", "reduccion-del-verde"],
    "balance-de-blancos-neutralizacion-del-fondo": ["calibracion-fotometrica-del-color", "reduccion-del-verde", "gradiente"],
    "reduccion-del-verde": ["matriz-de-bayer-y-camara-en-color", "balance-de-blancos-neutralizacion-del-fondo", "contaminacion-luminica"],
    "deconvolucion": ["psf", "hfd-fwhm", "imagen-lineal"],
    "psf": ["deconvolucion", "hfd-fwhm", "seeing"],
    "reduccion-de-ruido": ["ruido", "relacion-senal-ruido", "mascaras"],
    "eliminacion-de-estrellas": ["reduccion-de-estrellas", "flujo-de-trabajo-workflow-tipico", "mascaras"],
    "reduccion-de-estrellas": ["eliminacion-de-estrellas", "mascaras"],
    "saturacion-y-curvas": ["estirado-stretch-e-imagen-no-lineal", "mascaras"],
    "mascaras": ["reduccion-de-ruido", "eliminacion-de-estrellas", "saturacion-y-curvas"],
    "combinacion-de-canales": ["paleta-sho-o-paleta-hubble", "camara-monocroma", "paleta-hoo"],
    "recorte": ["rotacion-de-campo", "dithering", "mosaico"],
    "flujo-de-trabajo-workflow-tipico": ["apilado", "eliminacion-de-gradientes", "estirado-stretch-e-imagen-no-lineal", "eliminacion-de-estrellas"],
    # --- 8. Siglas (además de la detección automática de su término completo)
    "sigla-halfa-oiii-sii": ["las-lineas-clave", "filtro-de-banda-dual"],
    "sigla-lights-darks-flats-bias": ["frames-de-calibracion", "subexposicion"],
    "sigla-moonless": ["fase-lunar-y-luna-nueva", "noche-astronomica"],
    "sigla-nb-bb": ["filtro-de-banda-estrecha", "filtro-de-banda-ancha-uv-ir-cut"],
    "sigla-walking-noise": ["dithering", "ruido"],
    "sigla-eaa": ["apilado-en-vivo"],
    "sigla-ascom-alpaca": ["goto"],
}

PALABRAS_VACIAS = {
    "de", "del", "la", "el", "los", "las", "y", "o", "e", "en", "a", "un", "una", "frente", "por", "con",
    "luz", "cielo", "tu", "equipo", "tiempo", "imagen", "color", "luna", "sol", "ruido", "frames", "modo",
    # palabras que aparecen en casi todos los textos y enlazarían por error
    "pixel", "horizonte", "cielo profundo", "nebulosa", "montura", "tipico", "mosaico", "workflow",
}


def normalizar(t):
    t = t.replace("α", "alfa").replace("β", "beta").replace("*", "")
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower()


def claves(termino):
    """Formas en que un término puede aparecer mencionado en otros textos."""
    nombre, alias = termino["termino"], termino.get("alias", "")
    formas = {nombre}
    # "Cenit, horizonte, altitud y acimut" → cada parte; "Apilado (stacking)" → "apilado"
    for trozo in re.split(r"[:/,()]| y | o | e ", nombre):
        formas.add(trozo)
    for trozo in re.split(r"[,/()]", alias):
        formas.add(trozo)
    resultado = set()
    for f in formas:
        f = normalizar(f).strip(" .\"'")
        # Fuera palabras vacías y claves demasiado cortas (salvo siglas de 3+ letras como SNR o FOV)
        if f in PALABRAS_VACIAS or len(f) < 4 and not (len(f) >= 3 and f.isalpha()):
            continue
        resultado.add(f)
    return resultado


def texto_de(t):
    partes = [t.get(c, "") for c in ("definicion", "analogia", "cuenta", "regla", "equipo")]
    partes += [l["nombre"] + " " + l["texto"] for l in t.get("lista", [])]
    return normalizar(" ".join(partes))


def menciona(texto, clave):
    return re.search(r"(?<![a-z0-9])" + re.escape(clave) + r"(?![a-z0-9])", texto) is not None


def main():
    datos = json.loads(RUTA.read_text(encoding="utf-8"))
    terminos = [t for t in datos["terminos"] if t["bloque"] != 8]
    siglas = [t for t in datos["terminos"] if t["bloque"] == 8]
    ids = {t["id"] for t in datos["terminos"]}
    claves_de = {t["id"]: claves(t) for t in terminos}
    textos = {t["id"]: texto_de(t) for t in terminos}

    for a in terminos:
        puntos = {}
        for b in terminos:
            if a["id"] == b["id"]:
                continue
            p = 0
            if any(menciona(textos[a["id"]], k) for k in claves_de[b["id"]]):
                p += 3
            if any(menciona(textos[b["id"]], k) for k in claves_de[a["id"]]):
                p += 2
            if p and a["bloque"] == b["bloque"]:
                p += 0.5
            if p:
                puntos[b["id"]] = p
        automaticos = sorted(puntos, key=lambda i: -puntos[i])
        manuales = [i for i in MANUAL.get(a["id"], []) if i in ids and i != a["id"]]
        lista = manuales + [i for i in automaticos if i not in manuales]
        a["relacionados"] = lista[:MAXIMO]

    # Siglas → el término completo cuyo nombre o alias contiene la sigla
    for s in siglas:
        partes = [normalizar(p).strip() for p in re.split(r"[,/]", s["termino"])]
        candidatos = [t["id"] for t in terminos
                      if any(p and (menciona(normalizar(t["alias"]), p) or menciona(normalizar(t["termino"]), p))
                             for p in partes)]
        manuales = [i for i in MANUAL.get(s["id"], []) if i in ids]
        s["relacionados"] = (manuales + [c for c in candidatos if c not in manuales])[:MAXIMO]

    RUTA.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sin = [t["id"] for t in datos["terminos"] if not t.get("relacionados")]
    malos = [(t["id"], i) for t in datos["terminos"] for i in t.get("relacionados", []) if i not in ids]
    faltan = [(k, i) for k, v in MANUAL.items() for i in [k, *v] if i not in ids]
    print(f"Relacionados calculados. Sin ninguno: {len(sin)} → {sin}")
    if malos or faltan:
        print("ATENCIÓN, ids que no existen:", malos, faltan)


if __name__ == "__main__":
    main()
