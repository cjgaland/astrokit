#!/usr/bin/env python3
"""
preparar_cielo.py — Genera data/cielo.json (estrellas y constelaciones del Mapa celeste).

Origen de los datos: proyecto d3-celestial de Olaf Frohn (licencia BSD-3,
https://github.com/ofrohn/d3-celestial), archivos data/stars.6.json,
data/constellations.lines.json y data/constellations.json.

Uso (con los tres archivos descargados en una carpeta):
    python3 herramientas/preparar_cielo.py /ruta/a/la/carpeta

Qué hace:
  · Se queda con las estrellas hasta magnitud 6,0 (5.044: todo lo que ve el ojo
    desde un campo oscuro; el mapa filtra después con su deslizador de magnitud)
    y redondea las cifras para que pese poco.
  · Convierte la ascensión recta de la convención de d3 (−180…180) a 0…360.
  · Añade los nombres propios en español de las estrellas más conocidas y
    COMPRUEBA cada uno contra su magnitud real (si un número HIP estuviera mal,
    el script se detiene en vez de poner un nombre en la estrella equivocada).
  · Guarda las líneas y el nombre en español de las 88 constelaciones.
"""
import json
import sys
from pathlib import Path

ORIGEN = Path(sys.argv[1])
DESTINO = Path(__file__).resolve().parent.parent / 'data' / 'cielo.json'
MAG_LIMITE = 6.0

# Nombres propios: HIP → (nombre, magnitud aproximada esperada). Tolerancia ±0,35 mag.
NOMBRES = {
    32349: ('Sirio', -1.44), 69673: ('Arturo', -0.05), 91262: ('Vega', 0.03), 24608: ('Capella', 0.08),
    24436: ('Rigel', 0.18), 37279: ('Proción', 0.40), 27989: ('Betelgeuse', 0.45), 97649: ('Altair', 0.76),
    21421: ('Aldebarán', 0.87), 80763: ('Antares', 1.06), 65474: ('Espiga', 0.98), 37826: ('Pólux', 1.16),
    113368: ('Fomalhaut', 1.17), 102098: ('Deneb', 1.25), 49669: ('Régulo', 1.36), 36850: ('Cástor', 1.58),
    11767: ('Polar', 1.97), 25336: ('Bellatrix', 1.64), 15863: ('Mirfak', 1.79), 54061: ('Dubhe', 1.81),
    67301: ('Alkaid', 1.85), 65378: ('Mizar', 2.23), 62956: ('Alioth', 1.76), 53910: ('Merak', 2.34),
    58001: ('Phecda', 2.41), 59774: ('Megrez', 3.32), 3179: ('Schedar', 2.24), 746: ('Caph', 2.28),
    14576: ('Algol', 2.09), 677: ('Alpheratz', 2.07), 5447: ('Mirach', 2.07), 9640: ('Almach', 2.10),
    9884: ('Hamal', 2.01), 27366: ('Saiph', 2.07), 26727: ('Alnitak', 1.74), 26311: ('Alnilam', 1.69),
    25930: ('Mintaka', 2.25), 33579: ('Adhara', 1.50), 34444: ('Wezen', 1.83), 86032: ('Rasalhague', 2.08),
    57632: ('Denébola', 2.14), 46390: ('Alfard', 1.99), 72607: ('Kochab', 2.07), 87833: ('Eltanin', 2.24),
    95947: ('Albireo', 3.05), 100453: ('Sadr', 2.23), 107315: ('Enif', 2.38), 113963: ('Markab', 2.49),
    113881: ('Scheat', 2.44), 1067: ('Algenib', 2.83), 85927: ('Shaula', 1.62), 92855: ('Nunki', 2.05),
    90185: ('Kaus Australis', 1.79), 72622: ('Zubenelgenubi', 2.75), 76267: ('Alphecca', 2.22),
    28360: ('Menkalinan', 1.90), 25428: ('Elnath', 1.65), 17702: ('Alcíone', 2.85), 30438: ('Canopus', -0.62),
    31681: ('Alhena', 1.93), 50583: ('Algieba', 2.01), 14135: ('Menkar', 2.54), 8903: ('Sheratan', 2.64),
    4427: ('Gamma Cas', 2.39), 102488: ('Gienah Cygni', 2.48), 61084: ('Gacrux', 1.59),
}

# Nombres de uso común en español donde d3-celestial usa la traducción literal
NOMBRE_COMUN = {
    'Ari': 'Aries', 'Aur': 'Auriga', 'Cnc': 'Cáncer', 'CVn': 'Perros de Caza', 'Gem': 'Géminis',
    'Leo': 'Leo', 'Lib': 'Libra', 'Sco': 'Escorpio', 'Tau': 'Tauro', 'Vir': 'Virgo', 'Psc': 'Piscis',
    'Com': 'Cabellera de Berenice', 'Vul': 'Zorra', 'Lep': 'Liebre', 'Car': 'Quilla', 'Dor': 'Dorado',
    'Pic': 'Pintor', 'Oct': 'Octante', 'Cap': 'Capricornio', 'Sgr': 'Sagitario', 'Aqr': 'Acuario',
}

def ra360(lon):
    return round(lon + 360 if lon < 0 else lon, 3)

estrellas_d3 = json.loads((ORIGEN / 'stars.6.json').read_text())['features']
por_hip = {f['id']: f for f in estrellas_d3}

# Comprobar los nombres antes de nada
errores = []
for hip, (nombre, mag) in NOMBRES.items():
    f = por_hip.get(hip)
    if not f:
        errores.append(f'{nombre}: HIP {hip} no está en el catálogo')
    elif abs(f['properties']['mag'] - mag) > 0.35:
        errores.append(f"{nombre}: HIP {hip} tiene mag {f['properties']['mag']} y se esperaba {mag}")
if errores:
    sys.exit('Nombres incorrectos:\n  ' + '\n  '.join(errores))

estrellas = []
for f in estrellas_d3:
    mag = f['properties']['mag']
    if mag > MAG_LIMITE:
        continue
    lon, lat = f['geometry']['coordinates']
    fila = [ra360(lon), round(lat, 3), round(mag, 2)]
    # Índice de color B−V (sirve para teñir las estrellas: azuladas < 0,3 < blancas < 1,0 < anaranjadas)
    try:
        fila.append(round(float(f['properties'].get('bv') or 0.6), 2))
    except ValueError:
        fila.append(0.6)
    if f['id'] in NOMBRES:
        fila.append(NOMBRES[f['id']][0])
    estrellas.append(fila)
estrellas.sort(key=lambda e: e[2])        # las brillantes primero: se dibujan encima

nombres = {f['id']: f for f in json.loads((ORIGEN / 'constellations.json').read_text())['features']}
constelaciones = []
for f in json.loads((ORIGEN / 'constellations.lines.json').read_text())['features']:
    if f['id'] not in nombres:
        continue
    p = nombres[f['id']]
    lineas = [[[ra360(lon), round(lat, 2)] for lon, lat in tramo] for tramo in f['geometry']['coordinates']]
    lon, lat = p['geometry']['coordinates']
    constelaciones.append({
        'id': f['id'],
        'nombre': p['properties']['es'].replace(' ', ' '),
        'latin': p['properties']['name'],
        'etiqueta': [ra360(lon), round(lat, 2)],
        'lineas': lineas,
    })

datos = {
    '_nota': 'Generado con herramientas/preparar_cielo.py a partir de d3-celestial (Olaf Frohn, licencia BSD-3). '
             'estrellas: [AR en grados, Dec en grados, magnitud, índice B−V, nombre opcional]; J2000.',
    'estrellas': estrellas,
    'constelaciones': constelaciones,
}
DESTINO.write_text(json.dumps(datos, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'{len(estrellas)} estrellas (mag ≤ {MAG_LIMITE}), {sum(1 for e in estrellas if len(e) > 4)} con nombre, '
      f'{len(constelaciones)} constelaciones → {DESTINO.name} ({DESTINO.stat().st_size // 1024} KB)')
