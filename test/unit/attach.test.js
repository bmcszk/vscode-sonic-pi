#!/usr/bin/env node
// /proc spider-server.rb cmdline parsing + running-server discovery. Exit code 0 = all pass.
const assert = require('assert')
const { parseSpiderCmdline, findRunningServer } = require('../../out/attach.js')

// Real cmdline captured from a live Sonic Pi 5.x daemon on this machine
// (ps aux | grep spider-server, /proc/322816/cmdline, NUL-separated):
// /usr/bin/ruby --disable=gems --enable-frozen-string-literal -E utf-8 --yjit
//   /usr/lib/sonic-pi/app/server/ruby/bin/spider-server.rb -u 38518 38519 38520 38520 4560 -402713833
const REAL_CMDLINE = [
	'/usr/bin/ruby',
	'--disable=gems',
	'--enable-frozen-string-literal',
	'-E',
	'utf-8',
	'--yjit',
	'/usr/lib/sonic-pi/app/server/ruby/bin/spider-server.rb',
	'-u',
	'38518',
	'38519',
	'38520',
	'38520',
	'4560',
	'-402713833',
].join('\0')

const tests = {
	'parses the real live-daemon cmdline shape'() {
		const ports = parseSpiderCmdline(REAL_CMDLINE)
		assert.strictEqual(ports.sendToServerPort, 38520, 'gui-send-to-server (args[2]) is where /run-code goes; args[0] is the daemon keepalive port')
		assert.strictEqual(ports.listenFromServerPort, 38519)
		assert.strictEqual(ports.daemonPort, 38518, 'keepalive must reach the daemon')
		assert.strictEqual(ports.oscCuesPort, 4560)
		assert.strictEqual(ports.token, -402713833)
	},

	'parses default-looking ports'() {
		const ports = parseSpiderCmdline(
			['ruby', '/opt/spi/spider-server.rb', '-u', '4557', '4558', '4556', '4556', '4560', '42'].join('\0'),
		)
		assert.strictEqual(ports.sendToServerPort, 4556)
		assert.strictEqual(ports.listenFromServerPort, 4558)
		assert.strictEqual(ports.daemonPort, 4557)
		assert.strictEqual(ports.token, 42)
	},

	'rejects a cmdline without spider-server.rb'() {
		assert.strictEqual(parseSpiderCmdline(['ruby', 'other.rb', '-u', '4557', '4558', '4556', '4556', '4560', '42'].join('\0')), undefined)
	},

	'rejects a spider cmdline missing the -u flag'() {
		assert.strictEqual(
			parseSpiderCmdline(
				['ruby', '/opt/spi/spider-server.rb', '-t', '4557', '4558', '4556', '4556', '4560', '42'].join('\0'),
			),
			undefined,
		)
	},

	'rejects wrong arg counts after -u (5 args, token missing)'() {
		assert.strictEqual(
			parseSpiderCmdline(['ruby', '/opt/spi/spider-server.rb', '-u', '4557', '4558', '4556', '4556', '4560'].join('\0')),
			undefined,
		)
		assert.strictEqual(
			parseSpiderCmdline(['ruby', '/opt/spi/spider-server.rb', '-u', '4557', '4558', '4556', '4556', '4560', '42', '99'].join('\0')),
			undefined,
		)
	},

	'rejects non-numeric ports'() {
		assert.strictEqual(
			parseSpiderCmdline(['ruby', '/opt/spi/spider-server.rb', '-u', 'abc', '4558', '4556', '4556', '4560', '42'].join('\0')),
			undefined,
		)
	},

	'rejects negative or zero ports'() {
		assert.strictEqual(
			parseSpiderCmdline(['ruby', '/opt/spi/spider-server.rb', '-u', '-1', '4558', '4556', '4556', '4560', '42'].join('\0')),
			undefined,
		)
		assert.strictEqual(
			parseSpiderCmdline(['ruby', '/opt/spi/spider-server.rb', '-u', '0', '4558', '4556', '4556', '4560', '42'].join('\0')),
			undefined,
		)
	},

	'rejects a non-numeric token'() {
		assert.strictEqual(
			parseSpiderCmdline(['ruby', '/opt/spi/spider-server.rb', '-u', '4557', '4558', '4556', '4556', '4560', 'x'].join('\0')),
			undefined,
		)
	},

	'rejects ports above 65535'() {
		assert.strictEqual(
			parseSpiderCmdline(['ruby', '/opt/spi/spider-server.rb', '-u', '70000', '4558', '4556', '4556', '4560', '42'].join('\0')),
			undefined,
		)
	},

	'attach decision succeeds when a synthetic live server exists in /proc'() {
		// A machine-independent version of the live-scan case: the same readdir/readFile
		// seam the real /proc scan uses, fed the real-cmdline fixture from the top of
		// this file joined in /proc cmdline (NUL-separated) form.
		const ports = findRunningServer(
			() => ['4242'],
			(path) => (path === '/proc/4242/cmdline' ? REAL_CMDLINE : ''),
		)
		assert.ok(ports, 'the synthetic live server should be discoverable')
		assert.ok(ports.sendToServerPort > 0 && ports.sendToServerPort <= 65535)
		assert.notStrictEqual(ports.token, 0)
	},

	'findRunningServer returns the first matching pid'() {
		const cmdlines = { '10': REAL_CMDLINE, '20': 'nope' }
		const found = findRunningServer(
			() => ['20', '10', '30'],
			(path) => cmdlines[path.split('/')[2]],
		)
		assert.strictEqual(found.sendToServerPort, 38520)
		assert.strictEqual(found.daemonPort, 38518)
		assert.strictEqual(found.token, -402713833)
	},

	'findRunningServer skips unreadable cmdlines and returns undefined when none match'() {
		const found = findRunningServer(
			() => ['1', '2'],
			(path) => {
				if (path === '/proc/1/cmdline') throw new Error('EACCES')
				return 'garbage'
			},
		)
		assert.strictEqual(found, undefined)
	},

	'findRunningServer tolerates an empty or failing /proc listing'() {
		assert.strictEqual(findRunningServer(() => [], () => ''), undefined)
		assert.strictEqual(
			findRunningServer(
				() => {
					throw new Error('no /proc')
				},
				() => '',
			),
			undefined,
		)
	},
}

let failed = 0
for (const [name, fn] of Object.entries(tests)) {
	try {
		fn()
		console.log(`ok - ${name}`)
	} catch (error) {
		failed++
		console.error(`FAIL - ${name}: ${error.message}`)
	}
}
if (failed) {
	console.error(`${failed} test(s) failed`)
	process.exit(1)
}
console.log('all attach tests passed')
