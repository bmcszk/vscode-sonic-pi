#!/usr/bin/env node
// Status bar: server-state machine (stopped/starting/running) + version text + tempo text
// and the single volume surface are pure; tested against a fake status-bar item and fake
// input, like playing-lines.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

class FakeStatusBarItem {
	constructor() {
		this.text = ''
		this.tooltip = ''
		this.command = ''
		this.shown = 0
		this.hidden = 0
		this.disposed = false
	}
	show() {
		this.shown++
	}
	hide() {
		this.hidden++
	}
	dispose() {
		this.disposed = true
	}
}

const item = new FakeStatusBarItem()
const deafItem = new FakeStatusBarItem()
const mixerItem = new FakeStatusBarItem()
const linkItem = new FakeStatusBarItem()
let createdItems = []
let inputBoxPrompt
let inputBoxResponses = []
let errorMessages = []
let lastInputBoxValue
let quickPickAction
let lastQuickPickItems

const vscodeStub = {
	EventEmitter,
	StatusBarAlignment: { Left: 1, Right: 2 },
	QuickPickItemKind: { Separator: -1, Default: 0 },
	window: {
		createStatusBarItem: (alignment, priority) => {
			createdItems.push({ alignment, priority })
			if (createdItems.length === 1) return item
			if (createdItems.length === 2) return deafItem
			if (createdItems.length === 3) return mixerItem
			return linkItem
		},
		showInputBox: (options) => {
			inputBoxPrompt = options && options.prompt
			lastInputBoxValue = options && options.value
			return Promise.resolve(inputBoxResponses.shift())
		},
		showErrorMessage: (message) => {
			errorMessages.push(message)
			return Promise.resolve(undefined)
		},
		showQuickPick: (items) => {
			lastQuickPickItems = items
			return Promise.resolve(items.find((candidate) => candidate.action === quickPickAction))
		},
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const {
	formatStatusLabel,
	deafnessLabel,
	parseVersionReply,
	SonicPiStatusBar,
} = require('../../out/statusbar.js')

const tests = []
const test = (name, fn) => tests.push([name, fn])

test('label shows stopped without version', () => {
	assert.strictEqual(formatStatusLabel('stopped'), '$(circle-slash) Sonic Pi: stopped')
})

test('label shows starting without version', () => {
	assert.strictEqual(formatStatusLabel('starting'), '$(sync~spin) Sonic Pi: starting')
})

test('label shows running without version', () => {
	assert.strictEqual(formatStatusLabel('running'), '$(radio-tower) Sonic Pi')
})

test('label shows running with version', () => {
	assert.strictEqual(formatStatusLabel('running', '5.2.2'), '$(radio-tower) Sonic Pi 5.2.2')
})

test('version reply takes the first string arg', () => {
	assert.strictEqual(parseVersionReply(['5.2.2', 22, '5.2', 22]), '5.2.2')
})

test('version reply rejects missing or non-string version', () => {
	assert.strictEqual(parseVersionReply([]), undefined)
	assert.strictEqual(parseVersionReply([42]), undefined)
})

const mixerBridge = {
	setDrive: () => {},
	setStereo: () => {},
	setInvert: () => {},
}

test('status bar starts hidden-stopped and re-renders on state change', () => {
	item.text = ''
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
		...mixerBridge,
	})
	// Main item shows server state
	assert.strictEqual(item.text, '$(circle-slash) Sonic Pi: stopped')
	bar.setServerState('starting')
	assert.strictEqual(item.text, '$(sync~spin) Sonic Pi: starting')
	bar.setServerState('running')
	assert.strictEqual(item.text, '$(radio-tower) Sonic Pi')
	assert.ok(item.shown > 0)
	assert.ok(!item.command, 'server state carries no action - volume has one home')
	bar.dispose()
	assert.ok(item.disposed)
})

test('reaching running requests the version once', () => {
	let requests = 0
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => requests++,
		sendMasterVolume: () => {},
		...mixerBridge,
	})
	bar.setServerState('starting')
	assert.strictEqual(requests, 0)
	bar.setServerState('running')
	assert.strictEqual(requests, 1)
	bar.dispose()
})

test('version reply updates the label', () => {
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
		...mixerBridge,
	})
	bar.setServerState('running')
	bar.setVersion('5.2.2')
	assert.strictEqual(
		item.text,
		'$(radio-tower) Sonic Pi 5.2.2',
		'the first status-bar item holds the label',
	)
	bar.dispose()
})

test('the mixer popover is the single volume surface and sends the mapped value', async () => {
	// given
	const sent = []
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: (value) => sent.push(value),
		...mixerBridge,
	})
	bar.setServerState('running')

	// when
	quickPickAction = 'volume'
	inputBoxResponses = ['80%']
	await bar.showMixerQuickPick()

	// then
	assert.deepStrictEqual(sent, [80])
	assert.strictEqual(inputBoxPrompt, 'Master volume (0-100)')
	assert.strictEqual(lastInputBoxValue, '100', 'the box opens at the volume this window last set')
	bar.dispose()
})

test('a volume set and a daemon push both move the single volume surface', async () => {
	// given
	const sent = []
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: (value) => sent.push(value),
		...mixerBridge,
	})
	bar.setServerState('running')

	// when the window sets 80 and the daemon answers with its own 0.8
	quickPickAction = 'volume'
	inputBoxResponses = ['80%']
	await bar.showMixerQuickPick()
	bar.setMixerSettings({ drive: 1.0, volume: 0.8 })

	// then
	assert.deepStrictEqual(sent, [80])
	assert.strictEqual(
		mixerItem.text,
		'$(tunnel-horizontal) vol 80% · drive 1.0 · stereo',
		'the mixer item text owns the one volume number',
	)
	assert.ok(createdItems.length === 4, 'four items exist and only the mixer item carries a volume command')
	bar.dispose()
})

test('the volume box reopens at the last volume this window set', async () => {
	// given
	const sent = []
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: (value) => sent.push(value),
		...mixerBridge,
	})
	bar.setServerState('running')

	// when 40 is set, then the box is opened again and cancelled
	quickPickAction = 'volume'
	inputBoxResponses = ['40']
	await bar.showMixerQuickPick()
	inputBoxResponses = [undefined]
	await bar.showMixerQuickPick()

	// then
	assert.strictEqual(lastInputBoxValue, '40', 'a half-typed volume is never replaced by a full one')
	assert.deepStrictEqual(sent, [40], 'cancelling sends nothing')
	bar.dispose()
})

test('the volume box rejects non-numeric input and keeps the last good volume', async () => {
	// given
	const sent = []
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: (value) => sent.push(value),
		...mixerBridge,
	})
	bar.setServerState('running')
	errorMessages = []

	// when
	quickPickAction = 'volume'
	inputBoxResponses = ['loud']
	await bar.showMixerQuickPick()

	// then
	assert.deepStrictEqual(sent, [])
	assert.deepStrictEqual(errorMessages, ['Volume must be a number from 0 to 100'])
	bar.dispose()
})

test('deafness item shows while running but not receiving, clears on receiving or state change', () => {
	createdItems = []
	deafItem.shown = 0
	mixerItem.shown = 0
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
		...mixerBridge,
	})
	assert.strictEqual(createdItems.length, 4, 'four status-bar items exist (main, deafness, mixer, link)')
	assert.strictEqual(deafnessLabel, '$(circle-slash) logs: elsewhere')
	bar.setServerState('running')
	assert.strictEqual(deafItem.shown, 0, 'a healthy window shows no deafness item')
	assert.strictEqual(mixerItem.shown, 1, 'mixer item shows when server is running')
	bar.setReceiving(false)
	assert.strictEqual(deafItem.shown, 1, 'deafness becomes visible outside the log channel')
	bar.setReceiving(true)
	bar.setReceiving(false)
	assert.strictEqual(deafItem.shown, 2)
	bar.setServerState('stopped')
	bar.setReceiving(false)
	assert.strictEqual(deafItem.shown, 2, 'no deafness item without a running server')
	assert.strictEqual(mixerItem.shown, 1, 'mixer item hides when server stops')
	bar.dispose()
	assert.ok(deafItem.disposed)
	assert.ok(mixerItem.disposed)
})

test('mixer popover toggles stereo and invert immediately and a settings push keeps them', async () => {
	// given
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
		...mixerBridge,
	})
	bar.setServerState('running')
	assert.strictEqual(
		mixerItem.text,
		'$(tunnel-horizontal) vol 100% · drive 1.0 · stereo',
		'the item starts from the daemon defaults',
	)

	// when
	quickPickAction = 'stereo'
	await bar.showMixerQuickPick()

	// then
	assert.strictEqual(
		mixerItem.text,
		'$(tunnel-horizontal) vol 100% · drive 1.0 · mono',
		'the requested stereo state renders without waiting for a push',
	)

	// when the daemon pushes only drive and volume
	bar.setMixerSettings({ drive: 1.5, volume: 0.6 })

	// then
	assert.strictEqual(
		mixerItem.text,
		'$(tunnel-horizontal) vol 60% · drive 1.5 · mono',
		'the push updates its own fields without resetting the local stereo toggle',
	)

	// when
	quickPickAction = 'invert'
	await bar.showMixerQuickPick()
	bar.setMixerSettings({ drive: 1.2, volume: 0.5 })

	// then
	assert.strictEqual(
		mixerItem.text,
		'$(tunnel-horizontal) vol 50% · drive 1.2 · mono · invert',
		'the invert toggle also survives later pushes',
	)
	assert.ok(
		lastQuickPickItems.some((item) => item.label.includes('unavailable in Sonic Pi 5.0.x')),
		'the popover keeps the upstream-missing filters visible and honest',
	)
	bar.dispose()
})

// The setLinkBpm command lives in the extension host; statusbar exposes the input flow it
// needs: the current bpm as the default value and the parsed send through the bridge.
test('no tempo push leaves the item hidden - a session without a reported tempo never shows 60', () => {
	// given
	createdItems = []
	linkItem.shown = 0
	linkItem.hidden = 0
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
		...mixerBridge,
	})

	// when a server runs and plays without the daemon reporting any tempo
	bar.setServerState('running')
	bar.setServerState('stopped')
	bar.setServerState('running')

	// then
	assert.strictEqual(createdItems.length, 4, 'four status-bar items exist (main, deaf, mixer, link)')
	assert.strictEqual(linkItem.shown, 0, 'the tempo item never appears without tempo data')
	assert.strictEqual(bar.getCurrentBpm(), undefined, 'and no bpm is invented for the prompt default')
	bar.dispose()
	assert.ok(linkItem.disposed)
})

test('a run tempo push shows the session tempo, and Link activity renders beside it', () => {
	// given
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
		...mixerBridge,
	})
	bar.setServerState('running')

	// when the daemon reports the tempo the run actually held
	bar.setLinkData({ sessionBpm: 120 })

	// then
	assert.strictEqual(linkItem.text, '$(watch) 120 bpm')
	assert.strictEqual(linkItem.command, 'vscode-sonic-pi.setLinkBpm')

	// when Link peers join the session
	bar.setLinkData({ peers: 3 })

	// then
	assert.strictEqual(linkItem.text, '$(watch) 120 bpm · ⇄3', 'peers merge with the session tempo')
	bar.dispose()
})

test('a link tempo push replaces the tempo label the run reported', () => {
	// given
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
		...mixerBridge,
	})

	// when a link tempo lands after a run tempo
	bar.setLinkData({ sessionBpm: 120 })
	bar.setLinkData({ bpm: 122.4 })

	// then
	assert.strictEqual(linkItem.text, '$(watch) 122.4 bpm')
	assert.strictEqual(bar.getCurrentBpm(), 122.4, 'the prompt default follows the shown tempo')
	bar.dispose()
})

test('a zero peer count shows beside the tempo instead of vanishing', () => {
	// given
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
		...mixerBridge,
	})

	// when
	bar.setLinkData({ sessionBpm: 120 })
	bar.setLinkData({ peers: 0 })

	// then
	assert.strictEqual(linkItem.text, '$(watch) 120 bpm · ⇄0')
	bar.dispose()
})

;(async () => {
	let failed = 0
	for (const [name, fn] of tests) {
		try {
			await fn()
			console.log('ok - ' + name)
		} catch (error) {
			failed++
			console.error('FAIL - ' + name + '\n  ' + error.message)
		}
	}
	if (failed) {
		console.error(failed + ' failing')
		process.exit(1)
	}
	console.log(tests.length + ' tests passed')
})()
