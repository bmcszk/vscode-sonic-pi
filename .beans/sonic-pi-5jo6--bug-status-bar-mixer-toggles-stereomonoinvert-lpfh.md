---
# sonic-pi-5jo6
title: 'Bug: status bar mixer toggles (stereo/mono/invert, LPF/HPF) don''t work or give no feedback'
status: todo
type: bug
priority: normal
created_at: 2026-11-19T23:10:10Z
updated_at: 2026-11-19T23:16:40Z
parent: sonic-pi-6fiz
---

# Bug: mixer toggles (stereo/mono/invert, LPF/HPF) don't work / give no feedback

## Research (daemon + lib source read, this session)
User live report: 'status bar switches (on/off) e.g. stereo mono and LPF, HPF, probably all, DONT WORK'.

Editor sends verified correct (src/source-runner/senders.ts: /mixer-stereo-mode|mono-mode|invert-stereo|standard-stereo(token); /mixer-lpf-enable(token,freq)|disable; /mixer-hpf-*) - matching spider-server.rb routes :528-608. The failure is DOWNSTREAM:

1. LPF/HPF: the daemon routes call sp.set_mixer_lpf! / set_mixer_lpf_disable! / set_mixer_hpf! / set_mixer_hpf_disable! (spider-server.rb:572-603) - and these methods DO NOT EXIST anywhere in /usr/lib/sonic-pi/app/server/ruby/lib/sonicpi/ (grep across lib: no set_mixer_lpf/hpf definitions; only invert/stereo/mono exist at sound.rb:1236-1252). Every LPF/HPF toggle = NoMethodError inside the daemon = nothing happens. UPSTREAM BUG (Sonic Pi 5.0.0); the binding constraint (no Sonic Pi changes) forbids fixing it editor-side by definition - the fix is honest UI + upstream report.
2. Stereo/mono/invert: the daemon methods exist (sound.rb -> studio mixer_invert_stereo / mixer_stereo_mode / mixer_mono_mode -> node_ctl force_mono/invert_stereo to the mixer node). Whether the audio ACTUALLY changes is unverified live. There is ALSO no feedback: the /mixer/settings push (spider-server.rb:996) carries ONLY drive + output_volume - a toggle never updates the popover state, so the item text stays stale ('LPF off', 'stereo') even when audio changed.

## Fix direction
- VERIFY live (this machine has Sonic Pi): e2e-style capture - toggle each route with the daemon running, read ~/.sonic-pi/log/spider-server.log (or the daemon log) for NoMethodError traces + capture whether audio-relevant node_ctl fires (stereo/mono). Record per-route verdicts in this bean.
- LPF/HPF (if NoMethodError confirmed): UI states the truth - the LPF/HPF entries render '(unavailable in Sonic Pi 5.0.x)' disabled with a one-line reason + a textDocument/issue link; the item summary drops LPF/HPF display. No fake toggles.
- Stereo/mono/invert: optimistic local state (the window's requested state renders immediately) + reconcile on the next /mixer/settings push; add a /fake/ control in the fake daemon to push state so integration can prove the reconcile.
- Upstream: file the missing-methods bug upstream (or draft the report in the bean) - agent does not merge there.

## Acceptance criteria per route (each unit/behavior proven)
- [ ] Live-capture verdict recorded per route (works / NoMethodError / no-op)
- [ ] LPF/HPF entries honestly disabled IF unimplemented upstream (unit-proven labels + removal from popover state assertions)
- [ ] Stereo/mono/invert optimistic update + reconcile-on-push proven (unit + integration)
- [ ] No regression to volume/drive paths; npm test + run-unit + integration green; budgets hold; zero suppressions

## Full route sweep (user-ordered verification, this session)

Method induction: sp = SonicPi::Runtime + Lang::Core + Lang::Sound + Midi + DocSystem + Pattern (klass = Object.const_set name, Class.new(SonicPi::Runtime)).

HARD VERDICT per extension-sent route, spider-server.rb add_method -> sp.XXX -> def search across app/server/ruby/lib + bin:
- /mixer-lpf-enable|disable (spider-server.rb:593,603 -> sp.set_mixer_lpf!/set_mixer_lpf_disable!) and /mixer-hpf-enable|disable (:572,582) -> NO SUCH METHODS anywhere in the sonicpi lib (grep def set_mixer_lpf / set_mixer_hpf across /usr/lib/sonic-pi/app/server/ruby/: only the spider-server.rb call sites exist). Confirmed dead upstream routes - NoMethodError on every toggle. This is the LPF/HPF half of the user's report.
- /mixer-invert-stereo|standard-stereo (sp.set_mixer_invert_stereo!/standard -> sound.rb:1236/1240 -> studio mixer_invert_stereo -> server.node_ctl @mixer invert_stereo) : methods EXIST, chain reaches the scsynth mixer node. VERDICT: route intact; audio must be verified live (machine has Sonic Pi; the honest-UI fix still applies since /mixer/settings carries no stereo state).
- /mixer-stereo-mode|mono-mode (-> sound.rb:1244/1248 -> studio mixer_stereo_mode/mono -> node_ctl force_mono) : chain intact.
- /midi-port-enable /midi-reset /gamepad-enable /gamepad-stop: __midi_port_enable/__gamepad_device_enable etc all defined (runtime.rb) -> midi_api.rb/gamepad_api.rb OK.
- /exit -> __exit (runtime.rb:1445): __stop_jobs then scheduler-exit. OK.
- /stop-job, /stop-all-jobs, /save-buffer, /buffer-beautify, /run-code, /version: all resolve. OK.
- /cue-port-external|internal|start|stop: __cue_* methods resolve. OK.
- INCOMING pushes: every push the extension consumes fires in spider (live_loop/scope :1002-1004, midi/in+out :986-988, gamepad/devices-list :990, mixer/settings :996, link-bpm/:link-num-peers, run/started:ended:all-completed :1073-1082, spider/ready :1102, exited :974, flash, error, ack :462-471). All OK.

Net: the sweep confirms the LPF/HPF missing-method verdict END TO END and CLEARS all other routes. The bean's fix scope (honest disabled UI for lpf/hpf + optimistic stereo/mono state) stands unchanged.
