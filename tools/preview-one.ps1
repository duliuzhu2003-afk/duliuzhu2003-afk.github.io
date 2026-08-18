# tools/preview-one.ps1 - single image preview for AI inspection (ASCII only)
# USAGE:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/preview-one.ps1 -File <abs> -OutPath <abs> [-LongEdge 2400]
param(
  [Parameter(Mandatory=$true)][string]$File,
  [Parameter(Mandatory=$true)][string]$OutPath,
  [int]$LongEdge = 2400
)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($File)
$scale = [Math]::Min(1.0, $LongEdge / [double][Math]::Max($src.Width, $src.Height))
$w = [int][Math]::Round($src.Width * $scale)
$h = [int][Math]::Round($src.Height * $scale)
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, 0, 0, $w, $h)
$g.Dispose(); $src.Dispose()
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]90)
$bmp.Save($OutPath, $jpeg, $ep)
$ep.Dispose(); $bmp.Dispose()
Write-Host ("preview done: {0} ({1}x{2})" -f $OutPath, $w, $h)
