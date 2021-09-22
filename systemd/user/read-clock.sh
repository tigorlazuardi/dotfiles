#!/bin/sh
DISPLAY=:0
/usr/bin/date +"%H %p" | /usr/bin/awk '{sub(/^0*/,"");}1' | /usr/bin/xargs printf "It's %d O'Clock" | /usr/bin/espeak --stdout | /usr/bin/aplay
