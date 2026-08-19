# tools/crop-strip.ps1 - Crop a fractional region of an image (for reading poster title blocks)
# Usage: powershell -ExecutionPolicy Bypass -File tools/crop-strip.ps1 in.jpg out.png fx fy fw fh
#   fx fy fw fh = region in fractions (0..1), e.g. 0 0 1 0.3 = top 30 percent
# ASCII only (PowerShell 5.1 encoding pitfall).
param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [double]$Fx = 0, [double]$Fy = 0, [double]$Fw = 1, [double]$Fh = 0.3
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile((Resolve-Path $In).Path)
$w = [int]($img.Width * $Fw); $h = [int]($img.Height * $Fh)
$x = [int]($img.Width * $Fx); $y = [int]($img.Height * $Fy)
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$srcRect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
$dstRect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose(); $img.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host ("saved {0} ({1}x{2})" -f $Out, $w, $h)
