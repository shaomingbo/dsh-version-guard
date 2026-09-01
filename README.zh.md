# dsh-version-guard

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 的 DSH 版本更新提醒插件。

侧栏入口显示当前运行的 DSH 版本，npm 发布新版本时点亮更新徽标；打开面板即可阅读更新日志并复制固定版本的启动命令。它是 GitHub 分发的 DSH bundle，不是 shell 改动 —— 从不停止、重启、修改或升级 DSH 本身。

## 为什么需要它

```bash
pnpm dlx @deepseek-ai/dsh@$(pnpm view @deepseek-ai/dsh version) web
```

解析的是 `latest` dist-tag —— 它可能落后于（或不同于）你实际使用的 `alpha` 通道。用旧版 DSH 读取新版写出的磁盘会话格式时，历史校验会直接失败。这个插件把决策变成可见信息：当前跑的什么、外面有什么、用哪条固定命令启动。

## 功能

| 界面 | 行为 |
|---|---|
| 侧栏入口 | 已是最新时显示 `✓ 0.1.2-alpha.3`；npm 有新版时显示 `↑ <版本号>`；无法检测版本时显示 `?` |
| 面板 | 当前版本、上次检查时间、推荐版本（含 dist-tag 与通道匹配说明）、双语更新日志、dist-tag 一览表 |
| 启动命令 | 始终固定精确版本 —— 从不使用浮动 tag |
| 轮询 | 启动时检查一次，之后每小时一次（仅内存缓存，不写任何磁盘状态） |

数据来源：npm registry 上 `@deepseek-ai/dsh` 的 packument（dist-tags + 发布时间）和 GitHub Releases API（更新日志）。推荐逻辑优先跟随你当前所在通道（`alpha` 用户跟随 `alpha`）。网络失败降级为缓存或错误状态，绝不阻塞启动。

## 安装

首选 —— 使用包自带的无参数安装器安装固定 release tag：

```bash
npx --yes github:shaomingbo/dsh-version-guard#v0.1.1
```

无参数等同 `install`。安装器只编辑目标 profile 的 `package.json`（默认 profile 为 `web`）中的 `dependencies.dsh-version-guard` 与 `dsh.profile.bundles`，原子写入后在 profile 目录运行 `pnpm install --ignore-scripts`。从不停止或重启 DSH。

查看安装状态：

```bash
npx --yes github:shaomingbo/dsh-version-guard#v0.1.1 status
```

卸载（幂等 —— 重复执行安全；依赖安装失败时自动恢复 manifest）：

```bash
npx --yes github:shaomingbo/dsh-version-guard#v0.1.1 uninstall
```

所有命令均支持：`--profile <name>`（默认 `web`）、`--source <source>`、`-h`/`--help`。默认 source 固定到当前 SemVer tag；也可以用 `link:` 指向本地源码：

```bash
npx --yes github:shaomingbo/dsh-version-guard#v0.1.1 --source link:/path/to/dsh-version-guard
```

安装或卸载后：手动重启 `dsh web`，并强制刷新浏览器页面。

手动兜底 —— 直接编辑 `~/.dsh/profiles/web/package.json`：

```json
{
  "dependencies": {
    "dsh-version-guard": "github:shaomingbo/dsh-version-guard#v0.1.1"
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

然后在 `~/.dsh/profiles/web` 内运行 `pnpm install --ignore-scripts` 并重启 DSH。

## RPC

宿主侧提供仅限回环的 `/version-guard` 通道：

| 端点 | 返回 |
|---|---|
| `status` | 缓存的检查结果：`currentVersion`、`distTags`、`hasUpdate`、`recommended`、`recommendedTag`、`newerVersions`、`publishedAt`、`launchCommand` |
| `check` | 强制重新查询 registry 并刷新缓存 |
| `changelog` | 指定版本的更新日志（默认推荐版本），locale `zh`/`en`，内存缓存一小时 |
| `launch-command` | 固定版本的 `pnpm dlx @deepseek-ai/dsh@<版本> web` 命令串 |

## 开发

```bash
npm run check          # 语法检查 + node --test
npm pack --dry-run
```

宿主测试注入假的 fetch 实现；测试从不访问网络。

## 许可

MIT
