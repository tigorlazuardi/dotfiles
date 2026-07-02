# pi-loop (@koltmcbride/pi-loop) persistence store.
# Keep loop state OUT of project repos (.pi/loops pollution) by pointing
# PI_LOOP at a fixed home-scoped store FILE. Loops survive --resume/--continue.
# NOTE: an absolute PI_LOOP is used as-is (no sessionId suffix), so all
# sessions share this one file. store.ts mkdirs the parent dir itself.
set -gx PI_LOOP /home/tigor/.pi/loop-state/loops.json
