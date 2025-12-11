# fluent-optimized

Microsoft Fluent Emoji optimized for web applications.

- **Trimmed WebP** — transparent padding removed for better visual alignment
- **Original WebP** — converted without trimming
- **Flat SVG** — color vector variants
- **Skin tone support** — all variants included
- **Emoji map** — JSON with Unicode, cldr names, and keywords

## Install
```bash
npm install fluent-optimized
# or
bun add fluent-optimized
```

## Usage

### Copy to static folder
```bash
cp -r node_modules/fluent-optimized/generated static/emoji
```

Or add postinstall script:
```json
{
  "scripts": {
    "postinstall": "cp -r node_modules/fluent-optimized/generated static/emoji"
  }
}
```

On Windows use `xcopy` or a cross-platform tool like `cpx`.

### Import the map
```javascript
import emojiMap from 'fluent-optimized/map'

// emojiMap['1f44d'] = {
//   unicode: '1f44d',
//   cldr: 'thumbs up',
//   keywords: ['thumbs up', '+1', 'hand', 'thumb', 'up'],
//   hasSkinTones: true,
//   skinTones: ['1f3fb', '1f3fc', '1f3fd', '1f3fe', '1f3ff']
// }
```

### File paths
```
/emoji/3d/trimmed/1f44d.webp        # default
/emoji/3d/trimmed/1f44d-1f3fb.webp  # light skin tone
/emoji/3d/original/1f44d.webp
/emoji/flat/1f44d.svg
```

## Building from source

Requires [Bun](https://bun.sh) and Git.
```bash
git clone https://github.com/troshkindm/fluent-optimized
cd fluent-optimized
bun install
bun run build
```

## License

MIT. Emoji assets from [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT).