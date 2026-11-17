$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
foreach ($entry in @(@('icon-192.png',192),@('icon-512.png',512),@('icon-maskable.png',512),@('apple-touch-icon.png',180))) {
    $size = [int]$entry[1]
    $bitmap = [Drawing.Bitmap]::new($size,$size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#02080e'))
    $rect = [Drawing.Rectangle]::new(0,0,$size,$size)
    $brush = [Drawing.Drawing2D.LinearGradientBrush]::new($rect,[Drawing.ColorTranslator]::FromHtml('#00d2ff'),[Drawing.ColorTranslator]::FromHtml('#0054ff'),[single]65)
    $triangle = [Drawing.PointF[]]@([Drawing.PointF]::new($size*.28,$size*.22),[Drawing.PointF]::new($size*.77,$size*.5),[Drawing.PointF]::new($size*.28,$size*.78))
    $graphics.FillPolygon($brush,$triangle)
    $hole = [Drawing.PointF[]]@([Drawing.PointF]::new($size*.405,$size*.405),[Drawing.PointF]::new($size*.575,$size*.5),[Drawing.PointF]::new($size*.405,$size*.595))
    $dark = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#02080e'))
    $graphics.FillPolygon($dark,$hole)
    $bitmap.Save((Join-Path $PSScriptRoot ('public/'+$entry[0])),[Drawing.Imaging.ImageFormat]::Png)
    $brush.Dispose(); $dark.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
