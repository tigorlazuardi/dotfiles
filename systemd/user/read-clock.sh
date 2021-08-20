#!/bin/sh
DISPLAY=:0
/usr/bin/date +"%I %p" | /usr/bin/awk '{sub(/^0*/,"");}1' | /usr/bin/xargs printf "It's %d %s" | /usr/bin/espeak --stdout | /usr/bin/aplay
