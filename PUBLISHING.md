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
   approval click. Allow the `main` branch and `v*` tags under deployment branches and tags.

For a first release without automation, build the VSIX as described below, open the
publisher's management page, choose **New extension → Visual Studio Code**, and upload
the `.vsix`. This uses your Microsoft sign-in and does not require a PAT. Keep the same
publisher ID for subsequent automated releases.

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

Microsoft's [publisher verification instructions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#verify-a-publisher)
require at least one extension on the Marketplace for six months and a domain registration
at least six months old. Microsoft explicitly asks publishers to wait until both conditions
are met before applying. Creating a publisher, pushing a GitHub release or setting a homepage
does not start the extension's six-month period: the extension must be on the Marketplace.

Use `https://dreamlab-ai.com` consistently as the publisher's website and eventual verified
domain. The extension manifest already links there. The domain must be an apex domain,
use HTTPS, respond with HTTP 200 to a HEAD request, and have DNS settings you control.
The `dreamlab-ai-website` repository serves the website; Microsoft's ownership proof is a
DNS TXT record, not a file, meta tag or deployment in that repository.

Once eligible:

1. Open the `dreamlab-ai` publisher's **Details** tab. Under **Verified domain**, enter
   `https://dreamlab-ai.com`, then **Save → Verify**.
2. Copy the exact TXT record name and value Microsoft supplies into the domain's DNS zone.
   Keep existing TXT records. Do not invent a token or use GitHub Pages' verification token.
3. Select **Verify** in the dialog after the record has propagated.
4. Microsoft reviews the domain, website, extensions and publisher reputation, normally
   reporting the result within five business days. Six months makes the publisher eligible;
   it does not award the badge automatically.

Choose a stable publisher display name, such as **DreamLab AI**: changing it after verification
revokes the badge. Keep the domain registered and the website available.

### Readiness checks on 14 November 2026

- GitHub's `marketplace` environment is configured with `jjohare` as required reviewer,
  allowing the `main` branch and `v*` tags. The Marketplace publisher and Trusted Publishing
  policy still need to be confirmed in the Microsoft account.
- [Verisign RDAP](https://rdap.verisign.com/com/v1/domain/dreamlab-ai.com) records domain
  registration on **30 June 2025**, so the domain-age requirement is already met.
- `curl -I https://dreamlab-ai.com` returned **HTTP 200** over HTTPS.
- Domain ownership through DNS and Marketplace publication have **not** been verified by
  these checks. Record the first successful Marketplace publication date after the listing
  is live. If that date is **14 November 2026**, the earliest application date is
  **14 May 2027**. Recalculate if publication happens later.

## Before the first publish

- The name `vellum-markdown-editor` and the publisher ID are permanent once used.
- `README.md` is the Marketplace listing. Its images must be reachable over HTTPS; images
  committed to this public repository are.
- The licence is GPL-3.0. `NOTICE.md` and the attribution section of the README must stay.
- Do not publish while the upstream extension's identifiers are also installed in the same
  VS Code: the two register the same commands.
