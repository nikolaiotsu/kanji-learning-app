# Logo Optimization Guide

The current `worddexlogo.png` file is 1.4MB, which is quite large for a logo and can cause performance issues.

## Recommended Optimizations:

### 1. Resize the Image
- Current size is likely much larger than needed
- Recommended size: 240x195px (3x the display size of 80x65px for high-DPI screens)

### 2. Optimize the PNG
Use one of these tools to reduce file size:

#### Online Tools:
- TinyPNG (https://tinypng.com/)
- Squoosh (https://squoosh.app/)

#### Command Line Tools:
```bash
# Using ImageMagick
magick worddexlogo.png -resize 240x195 -strip -quality 85 worddexlogo-optimized.png

# Using pngquant
pngquant --quality=65-80 worddexlogo.png --output worddexlogo-optimized.png
```

### 3. Consider WebP Format
For even better compression, consider using WebP:
```bash
# Convert to WebP
magick worddexlogo.png -resize 240x195 -quality 80 worddexlogo.webp
```

### 4. Target File Size
- Aim for under 50KB for the logo
- This should reduce loading time significantly

## Implementation
After optimizing, replace the current file in `assets/images/worddexlogo.png` with the optimized version. 