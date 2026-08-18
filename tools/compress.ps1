# tools/compress.ps1 - image pipeline (params: docs/03 section 5, docs/05 section 3)
# USAGE:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/compress.ps1 -SourceDir <abs> -OutDir <abs>
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/compress.ps1 -SourceDir <abs> -OutDir <abs> -Placeholder
# NOTE: keep this file ASCII-only (PowerShell 5.1 reads BOM-less UTF-8 as ANSI).
# RULE: paint #F9F9F7 paper first, then save JPG (transparent PNG -> black if skipped).
param(
  [Parameter(Mandatory=$true)][string]$SourceDir,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [switch]$Placeholder
)

Add-Type -AssemblyName System.Drawing

$paper = [System.Drawing.ColorTranslator]::FromHtml('#F9F9F7')
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }

function Save-Jpeg($bmp, $path, [int]$quality = 85) {
  $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
  $bmp.Save($path, $jpeg, $ep)
  $ep.Dispose()
}

# Auto quality: step down until size <= maxKB (dense drawings need lower quality)
function Save-JpegAuto($bmp, $path, [int]$maxKB) {
  foreach ($q in 80, 70, 60, 50) {
    Save-Jpeg $bmp $path $q
    $sizeKB = [int][Math]::Ceiling((Get-Item $path).Length / 1KB)
    if ($sizeKB -le $maxKB) { return }
  }
  # fallback: downscale to 80% long edge and retry
  $w2 = [int][Math]::Round($bmp.Width * 0.8)
  $h2 = [int][Math]::Round($bmp.Height * 0.8)
  $tmp = New-Object System.Drawing.Bitmap($w2, $h2)
  $g = [System.Drawing.Graphics]::FromImage($tmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($bmp, 0, 0, $w2, $h2)
  $g.Dispose()
  foreach ($q in 75, 65, 55) {
    Save-Jpeg $tmp $path $q
    $sizeKB = [int][Math]::Ceiling((Get-Item $path).Length / 1KB)
    if ($sizeKB -le $maxKB) { break }
  }
  $tmp.Dispose()
}

# Full version: paper bg + proportional scale to long edge (one decode per call)
function New-FullImage($srcPath, [int]$longEdge) {
  $src = [System.Drawing.Image]::FromFile($srcPath)
  $scale = [double]$longEdge / [Math]::Max($src.Width, $src.Height)
  $w = [int][Math]::Round($src.Width * $scale)
  $h = [int][Math]::Round($src.Height * $scale)
  if ($w -lt 1) { $w = 1 }; if ($h -lt 1) { $h = 1 }
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($paper)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose(); $src.Dispose()
  return $bmp
}

# Cover version: center-crop 4:3 from the full bitmap (no second decode)
function New-CoverImage($bmpFull, [int]$width) {
  $cw = [Math]::Min($bmpFull.Width, [int][Math]::Floor($bmpFull.Height * 4 / 3))
  $ch = [Math]::Min($bmpFull.Height, [int][Math]::Floor($bmpFull.Width * 3 / 4))
  $x = [int][Math]::Floor(($bmpFull.Width - $cw) / 2)
  $y = [int][Math]::Floor(($bmpFull.Height - $ch) / 2)
  $height = [int][Math]::Round($width * 3 / 4)
  $bmp = New-Object System.Drawing.Bitmap($width, $height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($paper)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $dst = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
  $srcRect = New-Object System.Drawing.Rectangle($x, $y, $cw, $ch)
  $g.DrawImage($bmpFull, $dst, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  return $bmp
}

# Placeholder: halftone dots + label text
function New-Placeholder([string]$path, [int]$w, [int]$h, [string]$note) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($paper)
  $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(110, 17, 17, 17))
  for ($px = 8; $px -lt $w; $px += 16) {
    for ($py = 8; $py -lt $h; $py += 16) { $g.FillEllipse($dotBrush, $px, $py, 2, 2) }
  }
  $font = New-Object System.Drawing.Font('Arial', 32, [System.Drawing.FontStyle]::Bold)
  $txtBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(130, 17, 17, 17))
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, 0, $w, $h)
  $g.DrawString($note, $font, $txtBrush, $rect, $sf)
  $g.Dispose(); $sf.Dispose(); $txtBrush.Dispose(); $font.Dispose(); $dotBrush.Dispose()
  Save-Jpeg $bmp $path 85
  $bmp.Dispose()
}

if ($Placeholder) {
  $outFile = Join-Path $OutDir 'portrait.jpg'
  New-Placeholder $outFile 1200 1500 'PORTRAIT 2026'
  Write-Host "placeholder done: $outFile"
  return
}

$projDirs = [System.IO.Directory]::GetDirectories($SourceDir) | Sort-Object
foreach ($pd in $projDirs) {
  $name = [System.IO.Path]::GetFileName($pd)
  $m = [regex]::Match($name, '^\s*(\d+)')
  if (-not $m.Success) { Write-Warning "skip: $name (no leading number)"; continue }
  $proj = 'project-' + $m.Groups[1].Value.PadLeft(2, '0')
  # NOTE: local var name must differ from $OutDir param (PS is case-insensitive)
  $projOut = Join-Path $OutDir $proj
  [System.IO.Directory]::CreateDirectory($projOut) | Out-Null
  $files = [System.IO.Directory]::GetFiles($pd) | Where-Object { $_ -match '\.(png|jpe?g|bmp|tiff?|webp)$' } | Sort-Object
  $i = 0
  foreach ($f in $files) {
    $i++
    $nn = $i.ToString('D2')
    $fullPath = Join-Path $projOut ($nn + '.jpg')
    $coverPath = Join-Path $projOut ('cover-' + $nn + '.jpg')
    $b1 = New-FullImage $f 3000
    Save-JpegAuto $b1 $fullPath 500
    $b2 = New-CoverImage $b1 1200
    Save-JpegAuto $b2 $coverPath 200
    $b1.Dispose(); $b2.Dispose()
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    Write-Host ("done: {0}/{1}" -f $proj, $nn)
  }
}
Write-Host 'all done.'
