#!/usr/bin/env node
// Mixer popover (QuickPick) items built from mixer state (beans sonic-pi-s155, sonic-pi-5jo6,
// sonic-pi-kvbl: this popover is the statusbar's only volume surface).
// Pure formatter + pick dispatch. No vscode UI here, just item objects + callbacks.
// Sonic Pi 5.0.0's daemon has no set_mixer_lpf!/set_mixer_hpf!, so LPF/HPF entries are
// non-selectable separators that name the upstream gap instead of dispatching a dead route.
// Label format: '$(tunnel-horizontal) vol 80% · drive 1.0 · stereo'
const assert = require('assert')

const Module = require('module')

const vscodeStub = {
	QuickPickItemKind: { Separator: -1, Default: 0 },
	window: {
		showQuickPick: () => {},
		showInputBox: (options) => {
			volumePrompt = options
			return Promise.resolve(undefined)
		},
	},
	EventEmitter: class {
		constructor() {
			this.handlers = []
		}
		event(listener) {
			this.handlers.push(listener)
			return { dispose() {} }
		}
		fire(value) {
			this.handlers.forEach((h) => h(value))
		}
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const {
	buildMixerQuickPickItems,
	formatMixerLabel,
	handleMixerQuickPick,
} = require('../../out/mixer-panel.js')

let volumePrompt

// The suite answers the box per test but always records the options it was opened with.
const answerInputBox = (answer) => async (options) => {
	volumePrompt = options
	return answer
}

const mixerState = (overrides = {}) => ({
	volume: 0.8,
	drive: 1.0,
	stereo: true,
	invert: false,
	...overrides,
})

const mixerBridge = (spies = {}) => ({
	setDrive: () => {},
	setStereo: () => {},
	setInvert: () => {},
	sendMasterVolume: () => {},
	...spies,
})

const tests = []

const test = (name, fn) => tests.push([name, fn])

test('formatMixerLabel renders volume, drive and stereo with live values', () => {
	// given
	const state = mixerState()

	// when
	const label = formatMixerLabel(state)

	// then
	assert.strictEqual(label, '$(tunnel-horizontal) vol 80% · drive 1.0 · stereo')
})

test('formatMixerLabel names mono and invert', () => {
	// given
	const state = mixerState({ volume: 0.5, drive: 1.5, stereo: false, invert: true })

	// when
	const label = formatMixerLabel(state)

	// then
	assert.strictEqual(label, '$(tunnel-horizontal) vol 50% · drive 1.5 · mono · invert')
})

test('buildMixerQuickPickItems lists volume, drive, unavailable LPF/HPF, stereo and invert', () => {
	// given
	const state = mixerState()

	// when
	const items = buildMixerQuickPickItems(state)

	// then
	const labels = items.map((item) => item.label)
	assert.strictEqual(items.length, 6, 'expected six popover entries')
	assert.ok(
		labels.some((label) => label.includes('Volume')),
		'has Volume entry',
	)
	assert.ok(
		labels.some((label) => label.includes('Drive')),
		'has Drive entry',
	)
	assert.ok(
		labels.some((label) => label.includes('LPF')),
		'has LPF entry',
	)
	assert.ok(
		labels.some((label) => label.includes('HPF')),
		'has HPF entry',
	)
	assert.ok(
		labels.some((label) => label.match(/Stereo|Mono/)),
		'has Stereo/Mono entry',
	)
	assert.ok(
		labels.some((label) => label.includes('Invert')),
		'has Invert entry',
	)
	assert.deepStrictEqual(
		items.map((item) => item.action).filter(Boolean),
		['volume', 'drive', 'stereo', 'invert'],
		'only the implemented routes carry an action',
	)
})

test('buildMixerQuickPickItems renders LPF/HPF as non-selectable entries naming the upstream gap', () => {
	// given
	const state = mixerState()

	// when
	const items = buildMixerQuickPickItems(state)

	// then
	const unavailable = items.filter((item) => item.label.includes('(unavailable in Sonic Pi 5.0.x)'))
	assert.strictEqual(unavailable.length, 2, 'both filters state they are unavailable')
	for (const item of unavailable) {
		assert.strictEqual(item.kind, vscodeStub.QuickPickItemKind.Separator, 'disabled styling')
		assert.strictEqual(item.action, undefined, 'an unavailable entry is not an action')
	}
	assert.ok(
		unavailable.some((item) => item.label.includes('set_mixer_lpf! missing')),
		'LPF names the missing daemon method',
	)
	assert.ok(
		unavailable.some((item) => item.label.includes('set_mixer_hpf! missing')),
		'HPF names the missing daemon method',
	)
})

test('handleMixerQuickPick Volume opens input box and sends setMasterVolume', async () => {
	// given
	let sentVolume = null
	let setPercent = null
	const state = mixerState()
	const volumeItem = buildMixerQuickPickItems(state).find((item) => item.action === 'volume')
	vscodeStub.window.showInputBox = answerInputBox('50')

	// when
	const next = await handleMixerQuickPick(
		volumeItem,
		state,
		mixerBridge({ sendMasterVolume: (v) => (sentVolume = v) }),
		{ lastSetPercent: 35, onVolumeSet: (v) => (setPercent = v) },
	)

	// then
	assert.strictEqual(sentVolume, 50)
	assert.strictEqual(
		volumePrompt.value,
		'35',
		'the box opens at the volume this window last set, not the pushed one',
	)
	assert.strictEqual(setPercent, 50, 'the set volume becomes the next prompt default')
	assert.deepStrictEqual(next, state, 'volume waits for the daemon push')
})

test('handleMixerQuickPick Volume leaves the prompt value to the caller that owns last set volume', async () => {
	// given
	const state = mixerState({ volume: 0.8 })
	const volumeItem = buildMixerQuickPickItems(state).find((item) => item.action === 'volume')
	vscodeStub.window.showInputBox = answerInputBox(undefined)

	// when
	await handleMixerQuickPick(volumeItem, state, mixerBridge())

	// then
	assert.strictEqual(
		volumePrompt.value,
		'80',
		'the daemon push is the fallback when this window has not set a volume yet',
	)
})

test('handleMixerQuickPick Drive opens input box and sends setDrive', async () => {
	// given
	let sentDrive = null
	const state = mixerState()
	const driveItem = buildMixerQuickPickItems(state).find((item) => item.action === 'drive')
	vscodeStub.window.showInputBox = answerInputBox('1.5')

	// when
	const next = await handleMixerQuickPick(
		driveItem,
		state,
		mixerBridge({ setDrive: (v) => (sentDrive = v) }),
	)

	// then
	assert.strictEqual(sentDrive, 1.5)
	assert.deepStrictEqual(next, state, 'drive waits for the daemon push')
})

test('handleMixerQuickPick on an unavailable LPF/HPF entry sends nothing', async () => {
	// given
	const state = mixerState()
	const calls = []
	const bridge = mixerBridge({
		setLpf: (v) => calls.push(['setLpf', v]),
		setHpf: (v) => calls.push(['setHpf', v]),
		setDrive: (v) => calls.push(['setDrive', v]),
		setStereo: (v) => calls.push(['setStereo', v]),
		setInvert: (v) => calls.push(['setInvert', v]),
		sendMasterVolume: (v) => calls.push(['sendMasterVolume', v]),
	})
	const unavailable = buildMixerQuickPickItems(state).filter((item) =>
		item.label.includes('(unavailable in Sonic Pi 5.0.x)'),
	)

	// when
	const results = []
	for (const item of unavailable) results.push(await handleMixerQuickPick(item, state, bridge))

	// then
	assert.deepStrictEqual(calls, [], 'no OSC route is sent for an unimplemented filter')
	for (const next of results) assert.deepStrictEqual(next, state, 'the popover state does not move')
})

test('handleMixerQuickPick Stereo toggles the returned state and sends setStereo', async () => {
	// given
	let sentStereo = null
	const state = mixerState()
	const stereoItem = buildMixerQuickPickItems(state).find((item) => item.action === 'stereo')

	// when
	const next = await handleMixerQuickPick(
		stereoItem,
		state,
		mixerBridge({ setStereo: (v) => (sentStereo = v) }),
	)

	// then
	assert.strictEqual(sentStereo, false)
	assert.deepStrictEqual(next, mixerState({ stereo: false }), 'the requested state flips immediately')
})

test('handleMixerQuickPick Stereo flips back to stereo from mono', async () => {
	// given
	let sentStereo = null
	const state = mixerState({ stereo: false })
	const stereoItem = buildMixerQuickPickItems(state).find((item) => item.action === 'stereo')

	// when
	const next = await handleMixerQuickPick(
		stereoItem,
		state,
		mixerBridge({ setStereo: (v) => (sentStereo = v) }),
	)

	// then
	assert.strictEqual(sentStereo, true)
	assert.deepStrictEqual(next, mixerState({ stereo: true }))
})

test('handleMixerQuickPick Invert toggles the returned state and sends setInvert', async () => {
	// given
	let sentInvert = null
	const state = mixerState()
	const invertItem = buildMixerQuickPickItems(state).find((item) => item.action === 'invert')

	// when
	const next = await handleMixerQuickPick(
		invertItem,
		state,
		mixerBridge({ setInvert: (v) => (sentInvert = v) }),
	)

	// then
	assert.strictEqual(sentInvert, true)
	assert.deepStrictEqual(next, mixerState({ invert: true }))
})

test('handleMixerQuickPick Invert flips back off', async () => {
	// given
	let sentInvert = null
	const state = mixerState({ invert: true })
	const invertItem = buildMixerQuickPickItems(state).find((item) => item.action === 'invert')

	// when
	const next = await handleMixerQuickPick(
		invertItem,
		state,
		mixerBridge({ setInvert: (v) => (sentInvert = v) }),
	)

	// then
	assert.strictEqual(sentInvert, false)
	assert.deepStrictEqual(next, mixerState({ invert: false }))
})

test('handleMixerQuickPick with undefined pick does nothing', async () => {
	// given
	const state = mixerState()
	const calls = []
	const bridge = mixerBridge({ sendMasterVolume: (v) => calls.push(v) })

	// when
	const next = await handleMixerQuickPick(undefined, state, bridge)

	// then
	assert.deepStrictEqual(calls, [])
	assert.deepStrictEqual(next, state)
})

;(async () => {
	let failed = 0
	for (const [name, run] of tests) {
		try {
			await run()
			console.log('ok -', name)
		} catch (error) {
			failed++
			console.error('FAIL -', name, '\n ', error.message)
		}
	}
	process.exit(failed ? 1 : 0)
})()
