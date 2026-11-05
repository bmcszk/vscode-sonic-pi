# VS Code Marketplace Publishing — Requirements & Quality Bar (2026)

**Bean:** sonic-pi-uzyx · **Repo:** vscode-sonic-pi · **Compiled:** 2026-11 (research subagent)
**Note on provenance:** This agent has no shell/git tools, so `docs/research/marketplace-publishing.md` on branch `marketplace-research` could not be committed/pushed directly; this artifact is written to the configured authoritative output path for the parent run to persist. All claims below cite fetched sources; anything unconfirmed is flagged **UNVERIFIED**.

---

## TL;DR for the fork

1. **You cannot publish under `s00500`** (upstream author's publisher ID). Marketplace authorizes the *account that owns the PAT*, and that account must have publish access to the publisher. Create your own publisher ID and change `publisher` in `package.json` before `vsce package`.
2. **PAT auth still works but is deprecated**: Azure DevOps **global PATs ("All accessible organizations") are decommissioned Dec 1, 2026**. Use an *organization-scoped* PAT (Marketplace → **Manage** scope) as a short-term path, or adopt **Trusted Publishing** (GitHub Actions OIDC, GA Oct 28, 2026) which the Marketplace now recommends.
3. **Forks get specific scrutiny**: Microsoft explicitly reviews "extensions that duplicate repository links and logo images for potential impersonation." Update the repository link, README, and logo before submitting.
4. **No EV code signing required** — the Marketplace signs all VS Code extensions itself at publish time.

---

## Q1. Publisher account + PAT

### PAT scope & creation (verified, official)
Source: [Publishing Extensions — code.visualstudio.com/api/working-with-extensions/publishing-extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

> "`vsce` can only publish extensions using Personal Access Tokens. You need to create at least one in order to publish an extension."

PAT creation steps (official doc): Azure DevOps portal → User settings → **Personal access tokens** → **New Token** with:
- Organization: **All accessible organizations** (per current docs text; see ⚠ below — this guidance is being revised)
- Scopes: **Custom defined** → *Show all scopes* → **Marketplace → Manage**

The docs' troubleshooting note states: *"One easy mistake to make when creating the PAT is to select a specific organization instead of **All accessible organizations** in the Organizations field dropdown. Another possible mistake is incorrect scope - you should set the Authorized Scopes to `Marketplace (Manage)` for the publish to work."*

> ⚠ **CONTRADICTION (timely):** Azure DevOps is retiring global PATs (the "All accessible organizations" kind). **December 1, 2026 — all existing global PATs stop working.** Microsoft's official vscode-docs issue #10526 documents the fix: create an **organization-scoped** PAT instead (select one specific org you belong to, *not* "All accessible organizations"), still with **Marketplace → Manage** scope. Key quote:
> > "Marketplace publishers are **not linked to Azure DevOps organizations**. The organization is needed to create the PAT; it does not need to correspond to your Marketplace publisher. Marketplace authorizes the account that owns the token, so that account must have access to publish for your publisher."
> — [vscode-docs issue #10526](https://github.com/microsoft/vscode-docs/issues/10526)
Sources: [Retirement of Global PATs in Azure DevOps (Dec 12, 2025)](https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops) — "December 1, 2026 – All existing global PATs will be fully decommissioned."

**Practical guidance (inference from the above):** create the org-scoped PAT variant from day one — a global PAT created now will die Dec 1, 2026.

### Creating a publisher (verified, official)
From the same doc:
1. Go to [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage).
2. Log in with the **same Microsoft account** used to create the PAT.
3. **Create publisher** → set **ID** ("unique identifier for your publisher in Marketplace that will be used in your extension URLs. ID cannot be changed once created") and **Name** ("unique name of your publisher… company or brand name").
4. Verify with `vsce login <publisher id>` (paste PAT; "The Personal Access Token verification succeeded…").

### Can a fork use the upstream author's publisher ID? — **No**
- **Direct evidence:** "Marketplace authorizes the account that owns the token, so that account must have access to publish for your publisher." (vscode-docs #10526). Publishing under `s00500` requires being a member of that publisher or holding its owner's credential — neither applies to us.
- **Manifest requirement:** `publisher` is a required field ("The publisher identifier", extension-manifest).
- **Fork-specific risk (official, June 2025):** "**Copycats:** We're reviewing extensions that duplicate repository links and logo images for potential impersonation." Best-practice table: *"Prevent content duplication: If you start by cloning another open-source extension, make sure to update the repository link and readme content."* — [Security and Trust in Visual Studio Marketplace](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace)
- **Researcher inference:** leaving `publisher: "s00500"` + upstream repo URL + upstream logo would both fail authentication and pattern-match the copycat review signal. Action: new publisher ID, update `repository`, README, and icon.

---

## Q2. vsce publish vs web upload; verification; signing

### Commands (verified, official)
```
npm install -g @vscode/vsce
vsce package          # → myExtension.vsix
vsce publish          # → <publisher id>.myExtension published to VS Code Marketplace
vsce login <publisher id>   # store PAT (or pass VSCE_PAT env var — UNVERIFIED in docs, widely used)
```
Manual upload alternative: "Manually, using `vsce package` to package the extension into the installable VSIX format and then uploading it to the Visual Studio Marketplace publisher management page" (publishing-extension doc).

### Prerelease flag (verified, official)
> "Using the latest `vsce` you can publish a pre-release version using `--pre-release` flag. Eg: `vsce publish --pre-release`" — requires `engines.vscode >= 1.63.0`. — [microsoft/vscode#138068](https://github.com/microsoft/vscode/issues/138068) (team-maintained issue; canonical odd/even versioning guidance lives at publishing-extension#prerelease-extensions)
- Versioning: Marketplace **only supports major.minor.patch** — semver prerelease suffixes rejected (vsce source enforces: "The VS Marketplace doesn't support prerelease versions"). Convention: **even minor = stable, odd minor = pre-release** (e.g. 0.2.* stable / 0.3.* pre-release).
- VSIX must be packaged with `--pre-release` too, or publish errors ("Cannot use '--pre-release' flag with a package that was not packaged as pre-release") — [vsce publish.ts](https://github.com/microsoft/vscode-vsce/blob/main/src/publish.ts).
- Expect ~10 min Marketplace propagation after publish (microsoft/vscode#138068, Note 3).

### New identity checks since 2024 (verified)
- **Trusted Publishing (GA Oct 28, 2026)** — PAT-free publish from GitHub Actions/Azure Pipelines via OIDC; short-lived credential (15 min); "Existing PAT-based publishing continues to work, so you can adopt Trusted Publishing when you're ready." Setup: "Create a policy on the publisher's **Trusted Publishing** page and publish with GitHub OIDC." — [devblogs: Trusted Publishing for Visual Studio Marketplace](https://devblogs.microsoft.com/blog/trusted-publishing-visual-studio-marketplace)
- **Malware pipeline (June 2025):** initial static scan (Defender-class engines) → rescan post-publish → periodic marketplace-wide scans → **dynamic sandbox runtime-behavior check on every incoming VS Code package** → flagged packages get manual security review. — [Security and Trust blog](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace)
- **Impersonation prevention:** "attempts to use names that can be easily mistaken for a popular publisher are automatically prevented."
- **Verified publisher badge (not new, still enforced):** requires publisher with ≥1 extension on Marketplace **≥6 months** AND a domain **≥6 months old**, DNS TXT verification, then human review "within 5 business days". Not available to a brand-new publisher initially. — publishing-extension#verify-a-publisher
- **Runtime trust prompt (VS Code 1.97+):** "when you first install an extension from a third-party publisher, VS Code shows a dialog prompting you to confirm that you trust the publisher." — [extension-runtime-security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security). *Implication (inference): unverified new publishers face an extra user-consent dialog at install time.*

### EV code signing — **not required for VS Code extensions** 
> "Signature Verification: Marketplace repository signs all VS Code extensions when they're published. By default, the repository signature verification is enforced at install time, which checks the integrity and source of the extension package." — Security & Trust blog (direct evidence).
vsce does support optional Authenticode signing (`--signTool`) for publishers who want it (vsce source) — optional, not a Marketplace requirement. *(Note: EV-certificate requirements apply to classic Visual Studio installer extensions, a different pipeline — not verified here, out of scope.)*

---

## Q3. Listing quality bar (2026)

### Icon
> "`icon` … The path to the icon of at least 128x128 pixels (256x256 for Retina screens)." — [extension-manifest](https://code.visualstudio.com/api/references/extension-manifest)
- **No SVG icons.** "Due to security concerns, `vsce` will not publish extensions that contain user-provided SVG images." Enforced checks:
  - icon in `package.json` may not be SVG;
  - badges may not be SVG unless from [approved badge providers](https://code.visualstudio.com/api/references/extension-manifest#approved-badges);
  - "Image URLs in `README.md` and `CHANGELOG.md` need to resolve to `https` URLs.";
  - README/CHANGELOG images may not be SVG unless trusted badge providers.
- Tip from manifest doc: "An icon and a contrasting banner color look great on the Marketplace page header" (`galleryBanner.color` + `theme: dark|light`).

### README
> "Have a `README.md` Markdown file in your extension's root folder and we will include the contents in the body of the extension details (on the Marketplace). You can provide relative path image links in the `README.md`." — extension-manifest

### CHANGELOG
A root `CHANGELOG.md` is picked up automatically and rendered in its own **Changelog** tab on the Marketplace page (vsce packages it when present). *(Rendering behavior is long-standing; exact current wording in manifest/publishing docs — medium confidence, mechanism verified via vsce packaging behavior.)*

### Review-enforced bar (what the Marketplace actually checks)
No formal human pre-review gates ordinary publishes; enforcement = automated publishing tool checks (SVG/https above) + malware/dynamic sandbox scans + impersonation-name filters + community reporting. The fork-relevant items Microsoft calls out (June 2025):
- unique publisher & extension display names and images ("Prevent search confusion");
- update repository link + readme when cloning an OSS extension ("Prevent content duplication");
- "Avoid obfuscation: Clean, and non-obfuscated code in extensions is significantly less likely to trigger a false-positive for malware… can slow down review process."
*(The legacy aka.ms/extension-guidelines target now resolves to UX Guidelines — [code.visualstudio.com/api/references/extension-guidelines](https://code.visualstudio.com/api/references/extension-guidelines) covers UI integration best practices, not listing review. No separate "listing reviewer checklist" doc found — see Missing evidence.)*

### Other manifest constraints (verified)
`name`: lowercase, no spaces, unique; `displayName` unique; `keywords` limited to 30; `categories` from a fixed allowed list; `engines.vscode` required, cannot be `*`; `version` must be SemVer.

---

## Q4. 2025–2026 policy changes affecting small OSS forks under a new publisher

1. **Dec 1, 2026: global PATs decommissioned** — biggest operational change; fork must use org-scoped PAT (temporary, per Microsoft) or Trusted Publishing. Sources above.
2. **Oct 28, 2026: Trusted Publishing GA** — recommended path; no stored secrets; GitHub Actions policy configured on the publisher's "Trusted Publishing" page. "PAT-based publishing is not the recommended long-term approach." (vscode-docs #10526)
3. **June 2025: hardened malware scanning + copycat review** — dynamic sandbox analysis on *every* incoming VS Code package; duplicated repo links/logos actively reviewed for impersonation. Obfuscated code slows review.
4. **VS Code 1.97 (early 2025): third-party publisher trust dialog** at first install — new/unverified publishers get an install-time consent prompt; prior installs auto-trusted.
5. **Verified-publisher badge bar raised** — "domain was verified" plus track record checks; 6-month extensions + 6-month domain prerequisites remain, so a new publisher cannot be verified on day one. No evidence of *new waits/queues for publishing itself* — publishes are still near-immediate; only the verified-badge review has a stated 5-business-day window. *(Researcher inference from absence of contrary evidence; flagged below.)*

---

## Contradictions
- **PAT organization scope:** current publishing doc says choose "All accessible organizations"; Azure DevOps retirement (Dec 1, 2026) + vscode-docs #10526 say global PATs die then and org-scoped is the workaround. The code.visualstudio.com page is mid-revision; treat #10526 + devblogs as the fresher truth.
- **None found** on icon/SVG, publisher ownership, or prerelease flag rules.

## Missing evidence / UNVERIFIED
- Exact current wording of the "prerelease-extensions" section on the live page (fetched copy truncated mid-document; versioning facts corroborated by official microsoft/vscode#138068 and vsce source).
- No official page enumerating "reviewer-enforced listing guidelines" as a checklist (aka.ms/extension-guidelines redirects to UX Guidelines). The enforced bar is inferred from the publishing-tool checks + security blog; UNVERIFIED beyond those.
- Whether Marketplace imposes any *new* pre-publish human verification/queue for brand-new publishers in 2025–26: no official statement found either way. Treat as "no evidence of new gates."
- Marketplace web-upload flow details (drag-drop UI) not page-verified; only the doc's one-line description quoted.
- No 2025–26 statement that the fork's extension *name* ("sonic-pi…") collides with impersonation filters — should be checked at publish time by trial.

## Sources
**Kept (primary/official):**
- Publishing Extensions — https://code.visualstudio.com/api/working-with-extensions/publishing-extension (canonical: vsce, PAT steps, publisher creation, verification, manual upload)
- Extension Manifest — https://code.visualstudio.com/api/references/extension-manifest (icon size, README/CHANGELOG rules, name/keyword/category constraints)
- Security and Trust in Visual Studio Marketplace (Jun 11 2025) — https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace (scans, copycats, signature verification, verified-publisher bar)
- Trusted Publishing for VS Marketplace (Oct 28 2026) — https://devblogs.microsoft.com/blog/trusted-publishing-visual-studio-marketplace (OIDC publishing, PAT status)
- Retirement of Global PATs (Dec 12 2025) — https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops (Dec 1 2026 deadline)
- vscode-docs issue #10526 — https://github.com/microsoft/vscode-docs/issues/10526 (org-scoped PAT workaround; publisher↔org decoupling)
- microsoft/vscode#138068 — https://github.com/microsoft/vscode/issues/138068 (--pre-release flag, odd/even minors, 10-min propagation)
- vscode-vsce publish.ts — https://github.com/microsoft/vscode-vsce/blob/main/src/publish.ts (flag enforcement, semver rejection, optional --signTool)
- Extension runtime security — https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security (1.97 trust dialog)
- UX Guidelines — https://code.visualstudio.com/api/references/extension-guidelines (what aka.ms/extension-guidelines resolves to)

**Rejected/deprioritized:** Stack Overflow prerelease answer (superseded by official issue); third-party PUBLISHING.md / semantic-release-vsce README / random repo commits (secondary practice, kept only as corroboration of flag semantics, not cited as requirements); readthedocs mirror of old manifest docs (stale mirror); web.archive.org 2024 snapshot (superseded).

## Next steps
1. Parent to persist this file to `docs/research/marketplace-publishing.md` on `marketplace-research` (branch/commit/push not executable by this agent — no shell).
2. Decide auth path for first publish: org-scoped PAT now vs Trusted Publishing from the start (recommended given Dec 1, 2026 cutoff).
3. Before packaging: set new `publisher` ID, update `repository`, README, and icon in `package.json`; pick even-minor version line for stable.
