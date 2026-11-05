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
		this.disposed = false
	}
	show() {
		this.shown++
	}
	dispose() {
		this.disposed = true
	}
}

const item = new FakeStatusBarItem()
let inputBoxPrompt
let inputBoxResponse
let errorMessages = []

const vscodeStub = {
	EventEmitter,
	StatusBarAlignment: { Left: 1, Right: 2 },
	window: {
		createStatusBarItem: () => item,
		showInputBox: (options) => {
			inputBoxPrompt = options && options.prompt
			return Promise.resolve(inputBoxResponse)
		},
		showErrorMessage: (message) => {
			errorMessages.push(message)
			return Promise.resolve(undefined)
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

test('status bar starts hidden-stopped and re-renders on state change', () => {
	item.text = ''
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
	})
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
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => requests++,
		sendMasterVolume: () => {},
	})
	bar.setServerState('starting')
	assert.strictEqual(requests, 0)
	bar.setServerState('running')
	assert.strictEqual(requests, 1)
	bar.dispose()
})

test('version reply updates the label', () => {
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: () => {},
	})
	bar.setServerState('running')
	bar.setVersion('5.2.2')
	assert.strictEqual(item.text, '$(radio-tower) Sonic Pi 5.2.2')
	bar.dispose()
})

test('volume quick pick sends the mapped value', async () => {
	const sent = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: (value) => sent.push(value),
	})
	inputBoxResponse = '80%'
	await bar.showVolumeQuickPick()
	assert.deepStrictEqual(sent, [80])
	assert.strictEqual(inputBoxPrompt, 'Master volume (0-100)')
	bar.dispose()
})

test('volume quick pick ignores cancel and rejects non-numeric input', async () => {
	const sent = []
	const bar = new SonicPiStatusBar({
		sendVersionRequest: () => {},
		sendMasterVolume: (value) => sent.push(value),
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
