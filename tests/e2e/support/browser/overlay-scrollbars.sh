#!/bin/sh
# Starts the browser of the tests with overlay scrollbars: see overlay-scrollbars.ts.
case " $* " in
  *" --headless "*) browser=$FLYER_HEADLESS_SHELL ;;
  *) browser=$FLYER_CHROMIUM ;;
esac
exec "$browser" "$@" -AppleShowScrollBars WhenScrolling
