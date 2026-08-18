# tools/crop.ps1 - crop panels from ORIGINAL source boards (ASCII only)
# Plan file: CSV lines "projNum,srcIndex,x,y,w,h,outName"
#   - projNum: leading number of the source folder (e.g. 3)
#   - srcIndex: 1-based index of the source file sorted alphabetically (same order as compress.ps1)
#   - x,y,w,h: crop rect in FULL-JPG space (long edge = 3000)
#   - outName: output file name without extension -> images/project-0X/<outName>.jpg
# USAGE:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/crop.ps1 -Plan <csv> -SourceRoot <abs> -OutRoot <abs> [-LongEdge 2400]
param(
  [Parameter(Mandatory=$true)][string]$Plan,
  [Parameter(Mandatory=$true)][string]$SourceRoot,
  [Parameter(Mandatory=$true)][string]$OutRoot,
  [int]$LongEdge = 2400
)
Add-Type -AssemblyName System.Drawing
$paper = [System.Drawing.ColorTranslator]::FromHtml('#F9F9F7')
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }

function Save-Jpeg($bmp, $path, [int]$q) {
  $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$q)
  $bmp.Save($path, $jpeg, $ep)
  $ep.Dispose()
}

$lines = Get-Content $Plan | Where-Object { $_ -match '^\s*\d' }
foreach ($line in $lines) {
  $f = $line.Split(',') | ForEach-Object { $_.Trim() }
  if ($f.Count -lt 7) { Write-Warning "bad line: $line"; continue }
  $proj = $f[0]; $srcIdx = [int]$f[1]
  $x = [double]$f[2]; $y = [double]$f[3]; $w = [double]$f[4]; $h = [double]$f[5]
  $outName = $f[6]
  $projDir = [System.IO.Directory]::GetDirectories($SourceRoot) | Where-Object {
    [regex]::Match([System.IO.Path]::GetFileName($_), '^\s*(\d+)').Groups[1].Value -eq $proj
  } | Select-Object -First 1
  if (-not $projDir) { Write-Warning "project dir not found: $proj"; continue }
  $files = [System.IO.Directory]::GetFiles($projDir) | Where-Object { $_ -match '\.(png|jpe?g|bmp|tiff?|webp)$' } | Sort-Object
  if ($srcIdx -lt 1 -or $srcIdx -gt $files.Count) { Write-Warning "src index out of range: $proj/$srcIdx"; continue }
  $srcPath = $files[$srcIdx - 1]
  $src = [System.Drawing.Image]::FromFile($srcPath)
  # FULL-JPG 坐标(长边3000) -> 原图坐标
  $s = [Math]::Max($src.Width, $src.Height) / 3000.0
  $cx = [int][Math]::Round($x * $s); $cy = [int][Math]::Round($y * $s)
  $cw = [int][Math]::Round($w * $s); $ch = [int][Math]::Round($h * $s)
  if ($cx -lt 0) { $cx = 0 }; if ($cy -lt 0) { $cy = 0 }
  if ($cx + $cw -gt $src.Width) { $cw = $src.Width - $cx }
  if ($cy + $ch -gt $src.Height) { $ch = $src.Height - $cy }
  $crop = New-Object System.Drawing.Bitmap($cw, $ch)
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $g.Clear($paper)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $dst = New-Object System.Drawing.Rectangle(0, 0, $cw, $ch)
  $srcRect = New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)
  $g.DrawImage($src, $dst, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $src.Dispose()
  $sc2 = [Math]::Min(1.0, $LongEdge / [double][Math]::Max($crop.Width, $crop.Height))
  $w2 = [int][Math]::Round($crop.Width * $sc2); $h2 = [int][Math]::Round($crop.Height * $sc2)
  $outBmp = New-Object System.Drawing.Bitmap($w2, $h2)
  $g2 = [System.Drawing.Graphics]::FromImage($outBmp)
  $g2.Clear($paper)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g2.DrawImage($crop, 0, 0, $w2, $h2)
  $g2.Dispose(); $crop.Dispose()
  $outDir = Join-Path $OutRoot ('project-' + $proj.PadLeft(2, '0'))
  [System.IO.Directory]::CreateDirectory($outDir) | Out-Null
  $outPath = Join-Path $outDir ($outName + '.jpg')
  Save-Jpeg $outBmp $outPath 85
  $outBmp.Dispose()
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  Write-Host ("crop done: {0}/{1} ({2}x{3})" -f $proj, $outName, $w2, $h2)
}
Write-Host 'all crops done.'
