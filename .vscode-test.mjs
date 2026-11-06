// Integration layer (see docs/research/testing-strategy.md): real Extension Development Hosts
// with the Sonic Pi backend replaced by test/integration/fake-sonic-pi.js, injected through the
// extension's settings seam. `npm run test:integration` drives this file.
//
// One host run per daemon-ownership scenario, because ownership is per-process state that
// cannot be rewound inside a single window:
//  * 'extension' runs the feature suites in order; the last suite closes every editor and
//    therefore shuts the server down.
//  * 'attach' starts a window that adopts a user-run app: once that window owns the reply port
//    the takeover route is unreachable, hence its own run.
//  * 'takeover' starts a window blocked from the reply port, the only state in which a play
//    takes the daemon over. Attach and takeover both need /proc free of a real
//    spider-server.rb, so each skips itself on a machine where Sonic Pi is running.
import { defineConfig } from '@vscode/test-cli'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createEnvironment } = require('./test/integration/harness/environment.js')

const launchArgs = ['--disable-extensions', '--disable-gpu', '--no-sandbox', '--skip-welcome', '--skip-release-notes']
const mocha = { timeout: 120000, require: ['./test/integration/harness/lifecycle.js'] }
const version = process.env.VSCODE_TEST_VERSION || '1.144.1'
const localInstall = process.env.VSCODE_TEST_EXECUTABLE
const installation = localInstall ? { useInstallation: { fromPath: localInstall } } : {}

const extensionEnvironment = createEnvironment('extension')
const attachEnvironment = createEnvironment('attach')
const takeoverEnvironment = createEnvironment('takeover')

export default defineConfig([
	{
		label: 'extension',
		// Order matters: the activation suite needs the window cold (it never calls
		// activateExtension) and restores the window state the feature suites expect, so it
		// must stay first.
		files: [
			'test/integration/suite/activation.integration.js',
			'test/integration/suite/server-lifecycle.integration.js',
			'test/integration/suite/editor-controls.integration.js',
			'test/integration/suite/notebook-run.integration.js',
			'test/integration/suite/media-docs.integration.js',
			'test/integration/suite/server-shutdown.integration.js',
		],
		version,
		workspaceFolder: extensionEnvironment.workspace,
		env: extensionEnvironment.env,
		mocha,
		launchArgs,
		...installation,
	},
	{
		label: 'attach',
		files: ['test/integration/suite/attach.integration.js'],
		version,
		workspaceFolder: attachEnvironment.workspace,
		env: attachEnvironment.env,
		mocha,
		launchArgs,
		...installation,
	},
	{
		label: 'takeover',
		files: ['test/integration/suite/takeover.integration.js'],
		version,
		workspaceFolder: takeoverEnvironment.workspace,
		env: takeoverEnvironment.env,
		mocha,
		launchArgs,
		...installation,
	},
])
