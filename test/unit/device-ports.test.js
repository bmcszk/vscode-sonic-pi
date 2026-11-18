#!/usr/bin/env node
// MIDI and gamepad device lists: the daemon pushes one string of 'enabled<TAB>name'
// lines (runtime.rb:1949-1951, one encoder for midi and gamepad), so one parser and
// one QuickPick item builder serve both commands.
const assert = require('assert')
const Module = require('module')

const vscodeStub = {
	QuickPickItemKind: { Separator: -1, Default: 0 },
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const { parseDevicePairs, buildPortQuickPickItems, buildGamepadQuickPickItems } = require(
	'../../out/device-ports.js',
)

const SEPARATOR = vscodeStub.QuickPickItemKind.Separator
const picks = (items) => items.filter((item) => item.kind !== SEPARATOR)
const labels = (items) => items.map((item) => item.label)

const tests = {
	'the daemon wire form round-trips into name and enabled state'() {
		// given a push with one disabled line and two enabled lines
		const pushed = 'false\tLaunchkey Mini\r\ntrue\tIAC Driver Bus 1\ntrue\tArturia KeyStep 32'
		// when
		const pairs = parseDevicePairs(pushed)
		// then order and state survive, and the trailing CR is not part of the name
		assert.deepStrictEqual(pairs, [
			{ name: 'Launchkey Mini', enabled: false },
			{ name: 'IAC Driver Bus 1', enabled: true },
			{ name: 'Arturia KeyStep 32', enabled: true },
		])
	},

	'an empty push means no devices'() {
		assert.deepStrictEqual(parseDevicePairs(''), [])
		assert.deepStrictEqual(parseDevicePairs('\n'), [])
	},

	'a line without the enabled tab keeps the name and reads as off'() {
		assert.deepStrictEqual(parseDevicePairs('Dock Audio'), [{ name: 'Dock Audio', enabled: false }])
	},

	'a name holding a tab keeps everything after the first tab'() {
		assert.deepStrictEqual(parseDevicePairs('true\tWeird\tPad'), [{ name: 'Weird\tPad', enabled: true }])
	},

	'port items place Inputs first, then Outputs, with the picker pointing at real ports'() {
		// given
		const inPorts = [{ name: 'Launchkey Mini', enabled: true }]
		const outPorts = [
			{ name: 'IAC Driver Bus 1', enabled: false },
			{ name: 'Arturia KeyStep 32', enabled: true },
		]
		// when
		const items = buildPortQuickPickItems(inPorts, outPorts)
		// then a leading Inputs separator, the Inputs separator-less tail, then Outputs
		assert.deepStrictEqual(
			items.filter((item) => item.kind === SEPARATOR).map((item) => item.label),
			['Inputs', 'Outputs'],
		)
		assert.deepStrictEqual(
			picks(items).map((item) => [item.label, item.description, item.port, item.enabled]),
			[
				['$(check) Launchkey Mini', 'Input', 'in', true],
				['$(circle-outline) IAC Driver Bus 1', 'Output', 'out', false],
				['$(check) Arturia KeyStep 32', 'Output', 'out', true],
			],
		)
	},

	'a direction with no devices contributes no section'() {
		const items = buildPortQuickPickItems([], [{ name: 'IAC Driver Bus 1', enabled: true }])
		assert.deepStrictEqual(
			items.filter((item) => item.kind === SEPARATOR).map((item) => item.label),
			['Outputs'],
		)
		assert.deepStrictEqual(
			picks(items).map((item) => item.label),
			['$(check) IAC Driver Bus 1'],
		)
	},

	'gamepads use the same item shape with pad indices instead of ports'() {
		// given
		const pads = [
			{ name: 'Wireless Controller', enabled: true },
			{ name: 'Xbox 360 Controller', enabled: false },
		]
		// when
		const items = buildGamepadQuickPickItems(pads)
		// then the section separator leads, ✗/✓ shows state in the label, and each item
		// keeps the list index the daemon addresses pads by (/gamepad-enable takes the
		// index, spider-server.rb:756)
		assert.deepStrictEqual(
			items.filter((item) => item.kind === SEPARATOR).map((item) => item.label),
			['Gamepads'],
		)
		assert.deepStrictEqual(picks(items), [
			{ label: '$(check) Wireless Controller', description: 'Gamepad', pad: 0, enabled: true },
			{ label: '$(circle-outline) Xbox 360 Controller', description: 'Gamepad', pad: 1, enabled: false },
		])
	},

	'no devices at all yields no items, so the caller can report an empty list'() {
		assert.deepStrictEqual(buildPortQuickPickItems([], []), [])
		assert.deepStrictEqual(buildGamepadQuickPickItems([]), [])
	},
}

let failures = 0
const names = Object.keys(tests)

async function run() {
	for (const name of names) {
		try {
			await tests[name]()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.message}`)
		}
	}
	console.log(failures === 0 ? 'all device ports tests passed' : `${failures} of ${names.length} tests failed`)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
