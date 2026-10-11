#!/bin/bash
# ============================================================================
# abrir_astrokit.command — Doble clic para abrir AstroKit en el Mac
# ----------------------------------------------------------------------------
# Levanta un servidor web local con el Python que ya trae macOS y abre la app
# en el navegador. La ventana de Terminal debe quedarse abierta mientras uses
# AstroKit; para pararlo, ciérrala o pulsa Ctrl+C.
#
# (La primera vez, macOS puede pedir permiso: clic derecho → Abrir.)
# ============================================================================

cd "$(dirname "$0")" || exit 1
PUERTO=8765

# Si ya hay un servidor en ese puerto (lo abriste antes), solo abrimos el navegador
if lsof -i ":$PUERTO" -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://localhost:$PUERTO/"
  exit 0
fi

echo "AstroKit en http://localhost:$PUERTO/  (Ctrl+C para cerrar)"
( sleep 1; open "http://localhost:$PUERTO/" ) &
python3 -m http.server "$PUERTO" --bind 127.0.0.1
