#!/usr/bin/env node
// Status bar: server-state machine (stopped/starting/running) + version text + volume
// input mapping are pure; tested against a fake status-bar item and fake input, like playing-lines.
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
let inputBoxResponse
let errorMessages = []
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
			return Promise.resolve(inputBoxResponse)
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
	parseVolumeInput,
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

test('volume input parses plain numbers and clamps to 0-100', () => {
	assert.strictEqual(parseVolumeInput('42'), 42)
	assert.strictEqual(parseVolumeInput(' 73% '), 73)
	assert.strictEqual(parseVolumeInput('-5'), 0)
	assert.strictEqual(parseVolumeInput('150'), 100)
})

test('volume input rejects non-numeric text', () => {
	assert.strictEqual(parseVolumeInput('loud'), undefined)
	assert.strictEqual(parseVolumeInput(''), undefined)
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
	assert.strictEqual(item.command, 'vscode-sonic-pi.masterVolume')
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
	assert.strictEqual(item.text, '$(radio-tower) Sonic Pi 5.2.2', 'the first status-bar item holds the label')
	bar.dispose()
})

test('volume quick pick sends the mapped value', async () => {
	const sent = []
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: (value) => sent.push(value),
		...mixerBridge,
	})
	inputBoxResponse = '80%'
	await bar.showVolumeQuickPick()
	assert.deepStrictEqual(sent, [80])
	assert.strictEqual(inputBoxPrompt, 'Master volume (0-100)')
	bar.dispose()
})

test('volume quick pick ignores cancel and rejects non-numeric input', async () => {
	const sent = []
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: (value) => sent.push(value),
		...mixerBridge,
	})
	inputBoxResponse = undefined
	await bar.showVolumeQuickPick()
	assert.deepStrictEqual(sent, [])
	inputBoxResponse = 'loud'
	await bar.showVolumeQuickPick()
	assert.deepStrictEqual(sent, [])
	assert.strictEqual(errorMessages.length, 1)
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

let linkInputOptions
let linkInputResponse

const linkBridge = {
	...mixerBridge,
	sendLinkBpm: (_bpm) => {},
}

// The setLinkBpm command lives in the extension host; statusbar exposes the input flow it
// needs: the current bpm as the default value and the parsed send through the bridge.
test('link item stays hidden until the first push, then shows and live-updates', () => {
	createdItems = []
	linkItem.shown = 0
	linkItem.hidden = 0
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
		...mixerBridge,
	})
	assert.strictEqual(createdItems.length, 4, 'four status-bar items exist (main, deaf, mixer, link)')
	assert.strictEqual(linkItem.shown, 0, 'link item hidden until the first push')
	bar.setLinkData({ bpm: 122.4 })
	assert.strictEqual(linkItem.text, '♪ 122.4')
	assert.strictEqual(linkItem.shown, 1)
	assert.strictEqual(linkItem.command, 'vscode-sonic-pi.setLinkBpm')
	bar.setLinkData({ peers: 3 })
	assert.strictEqual(linkItem.text, '♪ 122.4 · ⇄3', 'peers push merges with last bpm')
	assert.strictEqual(linkItem.shown, 2, 'each push live-updates')
	bar.dispose()
	assert.ok(linkItem.disposed)
})

test('link data remembers the current bpm for the input default', () => {
	createdItems = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
		...mixerBridge,
	})
	assert.strictEqual(bar.getCurrentBpm(), undefined)
	bar.setLinkData({ bpm: 122.4 })
	assert.strictEqual(bar.getCurrentBpm(), 122.4)
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