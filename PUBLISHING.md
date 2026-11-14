# Publishing Vellum to the VS Code Marketplace

The extension is `dreamlab-ai.vellum-markdown-editor`. Publishing is done by
`.github/workflows/publish.yml` with Marketplace **Trusted Publishing**, so no access token is
stored anywhere. Microsoft retires global Azure DevOps personal access tokens on 1 December
2026, so a token-based setup is not worth starting.

## One-time setup (needs a person)

1. **Create the publisher.** Sign in at <https://marketplace.visualstudio.com/manage> with a
   Microsoft account and create a publisher whose **ID is exactly `dreamlab-ai`**. The ID must
   match `publisher` in `package.json` and cannot be changed later. The display name can be
   "DreamLab AI".
2. **Add a Trusted Publishing policy.** On the publisher page open **Trusted Publishing** and
   create a policy with:
   - Repository owner: `DreamLab-AI`
   - Repository: `vellum-markdown-editor`
   - Workflow filename: `publish.yml`
   - Environment: `marketplace`
3. **Create the `marketplace` environment** in the GitHub repository
   (Settings → Environments). Add yourself as a required reviewer so every publish needs an
   approval click.

## Releasing

1. Set `version` in `package.json` and `package-lock.json`, and add the changelog entry.
2. Merge to `main`. CI must be green.
3. Create a GitHub release with the tag `v<version>` (for example `v0.4.0`). Publishing it
   starts the workflow, which fails if the tag and `package.json` disagree.
4. Approve the `marketplace` deployment when prompted.

To publish a pre-release, tick "Set as a pre-release" on the GitHub release, or run the workflow
by hand with the pre-release box ticked. Pre-release and stable versions must have different
version numbers.

To check a build without publishing: `npm ci --ignore-scripts && npm run package &&
npx @vscode/vsce package`, then install the `.vsix` with
`code --install-extension vellum-markdown-editor-<version>.vsix`.

## The verified-publisher badge and dreamlab-ai.com

The Marketplace does not use the website for publishing. The website matters only for the
**verified publisher** tick:

- Eligibility: an extension on the Marketplace for at least six months, and a domain registered
  for at least six months.
- In the publisher's **Details** tab, enter `https://dreamlab-ai.com` as the verified domain.
  The Marketplace shows a **TXT record**; add it to the DNS zone for `dreamlab-ai.com` at the
  DNS host, then choose Verify. Nothing is deployed to the website for this.
- Microsoft then reviews the publisher, which includes looking at the website. A page for
  Vellum on dreamlab-ai.com that links to the repository and the Marketplace listing helps.

So: publish now, and apply for the badge six months after the first release.

## Before the first publish

- The name `vellum-markdown-editor` and the publisher ID are permanent once used.
- `README.md` is the Marketplace listing. Its images must be reachable over HTTPS; images
  committed to this public repository are.
- The licence is GPL-3.0. `NOTICE.md` and the attribution section of the README must stay.
- Do not publish while the upstream extension's identifiers are also installed in the same
  VS Code: the two register the same commands.
