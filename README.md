# dsh-version-guard

DSH version update notifier for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web.

A Settings section shows the running DSH version and lights up when npm publishes a newer release, with the release notes and the exact pinned launch command. It is a GitHub-distributed DSH bundle, not a shell modification — it never stops, restarts, patches, or upgrades DSH itself.

## Why

```bash
pnpm dlx @deepseek-ai/dsh@$(pnpm view @deepseek-ai/dsh version) web
```

resolves the `latest` dist-tag — which can lag behind (or trail) the `alpha` channel you actually run. Launching an older DSH against newer on-disk session formats fails history validation. This plugin keeps the decision visible: what is running, what is out, and which pinned command boots it.

## What it does

| Surface | Behavior |
|---|---|
| Settings section (设置 → Version Guard) | Current version, last check time, recommendation (with its dist-tag and channel match), bilingual release notes, dist-tag table |
| Placement note | Lives only in Settings — the sidebar footer belongs to the plugins that own it |
| Launch command | Always pinned to an exact version — never a floating tag |
| Polling | One registry check at boot, then hourly (in-memory only; nothing is written to disk) |

Data sources: the npm registry packument for `@deepseek-ai/dsh` (dist-tags + publish time) and the GitHub Releases API for notes. Recommendation logic prefers the channel you are already on (an `alpha` user follows `alpha`). Network failures degrade to a cached or error state and never block boot.

## Install

Preferred — install the fixed release tag with the package's own no-argument installer:

```bash
npx --yes github:shaomingbo/dsh-version-guard#v0.1.2
```

No arguments is the same as `install`. The installer only edits `dependencies.dsh-version-guard` and `dsh.profile.bundles` in the target profile's `package.json` (default profile `web`), writes it atomically, then runs `pnpm install --ignore-scripts` in that profile directory. It never stops or restarts DSH.

Check installation state:

```bash
npx --yes github:shaomingbo/dsh-version-guard#v0.1.2 status
```

Remove it (idempotent — safe to run twice, restores the manifest if dependency installation fails):

```bash
npx --yes github:shaomingbo/dsh-version-guard#v0.1.2 uninstall
```

Options available to every command: `--profile <name>` (default `web`), `--source <source>`, `-h`/`--help`. The default source is pinned to the current SemVer tag; you can also point it at a local checkout with `link:`:

```bash
npx --yes github:shaomingbo/dsh-version-guard#v0.1.2 --source link:/path/to/dsh-version-guard
```

After installing or uninstalling: restart `dsh web` manually, then hard-refresh the browser.

Manual fallback — edit `~/.dsh/profiles/web/package.json` yourself:

```json
{
  "dependencies": {
    "dsh-version-guard": "github:shaomingbo/dsh-version-guard#v0.1.2"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-version-guard"
      ]
    }
  }
}
```

then run `pnpm install --ignore-scripts` inside `~/.dsh/profiles/web` and restart DSH.

## RPC

The host serves a loopback-only `/version-guard` channel:

| Endpoint | Returns |
|---|---|
| `status` | Cached check: `currentVersion`, `distTags`, `hasUpdate`, `recommended`, `recommendedTag`, `newerVersions`, `publishedAt`, `launchCommand` |
| `check` | Forces a fresh registry check and re-caches |
| `changelog` | Release notes for a version (defaults to the recommendation), locale `zh`/`en`, cached in memory for an hour |
| `launch-command` | The pinned `pnpm dlx @deepseek-ai/dsh@<version> web` string |

## Development

```bash
npm run check          # syntax + node --test
npm pack --dry-run
```

Host tests inject fake fetch implementations; nothing touches the network.

## License

MIT
