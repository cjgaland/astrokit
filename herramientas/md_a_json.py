#!/usr/bin/env python3
"""
md_a_json.py — Convierte Glosario_Astrofotografia.md en data/glosario.json.

Cómo usarlo (desde la carpeta AstroKit):
    python3 herramientas/md_a_json.py

Solo usa la librería estándar de Python. Es de "un solo uso": una vez generado
el JSON, lo normal es editar directamente data/glosario.json. Si vuelves a
ejecutarlo, SOBRESCRIBE el JSON con lo que diga el .md.

Cómo está escrito el glosario (y por tanto qué busca este script):
  - Cada bloque temático empieza con "## N. Título".
  - Cada término es un párrafo que empieza por "**Nombre del término**." y
    dentro lleva marcas en cursiva como "*Analogía:*", "*La cuenta:*",
    "*En tu equipo:*"... que usamos para trocear la ficha.
  - Algunos términos van seguidos de una lista "- **Subtipo**: texto".
  - El bloque 8 es una tabla de siglas | Sigla | Significa |.
"""

import json
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent          # carpeta AstroKit
ORIGEN = RAIZ.parent / "Glosario_Astrofotografia.md"    # el .md está en la carpeta de arriba
DESTINO = RAIZ / "data" / "glosario.json"

# Descripción corta de cada bloque y un "color espectral" que lo identifica en la app.
# Los colores se definen en css/tokens.css como --b1 ... --b8; aquí solo guardamos el número.
BLOQUES_INFO = {
    # número: (nombre corto para los filtros, subtítulo)
    1: ("Cielo", "Dónde mirar y cuándo"),
    2: ("Óptica", "Cómo entra la luz"),
    3: ("Sensor", "De fotones a números"),
    4: ("Montura", "Perseguir un cielo que gira"),
    5: ("Captura", "Muchas fotos para hacer una"),
    6: ("Filtros", "Contaminación y filtros"),
    7: ("Procesado", "De datos oscuros a imagen"),
    8: ("Siglas", "Siglas y jerga, en una línea"),
}

# Marcas en cursiva → campo de la ficha. "etiqueta" es el texto que se muestra en la app.
MARCAS = {
    "Analogía": ("analogia", None),
    "La cuenta": ("cuenta", "La cuenta"),
    "La física": ("cuenta", "La física"),
    "La matemática": ("cuenta", "La matemática"),
    "La estadística": ("cuenta", "La estadística"),
    "Para el amante de las matemáticas": ("cuenta", "Para el amante de las matemáticas"),
    "Regla práctica": ("regla", "Regla práctica"),
    "Consejo": ("regla", "Consejo"),
    "Su problema": ("regla", "Su problema"),
    "En tu equipo": ("equipo", None),
}
PATRON_MARCA = re.compile(r"\*(" + "|".join(re.escape(m) for m in MARCAS) + r"):\*\s*")


def slug(texto):
    """'Relación focal (f/)' → 'relacion-focal-f'. Sirve de identificador estable."""
    t = texto.replace("α", "alfa").replace("β", "beta")
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")   # quita tildes
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t


def separar_nombre(nombre_md):
    """'Cielo profundo (DSO, *Deep Sky Object*)' → ('Cielo profundo', 'DSO, *Deep Sky Object*')."""
    # Solo separamos si hay UN único paréntesis y va al final; si hay varios
    # (p. ej. "Catálogos: Messier (M), NGC, IC, Caldwell (C)...") dejamos el nombre entero.
    m = re.match(r"^([^(]*?)\s*\(([^()]+)\)\s*$", nombre_md)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return nombre_md.strip(), ""


def trocear(texto):
    """Divide el texto de un término en sus campos según las marcas en cursiva."""
    campos = {"definicion": ""}
    trozos = PATRON_MARCA.split(texto)
    # split con grupo devuelve: [antes, marca1, texto1, marca2, texto2, ...]
    campos["definicion"] = trozos[0].strip()
    for i in range(1, len(trozos), 2):
        campo, etiqueta = MARCAS[trozos[i]]
        valor = trozos[i + 1].strip()
        if campo in campos:                       # por si un término repite marca
            campos[campo] += " " + valor
        else:
            campos[campo] = valor
        if etiqueta and campo in ("cuenta", "regla"):
            campos[campo + "Etiqueta"] = etiqueta
    return campos


def convertir():
    lineas = ORIGEN.read_text(encoding="utf-8").splitlines()
    bloques, terminos = [], []
    bloque_actual = None
    termino_actual = None
    ids_usados = set()

    def nuevo_id(nombre):
        base = slug(nombre) or "termino"
        nid, n = base, 2
        while nid in ids_usados:
            nid, n = f"{base}-{n}", n + 1
        ids_usados.add(nid)
        return nid

    for linea in lineas:
        linea = linea.rstrip()

        # --- Cabecera de bloque: "## 3. El sensor: de fotones a números"
        m = re.match(r"^## (\d)\. (.+)$", linea)
        if m:
            bloque_actual = int(m.group(1))
            corto, subtitulo = BLOQUES_INFO.get(bloque_actual, (m.group(2), ""))
            bloques.append({"id": bloque_actual, "titulo": m.group(2),
                            "corto": corto, "subtitulo": subtitulo})
            termino_actual = None
            continue
        if linea.startswith("## "):                # "Fuentes consultadas", "Cómo usar"...
            bloque_actual = None
            termino_actual = None
            continue
        if bloque_actual is None:
            continue

        # --- Bloque 8: filas de la tabla de siglas
        if bloque_actual == 8:
            m = re.match(r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$", linea)
            if m and m.group(1) not in ("Sigla o expresión", "---"):
                sigla, significa = m.group(1), m.group(2)
                terminos.append({"id": nuevo_id("sigla-" + sigla), "bloque": 8,
                                 "termino": sigla, "alias": "", "definicion": significa})
            continue

        # --- Nuevo término: "**Nombre**. Texto..." o "**Las líneas clave**:"
        m = re.match(r"^\*\*(.+?)\*\*[.:]\s*(.*)$", linea)
        if m:
            nombre, alias = separar_nombre(m.group(1))
            termino_actual = {"id": nuevo_id(nombre), "bloque": bloque_actual,
                              "termino": nombre, "alias": alias}
            termino_actual.update(trocear(m.group(2)))
            terminos.append(termino_actual)
            continue

        # --- Elemento de lista que cuelga del término anterior: "- **De emisión**: texto"
        m = re.match(r"^- \*\*(.+?)\*\*[:,]?\s*(.*)$", linea)
        if m and termino_actual:
            termino_actual.setdefault("lista", []).append(
                {"nombre": m.group(1), "texto": m.group(2).lstrip(": ").strip()})
            continue

        # --- Párrafo suelto que empieza por una marca ("*En tu equipo:* ...") → al término anterior
        if PATRON_MARCA.match(linea) and termino_actual:
            for campo, valor in trocear(linea).items():
                if campo == "definicion" and not valor:
                    continue
                if campo in termino_actual and campo != "definicion":
                    termino_actual[campo] += " " + valor
                else:
                    termino_actual.setdefault(campo, valor)

    datos = {
        "_nota": "Generado desde Glosario_Astrofotografia.md con herramientas/md_a_json.py. "
                 "Puedes editarlo a mano. Admite **negrita** y *cursiva*.",
        "bloques": bloques,
        "terminos": terminos,
    }
    DESTINO.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(bloques)} bloques y {len(terminos)} términos → {DESTINO.relative_to(RAIZ)}")


if __name__ == "__main__":
    convertir()
