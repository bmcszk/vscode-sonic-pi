# vscode-sonic-pi README

Completions and hovers for Sonic Pi code editing.

Sonic Pi must be installed in order for this to work. https://sonic-pi.net/

Run `Sonic Pi: Open Examples`, then open a file and hit `F5` to get started.

## Third Party contributions

Largely based on the previous works of 
Jackson Kearl (https://github.com/JacksonKearl/vscode-sonic-pi) and
Luis Lloret via (https://github.com/llloret/sonic-pi-vscode-editor)

Sonic Pi Tutorial content copyright Scott Aaron.

Adapted by s00500 to support SonicPi v4 and up.

# Contribute

Liked this Project? 
I really welcome **Pull Requests** !
You can also **support** me by sending me a :coffee:
[Coffee](https://paypal.me/lukasbachschwell/5).

## Fork notes

Forked from [s00500/vscode-sonic-pi](https://github.com/s00500/vscode-sonic-pi) to target Sonic Pi 5 on Linux.
Tested against Sonic Pi 5.0.0-1 (pacman), daemon at `/usr/lib/sonic-pi/app/server/ruby/bin/daemon.rb`: a live-daemon run and stop were accepted by `spider.log`.
Divergences from upstream since 0.1.0:

- default Sonic Pi root is `/usr/lib/sonic-pi` on Linux, and both the root and its `app/` daemon layout are detected.
- the daemon stdout line is parsed for 6 values (Sonic Pi 5 drops the tau ports), negative tokens are kept, and a garbage line aborts the server start instead of sending OSC with a bogus token.
- the dead log-parser code is deleted.
- version 0.1.1.

Tests: `test/unit` (token parse, start guard) and `test/e2e/protocol.js` (live daemon protocol gate; needs `ruby` and Sonic Pi 5 on this Linux layout).
Evidence for the Sonic Pi 5 daemon protocol and install layout lives in `docs/research/`, and the issue ledger in `.beans/`; both are committed with the fork.
