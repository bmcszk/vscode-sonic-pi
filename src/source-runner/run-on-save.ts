// Auto-run on save (roadmap F12, upstream issue #1902): with vscode-sonic-pi.runOnSave on, a save
// of a sonic-pi document plays the whole file - the Run lens semantics (offset 0, no cell keys),
// so the daemon reports the file's own lines. A notebook cell is a document too, but a notebook
// executes through its kernel, so a cell save never auto-runs here.
interface SavedDocument {
	languageId: string
	uri?: { scheme: string }
	getText(): string
}

type WholeFileRunner = { runCode: (code: string) => void }

export function documentCanAutoRunOnSave(document: SavedDocument): boolean {
	if (document.languageId !== 'sonic-pi') {
		return false
	}
	return document.uri?.scheme !== 'vscode-notebook-cell'
}

export function runDocumentWholeFileOnSave(main: WholeFileRunner, document: SavedDocument): boolean {
	if (!documentCanAutoRunOnSave(document)) {
		return false
	}
	main.runCode(document.getText())
	return true
}

export function shouldAutoRunOnSave(
	{ enabled, document }: { enabled: boolean; document: SavedDocument },
	main: WholeFileRunner,
): boolean {
	if (!enabled) {
		return false
	}
	return runDocumentWholeFileOnSave(main, document)
}
