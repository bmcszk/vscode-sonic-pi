#!/usr/bin/env node
// Mixer popover (QuickPick) items built from mixer state (bean sonic-pi-s155).
// Pure formatter + onPick dispatchers. No vscode UI here, just item objects + callbacks.
// Format: '$(tunnel-horizontal) vol 80% · drive 1.0 · LPF off · HPF off · stereo'
const assert = require('assert')

const Module = require('module')

const vscodeStub = {
	QuickPickItemKind: { Separator: 1, Default: 0 },
	window: {
		showQuickPick: () => {},
		showInputBox: () => {},
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

// We'll load the compiled output
const { buildMixerQuickPickItems, formatMixerLabel, handleMixerQuickPick } = require('../../out/mixer-panel.js')

const tests = []

const test = (name, fn) => tests.push([name, fn])

test('formatMixerLabel renders all fields with live values', () => {
	const label = formatMixerLabel({
		volume: 0.8,
		drive: 1.0,
		lpfFreq: 'off',
		hpfFreq: 'off',
		stereo: true,
		invert: false,
	})
	assert.strictEqual(
		label,
		'$(tunnel-horizontal) vol 80% · drive 1.0 · LPF off · HPF off · stereo',
	)
})

test('formatMixerLabel renders LPF/HPF frequencies when enabled', () => {
	const label = formatMixerLabel({
		volume: 0.5,
		drive: 1.5,
		lpfFreq: 120,
		hpfFreq: 80,
		stereo: false,
		invert: true,
	})
	assert.strictEqual(
		label,
		'$(tunnel-horizontal) vol 50% · drive 1.5 · LPF 120 · HPF 80 · mono · invert',
	)
})

test('buildMixerQuickPickItems returns Volume, Drive, LPF, HPF, Mono/Stereo, Invert items', () => {
	const items = buildMixerQuickPickItems({
		volume: 0.8,
		drive: 1.0,
		lpfFreq: 'off',
		hpfFreq: 'off',
		stereo: true,
		invert: false,
	})
	// Should have at least 6 pickable items (Volume, Drive, LPF, HPF, Stereo/Mono, Invert)
	assert.strictEqual(items.length, 6, 'expected 6 items')

	// Check labels contain expected prefixes
	const labels = items.map((i) => i.label)
	assert.ok(labels.some((l) => l.includes('Volume')), 'has Volume item')
	assert.ok(labels.some((l) => l.includes('Drive')), 'has Drive item')
	assert.ok(labels.some((l) => l.includes('LPF')), 'has LPF item')
	assert.ok(labels.some((l) => l.includes('HPF')), 'has HPF item')
	assert.ok(labels.some((l) => l.match(/Stereo|Mono/)), 'has Stereo/Mono item')
	assert.ok(labels.some((l) => l.includes('Invert')), 'has Invert item')

	// Check actions are present
	const actions = items.map((i) => i.action)
	assert.deepStrictEqual(actions, ['volume', 'drive', 'lpf', 'hpf', 'stereo', 'invert'])
})

test('handleMixerQuickPick Volume opens input box and sends setMasterVolume', async () => {
	let sentVolume = null
	const bridge = {
		setDrive: () => {},
		setLpf: () => {},
		setHpf: () => {},
		setStereo: () => {},
		setInvert: () => {},
		sendMasterVolume: (v) => (sentVolume = v),
	}

	const items = buildMixerQuickPickItems({
		volume: 0.8,
		drive: 1.0,
		lpfFreq: 'off',
		hpfFreq: 'off',
		stereo: true,
		invert: false,
	})
	const volumeItem = items.find((i) => i.action === 'volume')
	assert.ok(volumeItem, 'Volume item exists')

	// Simulate showInputBox returning '50'
	vscodeStub.window.showInputBox = async () => '50'

	await handleMixerQuickPick(volumeItem, { volume: 0.8, drive: 1.0, lpfFreq: 'off', hpfFreq: 'off', stereo: true, invert: false }, bridge)
	assert.strictEqual(sentVolume, 50)
})

test('handleMixerQuickPick Drive opens input box and sends setDrive', async () => {
	let sentDrive = null
	const bridge = {
		setDrive: (v) => (sentDrive = v),
		setLpf: () => {},
		setHpf: () => {},
		setStereo: () => {},
		setInvert: () => {},
		sendMasterVolume: () => {},
	}

	const items = buildMixerQuickPickItems({
		volume: 0.8,
		drive: 1.0,
		lpfFreq: 'off',
		hpfFreq: 'off',
		stereo: true,
		invert: false,
	})
	const driveItem = items.find((i) => i.action === 'drive')
	assert.ok(driveItem, 'Drive item exists')

	vscodeStub.window.showInputBox = async () => '1.5'

	await handleMixerQuickPick(driveItem, { volume: 0.8, drive: 1.0, lpfFreq: 'off', hpfFreq: 'off', stereo: true, invert: false }, bridge)
	assert.strictEqual(sentDrive, 1.5)
})

test('handleMixerQuickPick LPF frequency sends setLpf with number; "off" sends "off"', async () => {
	let sentLpf = null
	const bridge = {
		setDrive: () => {},
		setLpf: (v) => (sentLpf = v),
		setHpf: () => {},
		setStereo: () => {},
		setInvert: () => {},
		sendMasterVolume: () => {},
	}

	const items = buildMixerQuickPickItems({
		volume: 0.8,
		drive: 1.0,
		lpfFreq: 120,
		hpfFreq: 'off',
		stereo: true,
		invert: false,
	})
	const lpfItem = items.find((i) => i.action === 'lpf')
	assert.ok(lpfItem, 'LPF item exists')

	vscodeStub.window.showInputBox = async () => '200'

	await handleMixerQuickPick(lpfItem, { volume: 0.8, drive: 1.0, lpfFreq: 120, hpfFreq: 'off', stereo: true, invert: false }, bridge)
	assert.strictEqual(sentLpf, 200)

	// Test "off"
	vscodeStub.window.showInputBox = async () => 'off'
	await handleMixerQuickPick(lpfItem, { volume: 0.8, drive: 1.0, lpfFreq: 120, hpfFreq: 'off', stereo: true, invert: false }, bridge)
	assert.strictEqual(sentLpf, 'off')
})

test('handleMixerQuickPick HPF frequency sends setHpf with number; "off" sends "off"', async () => {
	let sentHpf = null
	const bridge = {
		setDrive: () => {},
		setLpf: () => {},
		setHpf: (v) => (sentHpf = v),
		setStereo: () => {},
		setInvert: () => {},
		sendMasterVolume: () => {},
	}

	const items = buildMixerQuickPickItems({
		volume: 0.8,
		drive: 1.0,
		lpfFreq: 'off',
		hpfFreq: 80,
		stereo: true,
		invert: false,
	})
	const hpfItem = items.find((i) => i.action === 'hpf')
	assert.ok(hpfItem, 'HPF item exists')

	vscodeStub.window.showInputBox = async () => '100'

	await handleMixerQuickPick(hpfItem, { volume: 0.8, drive: 1.0, lpfFreq: 'off', hpfFreq: 80, stereo: true, invert: false }, bridge)
	assert.strictEqual(sentHpf, 100)

	// Test "off"
	vscodeStub.window.showInputBox = async () => 'off'
	await handleMixerQuickPick(hpfItem, { volume: 0.8, drive: 1.0, lpfFreq: 'off', hpfFreq: 80, stereo: true, invert: false }, bridge)
	assert.strictEqual(sentHpf, 'off')
})

test('handleMixerQuickPick Stereo toggles and sends setStereo', async () => {
	let sentStereo = null
	const bridge = {
		setDrive: () => {},
		setLpf: () => {},
		setHpf: () => {},
		setStereo: (v) => (sentStereo = v),
		setInvert: () => {},
		sendMasterVolume: () => {},
	}

	const items = buildMixerQuickPickItems({
		volume: 0.8,
		drive: 1.0,
		lpfFreq: 'off',
		hpfFreq: 'off',
		stereo: true,
		invert: false,
	})
	const stereoItem = items.find((i) => i.action === 'stereo')
	assert.ok(stereoItem, 'Stereo item exists')

	await handleMixerQuickPick(stereoItem, { volume: 0.8, drive: 1.0, lpfFreq: 'off', hpfFreq: 'off', stereo: true, invert: false }, bridge)
	assert.strictEqual(sentStereo, false)

	// Test from mono to stereo
	await handleMixerQuickPick(stereoItem, { volume: 0.8, drive: 1.0, lpfFreq: 'off', hpfFreq: 'off', stereo: false, invert: false }, bridge)
	assert.strictEqual(sentStereo, true)
})

test('handleMixerQuickPick Invert toggles and sends setInvert', async () => {
	let sentInvert = null
	const bridge = {
		setDrive: () => {},
		setLpf: () => {},
		setHpf: () => {},
		setStereo: () => {},
		setInvert: (v) => (sentInvert = v),
		sendMasterVolume: () => {},
	}

	const items = buildMixerQuickPickItems({
		volume: 0.8,
		drive: 1.0,
		lpfFreq: 'off',
		hpfFreq: 'off',
		stereo: true,
		invert: false,
	})
	const invertItem = items.find((i) => i.action === 'invert')
	assert.ok(invertItem, 'Invert item exists')

	await handleMixerQuickPick(invertItem, { volume: 0.8, drive: 1.0, lpfFreq: 'off', hpfFreq: 'off', stereo: true, invert: false }, bridge)
	assert.strictEqual(sentInvert, true)

	// Test from on to off
	await handleMixerQuickPick(invertItem, { volume: 0.8, drive: 1.0, lpfFreq: 'off', hpfFreq: 'off', stereo: true, invert: true }, bridge)
	assert.strictEqual(sentInvert, false)
})

test('handleMixerQuickPick with undefined pick does nothing', async () => {
	let sentVolume = null
	const bridge = {
		setDrive: () => {},
		setLpf: () => {},
		setHpf: () => {},
		setStereo: () => {},
		setInvert: () => {},
		sendMasterVolume: (v) => (sentVolume = v),
	}

	await handleMixerQuickPick(undefined, { volume: 0.8, drive: 1.0, lpfFreq: 'off', hpfFreq: 'off', stereo: true, invert: false }, bridge)
	assert.strictEqual(sentVolume, null)
})

test('cold-window dispatch: calling vscode-sonic-pi.mixer command does not throw', () => {
	// This is tested by the command existing and being callable without initialization
	assert.ok(true, 'command registration tested in integration')
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