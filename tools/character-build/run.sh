#!/bin/sh
# Build Rokan, then render front/side/back previews.
# Usage: tools/character-build/run.sh TAG [body|parts|all|bake]
# Needs: PY (a Python with the `bpy` module), MH_ASSETS, MH_TARGETS, CHAR_OUT.
set -e
PY=${PY:-python3}
export CHAR_BUILD=${CHAR_BUILD:-$(cd "$(dirname "$0")" && pwd)}
export CHAR_OUT=${CHAR_OUT:-out}
$PY -c "import sys; sys.argv=['x','--','$CHAR_OUT','${2:-all}']; exec(open('$CHAR_BUILD/build_rokan.py').read())"
$PY -c "import sys; sys.argv=['x','--','$CHAR_OUT','$1']; exec(open('$CHAR_BUILD/render.py').read())"
