#!/usr/bin/env python3
"""
preparar_mundo.py — Genera data/mundo.json (costas, fronteras y tierra del globo de eclipses).

Origen: countries-50m.json del paquete world-atlas 2.0.2 (Mike Bostock), hecho a
partir de Natural Earth (dominio público), descargado de cdn.jsdelivr.net.

Uso:
    python3 -I herramientas/preparar_mundo.py /ruta/a/countries-50m.json

Qué hace:
  · Descodifica el TopoJSON (arcos cuantizados y codificados por diferencias).
  · Reconstruye los anillos de TIERRA (sirven a la vez para pintar los
    continentes y como líneas de costa) y separa las FRONTERAS (arcos que
    comparten dos países).
  · Simplifica cada línea con Douglas-Peucker (tolerancia en grados) y quita
    los islotes diminutos.
  · Guarda cada línea en centésimas de grado (~1 km) y por DIFERENCIAS:
    [lon0, lat0, dlon1, dlat1, dlon2, dlat2, …] (enteros cortos: pesa mucho menos).
"""
import json
import math
import sys
from pathlib import Path

ORIGEN = Path(sys.argv[1])
DESTINO = Path(__file__).resolve().parent.parent / 'data' / 'mundo.json'
TOLERANCIA = 0.04          # grados (≈ 4 km): la línea se aparta como mucho esto del original

topo = json.loads(ORIGEN.read_text())
(sx, sy), (tx, ty) = topo['transform']['scale'], topo['transform']['translate']

# 1) Arcos absolutos
arcos = []
for arco in topo['arcs']:
    x = y = 0
    puntos = []
    for dx, dy in arco:
        x += dx; y += dy
        puntos.append((x * sx + tx, y * sy + ty))
    arcos.append(puntos)

def arco(i):
    return arcos[i] if i >= 0 else arcos[~i][::-1]

def anillo(indices):
    puntos = []
    for i in indices:
        a = arco(i)
        puntos.extend(a if not puntos else a[1:])
    return puntos

# 2) ¿Cuántos países usan cada arco? 1 = costa, 2 = frontera
usos = [0] * len(arcos)
def recorrer(geom, fn):
    if geom['type'] == 'Polygon':
        for r in geom['arcs']: fn(r)
    elif geom['type'] == 'MultiPolygon':
        for p in geom['arcs']:
            for r in p: fn(r)
for g in topo['objects']['countries']['geometries']:
    def contar(r):
        for i in r: usos[i if i >= 0 else ~i] += 1
    recorrer(g, contar)

# 3) Douglas-Peucker
def simplificar(puntos, tol=TOLERANCIA):
    if len(puntos) < 3:
        return puntos
    def dist(p, a, b):
        if a == b: return math.dist(p, a)
        (x0, y0), (x1, y1), (x2, y2) = p, a, b
        return abs((x2 - x1) * (y1 - y0) - (x1 - x0) * (y2 - y1)) / math.dist(a, b)
    guardar = [False] * len(puntos); guardar[0] = guardar[-1] = True
    pila = [(0, len(puntos) - 1)]
    while pila:
        i, j = pila.pop()
        mejor, k = 0, None
        for m in range(i + 1, j):
            d = dist(puntos[m], puntos[i], puntos[j])
            if d > mejor: mejor, k = d, m
        if k is not None and mejor > tol:
            guardar[k] = True
            pila += [(i, k), (k, j)]
    return [p for p, g in zip(puntos, guardar) if g]

def plano(puntos):
    """Centésimas de grado codificadas por diferencias"""
    salida, px, py = [], 0, 0
    for lon, lat in puntos:
        x, y = round(lon * 100), round(lat * 100)
        if salida and x == px and y == py:
            continue                                  # punto repetido tras redondear
        salida += [x, y] if not salida else [x - px, y - py]
        px, py = x, y
    return salida

def area(puntos):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(puntos, puntos[1:] + puntos[:1]))) / 2

fronteras = [plano(simplificar(a)) for i, a in enumerate(arcos) if usos[i] >= 2]

# 4) Tierra: anillos del objeto «land»
tierra = []
def anadir(r):
    pts = simplificar(anillo(r))
    if len(pts) >= 4 and area(pts) > 0.01:          # fuera islotes de menos de ~0,01 grados²
        tierra.append(plano(pts))
for g in topo['objects']['land']['geometries']:
    recorrer(g, anadir)

datos = {
    '_nota': 'Generado con herramientas/preparar_mundo.py a partir de world-atlas 2.0.2 (countries-50m), hecho con '
             'Natural Earth (dominio público).',
    'formato': 'centésimas de grado; primer punto absoluto y el resto como diferencias',
    'fronteras': [f for f in fronteras if len(f) >= 4],
    'tierra': tierra,
}
DESTINO.write_text(json.dumps(datos, separators=(',', ':')), encoding='utf-8')
n = lambda L: sum(len(x) // 2 for x in L)
print(f"fronteras {len(datos['fronteras'])} "
      f"({n(datos['fronteras'])} puntos), tierra {len(tierra)} anillos ({n(tierra)}) → {DESTINO.name} "
      f"({DESTINO.stat().st_size // 1024} KB)")
