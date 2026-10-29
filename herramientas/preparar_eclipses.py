#!/usr/bin/env python3
"""
preparar_eclipses.py — Genera data/eclipses.json (eclipses de Sol con sus franjas).

Origen: las páginas «Besselian Elements» del buscador de eclipses de la NASA
(F. Espenak, GSFC; https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=+AAAAMMDD).
Condición de uso de la NASA: citar «Eclipse Predictions by Fred Espenak, NASA's GSFC».

Uso (con las páginas descargadas como seAAAAMMDD.html en una carpeta):
    python3 -I herramientas/preparar_eclipses.py /ruta/a/la/carpeta

Qué guarda de cada eclipse:
  · Los ELEMENTOS BESSELIANOS: polinomios en t = t1 − t0 (horas TDT) de x, y
    (posición del eje de la sombra en el «plano fundamental», en radios
    terrestres), d (declinación del eje), μ (su ángulo horario en Greenwich),
    l1 y l2 (radios de la penumbra y la umbra en ese plano) y tan f1, tan f2
    (la abertura de los dos conos). Con ellos se calcula todo lo demás en
    js/calculos/eclipses.js.
  · ΔT (TT − UT) para pasar de tiempo dinámico a hora civil.
  · Los valores publicados de la máxima (hora, lugar, duración, anchura) para
    COMPROBAR nuestros cálculos en las pruebas.
"""
import html
import json
import re
import sys
from pathlib import Path

ORIGEN = Path(sys.argv[1])
DESTINO = Path(__file__).resolve().parent.parent / 'data' / 'eclipses.json'
TIPOS = {'T': 'total', 'A': 'anular', 'H': 'híbrido', 'P': 'parcial'}


def texto(ruta):
    t = ruta.read_text(encoding='utf-8', errors='replace')
    t = re.sub(r'<[^>]*>', '', t)
    t = html.unescape(t).replace('\xa0', ' ')
    # La NASA mete avisos de PHP en mitad de la tabla: fuera
    return '\n'.join(l for l in t.split('\n') if not l.strip().startswith('Warning:'))


def numero(patron, t, grupo=1):
    m = re.search(patron, t, re.S)
    if not m:
        raise ValueError(f'No encuentro {patron!r}')
    return m.group(grupo)


eclipses = []
for ruta in sorted(ORIGEN.glob('se*.html')):
    t = texto(ruta)
    fecha = ruta.stem[2:]
    tipo = numero(r'Eclipse Type = (\w)', t)
    t0 = float(numero(r'([\d.]+) TDT\s+\(=t0\)', t))
    # Filas de la tabla: n=0..2 con 6 columnas; la fila 3 solo trae x e y (y quizá ceros detrás de los avisos)
    tabla = numero(r'n\s+x\s+y\s+d\s+l1\s+l2\s+μ\s*\n(.*?)tan f1', t)
    cifras = [float(c) for c in re.findall(r'-?\d+\.\d+', tabla)]
    filas = [cifras[0:6], cifras[6:12], cifras[12:18]]
    x3, y3 = cifras[18], cifras[19]
    columna = lambda i: [f[i] for f in filas]
    e = {
        'id': f'sol-{fecha[:4]}-{fecha[4:6]}-{fecha[6:]}',
        'fecha': f'{fecha[:4]}-{fecha[4:6]}-{fecha[6:]}',
        'tipo': TIPOS[tipo],
        'deltaT': float(numero(r'ΔT =\s*([\d.]+) s', t)),
        't0': t0,
        'x': columna(0) + [x3], 'y': columna(1) + [y3],
        'd': columna(2), 'l1': columna(3), 'l2': columna(4), 'mu': columna(5),
        'tanf1': float(numero(r'tan f1 = ([\d.]+)', t)),
        'tanf2': float(numero(r'tan f2 = ([\d.]+)', t)),
        'gamma': float(numero(r'Gamma = (-?[\d.]+)', t)),
        'magnitud': float(numero(r'Eclipse Magnitude = ([\d.]+)', t)),
        'saros': int(numero(r'Saros Series = (\d+)', t)),
    }
    # Valores publicados de la máxima (para las pruebas)
    # La NASA a veces escribe «10:6:34»: se rellena a «10:06:34»
    hora = ':'.join(c.zfill(2) for c in numero(r'Circumstances at Greatest Eclipse:\s+(\d+:\d+:\d+) UT', t).split(':'))
    lat = re.search(r'Latitude:\s+([\d.]+)° ([NS])', t)
    lon = re.search(r'Longitude:\s+([\d.]+)° ([EW])', t)
    ref = {'horaUT': hora,
           'lat': float(lat.group(1)) * (1 if lat.group(2) == 'N' else -1),
           'lon': float(lon.group(1)) * (1 if lon.group(2) == 'E' else -1)}
    anchura = re.search(r'Path Width = ([\d.]+) km', t)
    duracion = re.search(r'Central Duration = (\d+)m(\d+)s', t)
    if anchura and float(anchura.group(1)) > 0:              # en los parciales vale 0: no hay franja central
        ref['anchuraKm'] = float(anchura.group(1))
    if duracion and (int(duracion.group(1)) or int(duracion.group(2))):
        ref['duracionS'] = int(duracion.group(1)) * 60 + int(duracion.group(2))
    e['maxima'] = ref
    eclipses.append(e)

datos = {
    '_nota': 'Generado con herramientas/preparar_eclipses.py. Elementos besselianos: «Eclipse Predictions by '
             "Fred Espenak, NASA's GSFC». Polinomios en t = t1 − t0 (horas TDT); x, y, l1, l2 en radios terrestres; "
             'd y μ en grados. «maxima» son los valores publicados, para comprobar los cálculos.',
    'eclipses': eclipses,
}
DESTINO.write_text(json.dumps(datos, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'{len(eclipses)} eclipses → {DESTINO.name} ({DESTINO.stat().st_size // 1024} KB)')
for e in eclipses:
    print(' ', e['fecha'], e['tipo'], e['maxima'])
