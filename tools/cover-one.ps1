# tools/cover-one.ps1 - convert one cover file to site cover spec (ASCII only)
# Rule: paint #F9F9F7 paper first (transparent PNG safe), center-crop 4:3, resize, save JPG
# USAGE:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/cover-one.ps1 -File <abs> -OutPath <abs> [-Width 1200]
param(
  [Parameter(Mandatory=$true)][string]$File,
  [Parameter(Mandatory=$true)][string]$OutPath,
  [int]$LongEdge = 1200,
  [switch]$NoCrop
)
Add-Type -AssemblyName System.Drawing
$paper = [System.Drawing.ColorTranslator]::FromHtml('#F9F9F7')
$src = [System.Drawing.Image]::FromFile($File)
if ($NoCrop) {
  # 完整图片，不裁剪：等比缩放到长边 LongEdge
  $scale = [Math]::Min(1.0, $LongEdge / [double][Math]::Max($src.Width, $src.Height))
  $w = [int][Math]::Round($src.Width * $scale)
  $h = [int][Math]::Round($src.Height * $scale)
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($paper)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose()
} else {
  # 居中裁剪 4:3
  $cw = [Math]::Min($src.Width, [int][Math]::Floor($src.Height * 4 / 3))
  $ch = [Math]::Min($src.Height, [int][Math]::Floor($src.Width * 3 / 4))
  $x = [int][Math]::Floor(($src.Width - $cw) / 2)
  $y = [int][Math]::Floor(($src.Height - $ch) / 2)
  $height = [int][Math]::Round($LongEdge * 3 / 4)
  $bmp = New-Object System.Drawing.Bitmap($LongEdge, $height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($paper)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $dst = New-Object System.Drawing.Rectangle(0, 0, $LongEdge, $height)
  $srcRect = New-Object System.Drawing.Rectangle($x, $y, $cw, $ch)
  $g.DrawImage($src, $dst, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
}
$src.Dispose()
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]85)
$bmp.Save($OutPath, $jpeg, $ep)
$ep.Dispose()
Write-Host ("cover done: {0} ({1}x{2})" -f $OutPath, $bmp.Width, $bmp.Height)
$bmp.Dispose()
