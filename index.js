/**
 * dsh-doc2md —— DeepSeek Harness (dsh) 插件。
 *
 * 注册 `doc2md` 工具，把本地已安装的 doc2md / markdown_monitor 命令行包成模型可调用的能力：
 * 批量把 docx / doc / xls / xlsx / pdf / 图片转成 Markdown，读回产出的 Markdown，
 * 试运行扫描（不写文件），或查看转换统计。
 *
 * 边界（重要，README 里也写了一遍）：
 *   - 本插件**不自带文档解析器**，只是对本地 doc2md CLI 的一层确定性桥接；
 *     文档由那个 CLI 解析，本插件不解析、不联网、不 eval。
 *   - 只会读写你点名给它的路径。扫描件是否上传云端 OCR 取决于 doc2md 自己的
 *     config.json / .env 配置，与本插件无关；本插件不会替它做这个决定。
 *   - 工具参数会进入会话日志，别把含密钥的路径当成秘密。
 *
 * 可用环境变量：
 *   DOC2MD_BIN      doc2md / doc2md.exe 可执行文件的绝对路径（优先级最高）
 *   DOC2MD_REPO     doc2md 源码仓库根目录，用 `python -m doc2md` 方式调用
 *   DOC2MD_PYTHON  DOC2MD_REPO 用的解释器（默认依次找 python3 / python / py）
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-doc2md'

/** 需要一个工具注册表才能干活。 */
export const inject = ['tools']

const IS_WIN = process.platform === 'win32'

const DEFAULT_MAX_CHARS = 200_000
const HARD_MAX_CHARS = 2_000_000
const MAX_SUMMARY_CHARS = 60_000
const MAX_OUTPUT_FILES = 200
const MAX_WALK_ENTRIES = 20_000

const DOC2MD_HINT =
  'Install doc2md (markdown_monitor) and make it reachable, then retry. ' +
  'Options: (a) put doc2md on PATH (Windows installer or `bash install.sh` on Linux), ' +
  '(b) set DOC2MD_BIN to the doc2md executable, or ' +
  '(c) set DOC2MD_REPO to a source checkout so this plugin runs `python -m doc2md`. ' +
  'See https://github.com/jessehoo89/markdown_monitor for install instructions.'

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function isFile(p) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/** 在 PATH（Windows 还会试 PATHEXT 后缀）里找一个可执行文件。 */
function which(cmd) {
  const exts = IS_WIN ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : ['']
  const dirs = (process.env.PATH || '').split(path.delimiter)
  const lower = cmd.toLowerCase()
  for (const dir of dirs) {
    if (!dir) continue
    for (const ext of exts) {
      const name = lower.endsWith(ext.toLowerCase()) ? cmd : cmd + ext
      const full = path.join(dir, name)
      if (isFile(full)) return full
    }
  }
  return null
}

function resolvePython() {
  const fromEnv = (process.env.DOC2MD_PYTHON || '').trim()
  if (fromEnv) return fromEnv
  for (const cand of IS_WIN ? ['py', 'python', 'python3'] : ['python3', 'python']) {
    const hit = which(cand)
    if (hit) return hit
  }
  return null
}

/**
 * 找出实际要调用的命令。返回 null 表示没找到任何可用入口。
 */
function resolveRunner() {
  const explicitBins = []
  const envBin = (process.env.DOC2MD_BIN || '').trim()
  if (envBin) explicitBins.push(envBin)

  for (const raw of explicitBins) {
    // 绝对/相对路径且确实存在 —— 直接用
    if ((raw.includes('/') || raw.includes('\\')) && isFile(raw)) {
      return { cmd: raw, baseArgs: [], label: raw }
    }
    // 只是个命令名 —— 交给 PATH
    if (!raw.includes('/') && !raw.includes('\\')) {
      const hit = which(raw)
      if (hit) return { cmd: hit, baseArgs: [], label: hit }
      return { cmd: raw, baseArgs: [], label: `${raw} (not found on PATH)` }
    }
  }

  // 源码仓库方式：python -m doc2md
  const repo = (process.env.DOC2MD_REPO || '').trim()
  if (repo && existsSync(repo)) {
    const py = resolvePython()
    if (py) {
      return {
        cmd: py,
        baseArgs: ['-m', 'doc2md'],
        cwd: path.resolve(repo),
        label: `${py} -m doc2md  (cwd=${path.resolve(repo)})`,
      }
    }
  }

  // PATH 上的 doc2md
  for (const cand of IS_WIN ? ['doc2md.exe', 'doc2md'] : ['doc2md']) {
    const hit = which(cand)
    if (hit) return { cmd: hit, baseArgs: [], label: hit }
  }

  // 常见安装目录
  const dirs = IS_WIN
    ? [
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'doc2md'),
        process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'doc2md'),
        process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'doc2md'),
      ].filter(Boolean)
    : [path.join(os.homedir(), '.local', 'bin'), '/opt/doc2md', '/usr/local/bin']
  for (const dir of dirs) {
    for (const cand of IS_WIN ? ['doc2md.exe', 'doc2md'] : ['doc2md']) {
      const full = path.join(dir, cand)
      if (isFile(full)) return { cmd: full, baseArgs: [], label: full }
    }
  }

  return null
}

/**
 * 把子进程的字节流解成字符串。
 *
 * 这里必须两种编码都认，原因实测过：
 *   - 源码方式（`python -m doc2md`）会认 PYTHONIOENCODING=utf-8，输出是 UTF-8；
 *   - 打包好的 doc2md.exe（PyInstaller）**不认** PYTHONIOENCODING，无论怎么设，
 *     中文一律按控制台代码页 GBK 输出。
 * 所以先按严格 UTF-8 试解，失败再按 GBK（ASCII 输出两种都能过，不影响）。
 */
function decodeOutput(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    try {
      return new TextDecoder('gbk', { fatal: true }).decode(buf)
    } catch {
      return buf.toString('utf8') // 兜底：按 UTF-8 宽松解，至少不抛
    }
  }
}

/**
 * 跑一次 doc2md，收齐 stdout / stderr。
 *
 * 非零退出码是**正常返回值**（工具契约要求领域失败也走返回路径），由调用方写进文本。
 * 真正的启动失败（ENOENT 之类）才 reject。
 */
function spawnCapture(runner, cliArgs, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(runner.cmd, [...runner.baseArgs, ...cliArgs], {
      cwd: runner.cwd || undefined,
      windowsHide: true,
      signal,
      env: {
        ...process.env,
        // 对源码方式有效，对打包 exe 无效 —— 兜底靠 decodeOutput()
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    })

    // 收 Buffer、最后一次性解码：分块解会把跨块的多字节汉字切坏
    const outChunks = []
    const errChunks = []
    child.stdout.on('data', (chunk) => outChunks.push(chunk))
    child.stderr.on('data', (chunk) => errChunks.push(chunk))

    child.on('error', reject)
    child.on('close', (code, sig) =>
      resolve({
        code,
        sig,
        stdout: decodeOutput(Buffer.concat(outChunks)),
        stderr: decodeOutput(Buffer.concat(errChunks)),
      }),
    )
  })
}

function clip(text, limit) {
  if (text.length <= limit) return text
  return text.slice(0, limit)
}

/** 把模型给的 paths 归一成绝对路径数组（要求绝对路径，避免 cwd 漂移）。 */
function normalizePaths(input) {
  let list = []
  if (Array.isArray(input)) list = input
  else if (typeof input === 'string' && input.trim()) list = input.split(/\r?\n/)

  const out = []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (!path.isAbsolute(trimmed)) {
      throw new Error(
        `doc2md: paths must be absolute (got "${trimmed}"). ` +
          'Resolve the path against the workspace first — relative paths would resolve ' +
          'against the CLI process, not the workspace.',
      )
    }
    out.push(path.normalize(trimmed))
  }
  return out
}

/** 找出这次运行产生的 .md：同目录同名，或目录下递归扫描（只算 run 开始之后写的）。 */
function findOutputs(inputs, sinceMs) {
  const found = new Set()
  let walked = 0

  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (walked++ > MAX_WALK_ENTRIES) return
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!/\.md$/i.test(entry.name)) continue
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (sinceMs != null && st.mtimeMs + 1000 < sinceMs) continue
      found.add(path.resolve(full))
      if (found.size >= MAX_OUTPUT_FILES) return
    }
  }

  for (const input of inputs) {
    let st
    try {
      st = statSync(input)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walk(input)
    } else {
      // 默认 output.mode=alongside：md 与源文件同目录同名
      const sibling = path.join(
        path.dirname(input),
        path.basename(input).replace(/\.[^.]+$/, '') + '.md',
      )
      if (isFile(sibling)) found.add(path.resolve(sibling))
    }
  }
  return [...found].slice(0, MAX_OUTPUT_FILES)
}

/** 把已产出的 md 对应到源文件，供 convert 返回时对照。 */
function summarizeCliResult(title, cliArgs, result, outputs, note) {
  const lines = []
  lines.push(`### ${title}`)
  lines.push(`$ ${['doc2md', ...cliArgs].join(' ')}`)
  lines.push(`exit code: ${result.code}${result.sig ? `  signal: ${result.sig}` : ''}`)
  if (note) lines.push(note)

  if (outputs) {
    if (outputs.length) {
      lines.push(`Markdown produced (${outputs.length}):`)
      for (const item of outputs) {
        lines.push(item.src ? `  - ${item.src}  ->  ${item.md}` : `  - ${item.md}`)
      }
      lines.push('Read any of them back with action "read" and the Markdown path.')
    } else {
      lines.push(
        'Markdown produced: none reported (everything was already up to date, nothing matched, ' +
          'or the run failed — see the CLI output below).',
      )
    }
  }

  const body = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n--- stderr ---\n')
  if (body) {
    lines.push('')
    lines.push(clip(body, MAX_SUMMARY_CHARS))
  }
  return lines.join('\n')
}

/**
 * 解析 `--print-outputs` 打印的清单行：`[out] <源文件>\t<md>`。
 * doc2md ≥ 1.0.3 才有这个开关，所以老版本要走降级路径。
 */
function parseOutputs(stdout) {
  const out = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^\[out\] (.*?)\t(.*)$/.exec(line)
    if (!m) continue
    const md = m[2].trim()
    if (!md || md === '(none)' || md.startsWith('#')) continue
    out.push({ src: m[1].trim(), md })
  }
  return out
}

/** 老版本 doc2md 不认识 --print-outputs：argparse 会在真正干活之前就报错。 */
function isUnknownPrintOutputs(result) {
  return (
    result.code !== 0 &&
    /unrecognized arguments/i.test(result.stderr) &&
    /--print-outputs/.test(result.stderr)
  )
}

function clipText(text, maxChars) {
  if (text.length <= maxChars) return text
  return (
    text.slice(0, maxChars) +
    `\n\n[truncated: showing ${maxChars} of ${text.length} characters — ` +
    'raise maxChars or read the file directly for the rest]'
  )
}

/* ------------------------------------------------------------------ *
 * 插件主体
 * ------------------------------------------------------------------ */

export function apply(ctx) {
  const runner = resolveRunner()
  if (runner) {
    ctx.logger?.info?.(`dsh-doc2md: using ${runner.label}`)
  } else {
    ctx.logger?.warn?.(`dsh-doc2md: doc2md not found yet — ${DOC2MD_HINT}`)
  }

  ctx.tools.register(
    defineTool({
      name: 'doc2md',
      description:
        'Convert local documents to Markdown through the installed doc2md ' +
        '(markdown_monitor) command-line tool. Supports docx / doc / xls / xlsx / pdf / common ' +
        'image formats; scanned or image-only PDFs go through the OCR backends doc2md itself is ' +
        'configured with. Four actions — ' +
        '"convert": run doc2md on the given absolute file/directory paths; each document becomes ' +
        'Markdown at the location the doc2md configuration selects, and the exact source -> Markdown ' +
        'path pairs are reported together with the CLI summary; ' +
        '"read": return the Markdown text of a given .md, or of the .md converted from a given ' +
        'source document (run "convert" first); ' +
        '"scan": dry-run over the configured roots, listing what would convert and through which ' +
        'channel, writing nothing; ' +
        '"status": print conversion statistics from the local state database. ' +
        'Paths must be absolute. The plugin only shells out to the local CLI — it does not parse ' +
        'documents, does not use the network itself, and reads/writes only the paths you pass. ' +
        'Tool arguments are recorded in the session log.',
      parameters: {
        action: {
          type: 'string',
          required: true,
          enum: ['convert', 'read', 'scan', 'status'],
          description: 'Which doc2md operation to run.',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'convert only. Absolute paths of files or directories to convert. Directories are ' +
            'walked recursively for the configured extensions.',
        },
        path: {
          type: 'string',
          description:
            'read only. Absolute path of a .md file, or of a source document whose sibling .md ' +
            'should be read.',
        },
        force: {
          type: 'boolean',
          description: 'convert only. Re-convert even if the state database says it is done.',
        },
        dryRun: {
          type: 'boolean',
          description:
            'convert only. Preview routing and OCR volume without writing any file (adds --dry-run).',
        },
        noOcr: {
          type: 'boolean',
          description:
            'convert / scan only. Disable cloud OCR for this run (local Office and text-PDF ' +
            'conversion are unaffected).',
        },
        limit: {
          type: 'integer',
          description: 'convert / scan only. Process at most this many files (debugging).',
        },
        root: {
          type: 'string',
          description: 'scan only. Absolute directory to scan instead of the configured roots.',
        },
        maxChars: {
          type: 'integer',
          description:
            `read only. Cap the returned Markdown length. Default ${DEFAULT_MAX_CHARS}, ` +
            `ceiling ${HARD_MAX_CHARS}.`,
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        if (!runner) {
          throw new Error(`doc2md: could not locate the doc2md executable. ${DOC2MD_HINT}`)
        }

        switch (args.action) {
          case 'convert': {
            const paths = normalizePaths(args.paths)
            if (paths.length === 0) {
              throw new Error('doc2md: convert needs a non-empty "paths" array of absolute paths.')
            }
            const baseArgs = ['convert', ...paths]
            if (args.force) baseArgs.push('--force')
            if (args.dryRun) baseArgs.push('--dry-run')
            if (args.noOcr) baseArgs.push('--no-ocr')
            if (Number.isInteger(args.limit) && args.limit > 0) {
              baseArgs.push('--limit', String(args.limit))
            }
            baseArgs.push('--quiet')

            const withOutputs = [...baseArgs, '--print-outputs']
            const startedAt = Date.now()
            let cliArgs = withOutputs
            let result = await spawnCapture(runner, withOutputs, exec.signal)
            let outputs
            let note

            if (isUnknownPrintOutputs(result)) {
              // 装的是老版本 doc2md（< 1.0.3）：退回「同名兄弟 md」推断，
              // 并明确告诉模型这只是推断 —— 自定义输出模式下会不准。
              cliArgs = [...baseArgs]
              result = await spawnCapture(runner, cliArgs, exec.signal)
              outputs = args.dryRun ? [] : findOutputs(paths, startedAt).map((md) => ({ md }))
              note =
                '(installed doc2md predates --print-outputs; the paths below are inferred from ' +
                'same-directory .md files and are only reliable when the output mode is "alongside")'
            } else {
              outputs = args.dryRun ? [] : parseOutputs(result.stdout)
            }

            return summarizeCliResult('doc2md convert', cliArgs, result, outputs, note)
          }

          case 'read': {
            if (typeof args.path !== 'string' || !args.path.trim()) {
              throw new Error('doc2md: read needs an absolute "path".')
            }
            if (!path.isAbsolute(args.path.trim())) {
              throw new Error(`doc2md: read path must be absolute (got "${args.path}").`)
            }
            const target = path.normalize(args.path.trim())
            let mdPath = target
            if (!/\.md$/i.test(target)) {
              const sibling = target.replace(/\.[^.]+$/, '') + '.md'
              if (isFile(sibling)) {
                mdPath = sibling
              } else if (isFile(target)) {
                throw new Error(
                  `doc2md: no Markdown found next to ${target} (looked for ${sibling}). ` +
                    'If the doc2md output mode is not "alongside", run action "convert" and read ' +
                    'one of the Markdown paths it reports.',
                )
              }
            }
            if (!isFile(mdPath)) {
              throw new Error(`doc2md: file not found: ${mdPath}`)
            }

            const maxChars = normalizeMaxChars(args.maxChars)
            const text = readFileSync(mdPath, 'utf8').replace(/^\uFEFF/, '')
            return `### ${mdPath}\n\n${clipText(text, maxChars)}`
          }

          case 'scan': {
            const cliArgs = ['scan']
            if (typeof args.root === 'string' && args.root.trim()) {
              if (!path.isAbsolute(args.root.trim())) {
                throw new Error(`doc2md: root must be absolute (got "${args.root}").`)
              }
              cliArgs.push('--root', path.normalize(args.root.trim()))
            }
            if (args.noOcr) cliArgs.push('--no-ocr')
            if (Number.isInteger(args.limit) && args.limit > 0) cliArgs.push('--limit', String(args.limit))
            cliArgs.push('--quiet')

            const result = await spawnCapture(runner, cliArgs, exec.signal)
            return summarizeCliResult('doc2md scan (dry run)', cliArgs, result, null)
          }

          case 'status': {
            const cliArgs = ['status']
            const result = await spawnCapture(runner, cliArgs, exec.signal)
            return summarizeCliResult('doc2md status', cliArgs, result, null)
          }

          default:
            throw new Error(`doc2md: unknown action "${args.action}"`)
        }
      },
    }),
  )
}

function normalizeMaxChars(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return DEFAULT_MAX_CHARS
  const n = Math.floor(value)
  if (n > HARD_MAX_CHARS) {
    throw new Error(`doc2md: maxChars cannot exceed ${HARD_MAX_CHARS}`)
  }
  return n
}
