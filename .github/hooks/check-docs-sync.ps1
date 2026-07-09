#Requires -Version 5
<#
  Stop hook: after each agent turn, check whether frontend/backend code changed
  without a corresponding update to the docs or skills, and nudge if so.

  Contract: reads hook JSON from stdin (ignored), optionally writes JSON to stdout
  with { continue, systemMessage }. Always exits 0 (non-blocking).
#>
$ErrorActionPreference = 'SilentlyContinue'

# Consume stdin per hook contract (don't block).
try { $null = [Console]::In.ReadToEnd() } catch { }

# Resolve repo root; bail quietly if not a git repo.
$root = git rev-parse --show-toplevel 2>$null
if (-not $root) { exit 0 }
Set-Location $root

# Use UTF-8 paths (avoid octal-escaped non-ASCII like 云南).
$changed = git -c core.quotepath=false status --porcelain 2>$null
if (-not $changed) { exit 0 }

# Extract paths from porcelain lines (cols 0-2 = status, path starts at col 3).
$paths = @()
foreach ($line in $changed) {
  if ($line.Length -lt 4) { continue }
  $p = $line.Substring(3)
  if ($p -match '->') { $p = ($p -split '->')[-1].Trim() }  # renamed: take new name
  $paths += $p.Trim().Trim('"')
}

# What counts as "code/resource" vs "docs/skills".
$codePatterns = @('^api/', '^云南/旅游计划\.html', '^云南/index\.html', '\.github/skills/.+/scripts/')
$docPatterns  = @('^README\.md', '^docs/', '\.github/skills/.+/SKILL\.md')

$codeChanged = $false
$docChanged  = $false
$hits = @()
foreach ($p in $paths) {
  foreach ($c in $codePatterns) { if ($p -match $c) { $codeChanged = $true; $hits += $p; break } }
  foreach ($d in $docPatterns)  { if ($p -match $d) { $docChanged = $true; break } }
}

if ($codeChanged -and -not $docChanged) {
  $list = ($hits | Select-Object -Unique -First 6) -join ', '
  $msg = "📌 文档同步检查：检测到代码/后端改动（$list）但未更新文档或 skill。" +
         "【行动要求】请在本轮结束前，明确询问用户是否需要同步更新相关文档" +
         "（README.md、docs/azure-resources.md、.github/skills/*/SKILL.md），" +
         "列出可能受影响的文件，并在用户明确回复『需要/不需要』之前，不要自动修改任何文档或 skill。" +
         "若用户确认需要，再执行更新；若用户表示不需要或本次改动不影响文档，则跳过。"
  $out = [ordered]@{ continue = $true; systemMessage = $msg }
  Write-Output ($out | ConvertTo-Json -Compress)
}

exit 0
