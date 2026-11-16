---
# sonic-pi-wcgd
title: 'Mixer popover from the statusbar: volume, drive, LPF/HPF, mono/invert - live from /mixer/settings (F3)'
status: draft
type: feature
created_at: 2026-11-16T13:30:04Z
updated_at: 2026-11-16T13:30:04Z
parent: sonic-pi-818h
---

# Feature (F3): Mixer popover from the statusbar

User outcome: volume, drive, LPF/HPF with frequency, mono/invert/stereo - initialized from the daemon's live /mixer/settings push.

## OSC surface (verified spider-server.rb)
/mixer-drive(token, amp, silent=1) [610-619]; /mixer-output-volume(token, vol 0..1, silent=1) [620-633]; /mixer-lpf-enable(token, freq) [589-598]; /mixer-lpf-disable [600-608]; /mixer-hpf-enable [568-577]; /mixer-hpf-disable [579-587]; /mixer-invert-stereo [528]; /mixer-standard-stereo [538]; /mixer-mono-mode [558]; /mixer-stereo-mode [548]. Live state push /mixer/settings(drive float, output_volume float) [995-996] (studio.rb:382-385 pushes on every change, whoever changed it).

## Structure
- task: Mixer senders + /mixer/settings state in the runner
- task: Mixer popover UI (QuickPick) on the statusbar
- task: Integration - popover round-trips against the fake daemon
