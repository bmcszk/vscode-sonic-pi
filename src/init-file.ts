// The daemon evals <home>/.sonic-pi/config/init.rb on every boot, silently and only
// when the file exists (spider-server.rb:249-253, paths.rb:187-196); its own config
// copy-down never overwrites an existing file (spider-server.rb:87-95). Same here: the
// editor seeds the file once so the user has somewhere to write, and never edits it after.
import * as fs from 'fs'
import * as path from 'path'

export const initialInitContent = (): string =>
	[
		'# Sonic Pi init.rb',
		'#',
		'# Sonic Pi evaluates this file silently on every boot, before any buffer runs,',
		'# so anything set here applies to the whole session.',
		'#',
		'# Uncomment a line to use it:',
		'#',
		'# use_bpm 90',
		'# use_debug false',
		'# use_synth :prophet',
		'',
	].join('\n')

export const resolveInitPath = (homedir: string): string =>
	path.join(homedir, '.sonic-pi', 'config', 'init.rb')

export const ensureInitFile = (homedir: string): { path: string; created: boolean } => {
	const initPath = resolveInitPath(homedir)
	if (fs.existsSync(initPath)) {
		return { path: initPath, created: false }
	}
	fs.mkdirSync(path.dirname(initPath), { recursive: true })
	fs.writeFileSync(initPath, initialInitContent())
	return { path: initPath, created: true }
}
