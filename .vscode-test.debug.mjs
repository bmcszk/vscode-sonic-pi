// Temporary per-suite runner used while iterating; deleted before the commit.
import { defineConfig } from '@vscode/test-cli'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createEnvironment } = require('./test/integration/harness/environment.js')

const launchArgs = ['--disable-extensions', '--disable-gpu', '--no-sandbox', '--skip-welcome', '--skip-release-notes']
const mocha = { timeout: 120000, require: ['./test/integration/harness/lifecycle.js'] }
const installation = { useInstallation: { fromPath: process.env.VSCODE_TEST_EXECUTABLE } }

const suites = [
	'notebook-run',
	'media-docs',
	'editor-controls',
	'server-lifecycle',
	'server-shutdown',
	'attach',
	'takeover',
]

export default defineConfig(
	suites.map((label) => {
		const environment = createEnvironment(label)
		return {
			label,
			files: [`test/integration/suite/${label}.integration.js`],
			workspaceFolder: environment.workspace,
			env: environment.env,
			mocha,
			launchArgs,
			...installation,
		}
	}),
)
