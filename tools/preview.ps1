# tools/preview.ps1 - contact sheet generator for AI inspection (ASCII only)
# USAGE:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/preview.ps1 -ProjDir <abs> -OutPath <abs>
param(
  [Parameter(Mandatory=$true)][string]$ProjDir,
  [Parameter(Mandatory=$true)][string]$OutPath,
  [string]$Pattern = ''
)
Add-Type -AssemblyName System.Drawing
$files = [System.IO.Directory]::GetFiles($ProjDir) | Where-Object {
  $_ -match '\.(jpg|jpeg|png)$' -and $_ -notmatch 'cover' -and ($Pattern -eq '' -or $_ -match $Pattern)
} | Sort-Object
if ($files.Count -eq 0) { Write-Host "no images in $ProjDir"; return }

$cellW = 1500; $cellH = 1060
$gap = 16; $cols = 2
$rows = [int][Math]::Ceiling($files.Count / [double]$cols)
$sheetW = $cols * $cellW + ($cols + 1) * $gap
$sheetH = $rows * $cellH + ($rows + 1) * $gap
$sheet = New-Object System.Drawing.Bitmap($sheetW, $sheetH)
$g2 = [System.Drawing.Graphics]::FromImage($sheet)
$g2.Clear([System.Drawing.Color]::FromArgb(255, 249, 249, 247))
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

for ($i = 0; $i -lt $files.Count; $i++) {
  $f = $files[$i]
  $src = [System.Drawing.Image]::FromFile($f)
  $scale = [Math]::Min($cellW / [double]$src.Width, $cellH / [double]$src.Height)
  $w = [int][Math]::Round($src.Width * $scale)
  $h = [int][Math]::Round($src.Height * $scale)
  $col = $i % $cols; $row = [int][Math]::Floor($i / [double]$cols)
  $x = $gap + $col * ($cellW + $gap) + [int](($cellW - $w) / 2)
  $y = $gap + $row * ($cellH + $gap) + [int](($cellH - $h) / 2)
  $g2.DrawImage($src, $x, $y, $w, $h)
  # 图框与文件名（ASCII 显示）
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 17, 17, 17), 2)
  $g2.DrawRectangle($pen, $x, $y, $w, $h)
  $font = New-Object System.Drawing.Font('Arial', 18, [System.Drawing.FontStyle]::Bold)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 17, 17, 17))
  $g2.DrawString(('[' + ($i + 1) + '] ' + [System.IO.Path]::GetFileName($f)), $font, $brush, $x, [Math]::Max(4, $y - 26))
  $src.Dispose(); $pen.Dispose(); $font.Dispose(); $brush.Dispose()
}
$g2.Dispose()
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]88)
$sheet.Save($OutPath, $jpeg, $ep)
$ep.Dispose(); $sheet.Dispose()
Write-Host "sheet done: $OutPath"
