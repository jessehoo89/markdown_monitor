# dsh 插件：发布到 npm 与申请收录

本文件只讲两件运维动作，插件本身的用法见仓库根 README 的
[「作为 DeepSeek Harness 插件使用」](../README.md#作为-deepseek-harness-插件使用npm-包-dsh-doc2md)一节。

- **插件文件**（仓库根）：`package.json`、`index.js`、`cordis.patch.yml`、`screenshots.json`
- **包名**：`dsh-doc2md`（npm 上尚未被占用）
- **收录分类**：`docs`（Docs & Rendering）

---

## 一、先把这个仓库推上去

插件要能被 `dsh plugin add github:...` 安装，本仓库里得有这几个文件。**这一步必须先做完**，
npm 包的 `repository` 字段要指回这个仓库才会被自动关联，收录也要求仓库里真有可装的代码。

```bash
git add package.json index.js cordis.patch.yml screenshots.json .gitignore README.md \
        doc2md/__init__.py doc2md/cli.py doc2md/engine.py docs/DSH-PLUGIN.md
git commit -m "feat: 发布为 DeepSeek Harness 插件 dsh-doc2md（新增 --print-outputs）"
git push
```

顺手给仓库加上收录生态要求的 GitHub topic（网页操作即可）：

> Settings → Topics → 添加 **`dsh-plugin`**

这一步不影响收录（收录只看 `data/plugins/*.yml`），但它是 dsh 生态官方的发现机制。

---

## 一·五、从 GitHub 直接安装（不发 npm 的主路径）

npm 包**不是收录的必要条件**，也不是安装的必要条件 —— 插件可以从 GitHub 直接装，
行为与从 npm 装完全一致。本插件没有 build 脚本，所以还省掉了 `allowBuilds` 构建授权。

### 方式 A：DSH 桌面端的市场（推荐）

市场（`dshmarket`）的搜索框旁有**「手动输入」**，接受这些写法：

```
github:jessehoo89/markdown_monitor          # 推荐
github:jessehoo89/markdown_monitor#<sha>    # 钉住某个提交，最稳
jessehoo89/markdown_monitor                 # 简写
```

装之前市场会自动创建快照，随时可回滚。国内网络不用额外配代理：市场对中国区默认走
`gh-proxy.com`，失败会自动回退直连（也可在设置里换成自己的线路）。

> 收录条目**合并之后**，插件才会出现在市场的搜索列表里（市场目录来自
> `awesome-dsh-plugin.com/plugins.json`）。合并前用上面的「手动输入」装。

### 方式 B：命令行

```bash
dsh plugin add github:jessehoo89/markdown_monitor --profile <你的 profile 名>
```

`--profile` 是必填的（省略会直接报错）。`dsh plugin` 内部调用 pnpm，所以机器上得先有
pnpm —— 没装的话用 corepack 顶一下即可：`corepack enable pnpm`。

### 装完怎么确认

```bash
dsh plugin list --profile desktop      # 应出现 dsh-doc2md
```

在会话里让模型调用 `doc2md` 工具、`action: "status"`，能返回转换统计就说明接通了。
插件按 `DOC2MD_BIN` → `DOC2MD_REPO` → PATH → 常见安装目录的顺序找本机 doc2md。

---

## 二、发布到 npm（可选）

npm 包不是收录的必要条件（不发也能从 GitHub 装），发了的收益只有两个：市场能显示下载量、
安装免构建授权（本插件无 build 脚本，这一条也用不上）。**发不发都不影响收录。**

```bash
npm login                     # 只需一次
npm whoami                    # 确认登录成功
npm pack --dry-run            # 先看一眼包里是什么（应只有 6 个文件，不含任何 .py）
npm publish                   # 无 scope 包默认就是 public
```

发布前检查两件事：

1. `package.json` 的 `repository.url` 指回本仓库（已填好，别改）；
2. 包里**不能**混进 Python 源码 —— `files` 白名单已经把范围锁死，`npm pack --dry-run` 可复核。

`package.json` 里**不要**手写 `npm:` 之类的收录字段：市场映射是从 registry 自动采集的，
手写会被收录校验拒绝。

---

## 三、申请收录（向 awesome 列表提 PR）

收录的唯一动作是：往
[`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
提一个 PR，**只加一个文件**：

- 路径：`data/plugins/jessehoo89__markdown_monitor.yml`
- 文件名规则：`<owner>__<repo>.yml`（两个下划线）
- 内容：

```yaml
url: https://github.com/jessehoo89/markdown_monitor
name: jessehoo89/markdown_monitor
category: docs
description:
  en: 'Bridge to the local doc2md (markdown_monitor) CLI — one doc2md tool with convert, read, scan and status actions over docx, doc, xls, xlsx, pdf and image files.'
  zh: '桥接本机 doc2md（markdown_monitor）命令行——一个 doc2md 工具，提供 convert / read / scan / status 四个动作，支持 docx、doc、xls、xlsx、pdf 与图片。'
```

> 两个 README 是脚本从 `data/plugins/*.yml` 生成的，**不要手工改**；一个 PR 最多 3 条。

### 操作步骤

```bash
# 1) 在 GitHub 网页上 Fork 一份 awesome-dsh-plugin/awesome-dsh-plugin 到自己账号，
#    然后：
git clone https://github.com/<你的账号>/awesome-dsh-plugin.git
cd awesome-dsh-plugin

# 2) 从主干拉一个分支
git checkout -b add-dsh-doc2md

# 3) 写条目（目录不存在就自己建）
mkdir -p data/plugins
cat > data/plugins/jessehoo89__markdown_monitor.yml <<'YAML'
url: https://github.com/jessehoo89/markdown_monitor
name: jessehoo89/markdown_monitor
category: docs
description:
  en: 'Bridge to the local doc2md (markdown_monitor) CLI — one doc2md tool with convert, read, scan and status actions over docx, doc, xls, xlsx, pdf and image files.'
  zh: '桥接本机 doc2md（markdown_monitor）命令行——一个 doc2md 工具，提供 convert / read / scan / status 四个动作，支持 docx、doc、xls、xlsx、pdf 与图片。'
YAML

git add data/plugins/jessehoo89__markdown_monitor.yml
git commit -m "Add jessehoo89/markdown_monitor (dsh-doc2md) under docs"
git push -u origin add-dsh-doc2md
```

推完在 GitHub 上开 PR 即可。CI 会依次检查：

1. **每个 PR 最多 3 条**（本条只加 1 条）；
2. **`dsh.bundle`** —— 从本仓库的 `package.json` 读（已声明 `dsh.bundle.patch`）；
3. **仓库年龄 ≥ 1 天**（2026-09-21 创建，满足）；
4. **awesome-lint 与站点构建** —— 双语一致性、格式。

失败时会在 PR 里说明要改什么，同一分支推修复即可，不用重开 PR。

### 本仓库当前的核对情况

| 要求 | 状态 |
|---|---|
| `package.json` 声明 `dsh.bundle`（不是只有 `dsh.client`） | ✅ `dsh.bundle.patch: ./cordis.patch.yml` |
| `cordis.patch.yml` 存在 | ✅ 仓库根 |
| 真实可用的代码（非占位、非纯 README） | ✅ `index.js`，已实测 convert / read / scan / status |
| 仓库创建满 1 天 | ✅ 2026-09-21 |
| 活跃维护 | ✅ 持续提交 |
| `dsh-plugin` topic | ⬜ 需手动添加（见第一节） |
| 描述属实、无营销词 | ✅ 逐条对着代码核过 |
| 官方包用 `peerDependencies`，且带显式预发布分支 | ✅ 见下方「peer 范围为什么这么长」 |

### peer 范围为什么这么长

```jsonc
"peerDependencies": {
  "@deepseek-ai/cordis": "^4.0.1 || >=4.0.5-0 <5.0.0",
  "@deepseek-ai/dsh-tools": ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.2.0-0
    || >=0.1.1-0 <0.2.0 || >=0.1.2-0 <0.2.0 || >=0.1.3-0 <0.2.0
    || >=0.1.5-0 <0.2.0 || >=0.1.6-0 <0.2.0 || >=0.1.7-0 <0.2.0
    || >=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-0 <0.3.0"
}
```

（实际值是一行，这里只为排版折行。）

这不是堆砌，是 semver 的**预发布门规则**逼出来的：一个带预发布标签的版本，只有**当范围里某个比较符与它
`major.minor.patch` 元组完全一致、且自身也带预发布标签**时才会被放行。所以：

- `>=0.1.0-rc.1 <0.2.0-0` 只管到 `0.1.0` 这个元组的预发布版；它会**静默排除** `0.1.5-rc.3`、`0.1.7-rc.2`。
- `>=0.2.0-rc.1 <0.3.0-0` 才是覆盖 `0.2.0-rc.*` 的那条（即当前 `latest`）。
- 每个真实发布过预发布版的元组（`0.1.1` / `0.1.2` / `0.1.3` / `0.1.5` / `0.1.6` / `0.1.7` / `0.2.0` / `0.2.1`）
  都得单独给一条。稳定的 `0.1.x` / `0.2.x` 不受门限制，已被上面的分支顺带覆盖。

校验方式（对着 npm 上的**全量**已发布版本跑，而不是挑几个试）：

```bash
npm view @deepseek-ai/dsh-tools versions --json > /tmp/v.json
node -e "
const s=require('semver'), v=require('/tmp/v.json');
const r='<上面的 dsh-tools 范围>';
console.log('漏网:', v.filter(x=>!s.satisfies(x,r)).join(', ') || '无');
console.log('0.3.0-rc.1 必须为 false ->', s.satisfies('0.3.0-rc.1', r));
"
```

实测结论：31 个已发布版本**零漏网**，`0.3.0-rc.1` 正确落在范围外。
在 `dsh-tools@0.1.0-rc.8` + `cordis@4.0.1`（旧线）与 `dsh-tools@0.2.0-rc.2` + `cordis@4.0.4`（当前 `latest`）
两套环境里都跑过 `npm install`，**无 ERESOLVE、无 peer 告警**。

> harness 的 `latest` 现在是 **0.2.0-rc.2**（`alpha` 是 `0.2.1-alpha.1`）。再往上开新的预发布元组时，
> 照上面的办法补一条分支即可 —— 漏掉的话用户 `npm install` 会撞 ERESOLVE。

---

## 四、本地验收（改完插件后自测）

工程本身不带 Node 测试框架，用插件包（@deepseek-ai/dsh-tools）在 Node 里直接跑一遍最省事：

```bash
export DOC2MD_REPO=/path/to/markdown_monitor
export DOC2MD_PYTHON=$DOC2MD_REPO/.venv/Scripts/python.exe   # Windows
node -e "
import('./index.js').then(async (m) => {
  const defs = [];
  m.apply({ tools: { register: (d) => defs.push(d) }, logger: console });
  const out = await defs[0].execute({ action: 'status' }, { signal: new AbortController().signal });
  console.log(typeof out === 'string' ? out.slice(0, 400) : out);
});
"
```
