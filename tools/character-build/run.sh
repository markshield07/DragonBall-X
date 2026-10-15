#!/bin/sh
# Build one character, then render front/side/back previews.
# Usage: CHAR=rokan tools/character-build/run.sh TAG [body|parts|all|bake]
# CHAR is a key of characters.py (rokan, kaizen, vexar, toren, zyra, zeron).
# Needs: PY (a Python with the `bpy` module), MH_ASSETS, MH_TARGETS, CHAR_OUT.
set -e
PY=${PY:-python3}
export CHAR_BUILD=${CHAR_BUILD:-$(cd "$(dirname "$0")" && pwd)}
export CHAR_OUT=${CHAR_OUT:-out}
export CHAR=${CHAR:-rokan}
$PY -c "import sys; sys.argv=['x','--','$CHAR_OUT','${2:-all}']; exec(open('$CHAR_BUILD/build_character.py').read())"
$PY -c "import sys; sys.argv=['x','--','$CHAR_OUT','$1']; exec(open('$CHAR_BUILD/render.py').read())"
