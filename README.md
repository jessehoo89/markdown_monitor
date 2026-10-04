# markdown_monitor

**实时监控目录，把新增或改动的文档自动转成 Markdown。**

往监控目录里丢 `.docx` / `.doc` / `.xlsx` / `.xls` / `.pdf` / 图片，程序检测到写入完成就自动
转换，产出同名 `.md`，不必手动敲命令。想一次性批量转整棵目录树，仍用 `doc2md convert <目录>`。

> 项目与仓库名是 **markdown_monitor**；**命令行、可执行文件、安装目录名仍沿用 `doc2md`**，
> 已经装过的实例与脚本不受影响。

## 监控模式

- **随放随转**：`watchdog` 监听多个根目录的新增与修改，带**写入防抖**（大文件拷到一半不会被
  误转）与**自触发保护**（自己生成的 `.md` 不会再次触发转换）
- **不重复转换**：`state.db` 记录已处理文件与结果，重启、重扫、重复投放都不会重转
- **配置热加载**：改 `config.json` 立即生效（监控目录、排除目录、扩展名、防抖时长、输出位置、
  PDF 引擎…），只有 OCR 相关改动需要重启
- **多根目录 + 排除规则**：`roots` 可配多个监控目录；`exclude_dir_names` 排除目录、
  `sensitive_markers` 标记敏感文件不上云
- **三种跑法**：图形界面带监控面板；命令行 `doc2md watch`；Windows 上双击
  `文档转MD-监控模式.bat`

## 转换能力

把一整个目录树的 **docx / doc / xls / xlsx / pdf** 批量转成 Markdown，并带上
**断点续传**、**实时监控**、**扫描件 OCR（多云端后端自动熔断切换）** 三件事。

为中文场景做的：段落重组、页码过滤、标题识别、落款分行、表格还原、
敏感目录不上云。

```
┌── 本地直转（不联网、最快） ────────────────────────────────┐
│  .docx  → mammoth        .xlsx → openpyxl                 │
│  .doc/.xls → Office COM（Windows）                        │
│            → LibreOffice soffice（Linux）                 │
│  有文本层 PDF → pymupdf4llm（带可信度复核，防"假文本层"）  │
└───────────────────────────────────────────────────────────┘
┌── 扫描件 / 无文本层 PDF → OCR ─────────────────────────────┐
│  1. paddle          PaddleOCR-VL      专用、出插图         │
│  2. mineru[精度]    MinerU precision  专用、出插图、可分段 │
│  3. sf-deepseek-ocr DeepSeek-OCR      专用、一问一答无队列 │
│  4. mineru[轻量]    MinerU agent      免 Token 兜底        │
│  任一层配额用尽 / 背压 / 鉴权失败 → 熔断该后端并自动切换   │
└───────────────────────────────────────────────────────────┘
```

## 平台支持

Windows 与 Linux 都可用；macOS 未验证。两者差异只在老式 `.doc` / `.xls` 的转换通道与打包产物上，
其余功能（断点续传、监控、云端 OCR、空文档与加密文件判定）一致。

| 事项 | Windows | Linux |
|---|---|---|
| 老式 `.doc` / `.xls` / `.wps` / `.et` | 本机 Office / WPS 的 COM | LibreOffice `soffice --headless`（需自行安装） |
| 依赖声明 | `pywin32`（`sys_platform == "win32"` 条件安装） | 系统包 `libreoffice-writer` + `libreoffice-calc` |
| 启动入口 | `.bat` 菜单 / GUI / 命令行 | `doc2md` 命令（即 `python -m doc2md ...`） |
| 一键安装 | `doc2md-安装程序.exe`（免装 Python） | `bash install.sh`（二进制秒装 / 源码装 venv） |
| 打包产物 | `dist\doc2md\`（两个 exe 共享 `_internal\`） | `dist/doc2md/`（目录）或 `dist-onefile/doc2md`（单文件） |

代码里的分叉点只有三处：

- `doc2md/com.py`：`to_ooxml()` 在 `os.name != "nt"` 时走 LibreOffice 分支，Windows 的 COM 原路径不变。
- `doc2md/detect.py`：OLE2 类型判定先扫前 16KB，未认出 `WordDocument` 时用内置 `CfbReader` 精确解析目录项。
  原因：LibreOffice 写出的 `.doc` 目录扇区落在 16KB 之后，老办法会被流数据里的巧合字节 `Book` 误判成 xls。
- `requirements.txt`：`pydantic` 是 `vendor/ZhDocParser`（rule 档 PDF 引擎）的直接依赖，单独列出。

## 安装

三种方式，按场景挑一个。**装完先做三件事**：① 首次运行自动生成 `config.json`，
把里面的 `roots` 改成你的语料目录；② 在 `.env` 里填云端 OCR 凭据（不填也能转
docx / xlsx / 有文字层的 PDF）；③ 跑一次 `doc2md scan` 试运行 —— 看清每个文件会走
哪条通道，不写任何文件。

### Windows

#### 方式一：**单文件安装程序**
release页面[https://github.com/jessehoo89/markdown_monitor/releases]
下载doc2md-*-win-x64-installer.exe
双击安装至指定目录，运行doc2md.exe及doc2md-gui.exe
或下载 *.-win-x64.zip 解压后运行 doc2md-gui.exe
```bat
doc2md-*-win-x64-installer.exe                  :: 双击：图形界面，选目录、建快捷方式
doc2md-*-win-x64-installer.exe /S               :: 静默装到 C:\Program Files\doc2md
doc2md-*-win-x64-installer.exe /S /D=D:\doc2md  :: 静默装到指定目录
```

装完安装目录里有 `doc2md.exe`（命令行 / 中文菜单）与 `doc2md-gui.exe`（图形界面），
卸载用它自带的 `uninstall.exe`。构建与更多参数见
[使用说明 → 安装版](docs/USAGE.md#安装版单文件安装程序)。

#### 方式二：**源码 + 虚拟环境**（开发用）

```bat
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy config.example.json config.json
.venv\Scripts\python.exe -m doc2md scan
```

不想敲命令就双击 `文档转MD.bat`（中文菜单）或 `文档转MD-GUI.bat`（图形界面）。

### Linux / macOS

#### 一条命令装完（推荐；自动取 Release 里的现成程序，不需要 Python）：

```bash
curl -fsSL https://raw.githubusercontent.com/jessehoo89/markdown_monitor/main/install.sh | bash
```

默认装到 `~/.local`,程序约 130M。可用的参数：`--version v1.0.2`
（默认最新版）、`--gh-proxy https://gh-proxy.com/`（GitHub 慢时套加速）、
`--bin 文件`（用你已下好的 Release 程序）、`--source`（改成 git clone 源码安装）、
`--uninstall`。全部参数与环境变量见[使用说明](docs/USAGE.md#linux--macos一条命令--一键脚本--源码)。

仓库已经克隆到本地时，也可以就地跑脚本：

```bash
# 老式 .doc / .xls 才需要 LibreOffice（Debian / Ubuntu）
sudo apt install -y libreoffice-writer libreoffice-calc

bash install.sh                 # 装到 ~/.local，装完就有 doc2md 命令
bash install.sh --prefix /opt/doc2md
bash install.sh --source        # 强制源码方式（建 venv + 装依赖）
bash install.sh --uninstall     # 卸载
```

脚本会优先用仓库里打包好的**单文件可执行程序**（秒装、不需要 Python）；没有就退回
源码方式。程序把自己的 `config.json` / `.env` / `state.db` 写在安装目录的
`share/doc2md/` 里，跟着程序走，不依赖当前工作目录。

#### 源码 + 虚拟环境：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp config.example.json config.json
.venv/bin/python -m doc2md scan
```

#### 打成单个可执行文件分发（目标机不装 Python）

```bash
bash build_linux.sh onefile     # 产物：dist-onefile/doc2md —— 一个文件拷走即用
```

详见 [使用说明 → 打包成 Linux 可执行文件](docs/USAGE.md#打包成-linux-可执行文件)。

## 常用命令

| 命令 | 作用 |
|---|---|
| `scan` | 试运行：列出待转文件与各自通道，**不写任何文件** |
| `run` | 批量转换，中断后重跑自动续传 |
| `watch` | 常驻监控新增 / 修改的文件并自动转换 |
| `test <文件>` | 只转一个文件，看分流详情 |
| `convert <路径…>` | 只转点名的文件（也可给清单 `--list`，见使用说明） |
| `status` / `retry` / `ping` / `env` | 统计 / 重试失败 / 检测云端 OCR / 查看凭据生效情况 |

```bash
doc2md scan  --root ~/语料        # 试运行
doc2md run   --root ~/语料        # 正式转换
doc2md convert a.docx b.pdf       # 只转这一批
doc2md --help                     # 全部子命令与参数
```

公共参数：`--config <路径>`、`--root <目录>`（可重复）、`--limit N`、`--quiet`、
`--no-ocr`，写在子命令前后都认。Windows 上把 `doc2md` 换成 `doc2md.exe`；源码
运行时是 `python -m doc2md`。

## 作为 DeepSeek Harness 插件使用（npm 包 `dsh-doc2md`）

仓库根下同时就是一个 npm 包 **`dsh-doc2md`**：给
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）注册一个
`doc2md` 工具，让 agent 能把文档直接转成 Markdown。插件本身**不含任何文档解析器**，
只是对本机已安装的 doc2md CLI 的一层确定性桥接。

```sh
# 从 GitHub 装（不需要 npm 账号，也不需要等待发布）
dsh plugin --profile web add github:jessehoo89/markdown_monitor

# 或在 DSH 桌面端的市场里点「手动输入」，填 github:jessehoo89/markdown_monitor
```

装完重启该 profile 即可。插件没有 build 脚本，所以不会触发 `allowBuilds` 构建授权。
若机器上没有 pnpm（`dsh plugin` 依赖它），先 `corepack enable pnpm` 即可。

工具提供四个动作：

| action | 作用 |
|---|---|
| `convert` | 转换给定的绝对路径（文件 / 目录），并报出每个「源文件 → md」的准确落点 |
| `read` | 读回某个 `.md`（或源文档旁边的同名 md）的正文 |
| `scan` | 试运行：只列分流与 OCR 量，不写任何文件 |
| `status` | 打印转换统计（含各后端今日用量） |

**前置条件**：本机要有可用的 doc2md。插件按下面的顺序找它，命中哪个用哪个 ——
也可以在插件加载前设好对应环境变量来指定：

| 环境变量 | 含义 |
|---|---|
| `DOC2MD_BIN` | `doc2md` / `doc2md.exe` 的绝对路径（优先级最高） |
| `DOC2MD_REPO` | 源码仓库根目录，改用 `<python> -m doc2md` 调用 |
| `DOC2MD_PYTHON` | `DOC2MD_REPO` 用哪个解释器（默认依次找 `python3` / `python` / `py`） |

都没有时再去 PATH 与常见安装目录（`%LOCALAPPDATA%\Programs\doc2md`、`C:\Program Files\doc2md`、
`~/.local/bin`、`/opt/doc2md`）里找。要求 Node ≥ 22.19。

**它碰什么、不碰什么**（评审会逐条对着代码核，这里先写清楚）：

- 只读写你点名给它的路径；不解析文档、不抓网页、不 `eval`、不加载远程资源。
- 文档由本机的 doc2md 进程解析。**扫描件是否上传云端 OCR，取决于 doc2md 自己的
  `config.json` / `.env` 配置**，与这个插件无关 —— 插件不会替它做这个决定。
- 工具参数会进入会话日志，别把含密钥的路径当成秘密。
- 唯一的外部依赖是 harness 自带的 `@deepseek-ai/dsh-tools`（peer dependency），运行时零依赖。

**版本提示**：`convert` 用 `doc2md convert --print-outputs` 拿到**准确**的产出路径
（该开关自 doc2md **1.0.3** 起提供）。装在更老的版本上会自动降级为「按源文件同目录同名推断」，
并在结果里注明这一降级 —— 那时只有 `output.mode=alongside` 才准。另外，打包版
`doc2md.exe` 无论怎么设 `PYTHONIOENCODING` 都按 GBK 输出，插件两种编码都能解，不会乱码。

发布到 npm、以及向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
申请收录的完整步骤，见 **[docs/DSH-PLUGIN.md](docs/DSH-PLUGIN.md)**。

English: the repo root doubles as the npm package **`dsh-doc2md`**, a DeepSeek Harness (`dsh`)
plugin that registers a `doc2md` tool with four actions (`convert` / `read` / `scan` / `status`).
It ships no parser of its own — it is a deterministic bridge to a locally installed doc2md CLI,
locatable via `DOC2MD_BIN` / `DOC2MD_REPO` / `DOC2MD_PYTHON` or, failing that, PATH and the common
install directories. It reads and writes only the paths it is given, never uses the network itself,
and never decides on your behalf whether scanned pages go to a cloud OCR backend — that is doc2md's
own configuration. Install with `dsh plugin --profile web add github:jessehoo89/markdown_monitor`
(no npm account needed), or pick "manual input" in the DSH desktop market.

## 文档

- **[详细使用说明](docs/USAGE.md)** —— 命令行全参数、图形界面、配置字段逐项说明、
  云端 OCR 多后端链路、安装与打包（含踩过的坑）、空文档与加密文件、注意事项。
- [规则档 PDF 引擎的上游说明](vendor/README.md) —— `vendor/ZhDocParser`。
