import { readdir, stat, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { $ } from 'bun'
import sharp from 'sharp'

const REPO_URL = 'https://github.com/microsoft/fluentui-emoji.git'
const CLONE_PATH = './fluentui-emoji'
const ASSETS_PATH = join(CLONE_PATH, 'assets')
const OUTPUT_PATH = './generated'
const BATCH_SIZE = 200
const TEMP_DIR = join(OUTPUT_PATH, 'temp_batches')

sharp.cache(false)
sharp.simd(false)

interface EmojiMetadata {
    cldr: string
    glyph: string
    unicode: string
    keywords: string[]
    unicodeSkintones?: string[]
}

interface EmojiEntry {
    unicode: string
    cldr: string
    keywords: string[]
    hasSkinTones: boolean
    skinTones?: string[]
}

const SKIN_TONE_FOLDERS: Record<string, string> = {
    'Default': '',
    'Light': '1f3fb',
    'Medium-Light': '1f3fc',
    'Medium': '1f3fd',
    'Medium-Dark': '1f3fe',
    'Dark': '1f3ff'
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        const stats = await stat(path)
        return stats.isDirectory()
    } catch {
        return false
    }
}

async function findFileByExt(dirPath: string, ext: string): Promise<string | null> {
    try {
        const files = await readdir(dirPath)
        return files.find(f => f.toLowerCase().endsWith(ext)) || null
    } catch {
        return null
    }
}

async function processPng(pngPath: string, outputName: string): Promise<void> {
    const pngBuffer = Buffer.from(await Bun.file(pngPath).arrayBuffer())

    await sharp(pngBuffer)
        .trim()
        .webp({ quality: 90 })
        .toFile(join(OUTPUT_PATH, '3d/trimmed', `${outputName}.webp`))

    await sharp(pngBuffer)
        .webp({ quality: 90 })
        .toFile(join(OUTPUT_PATH, '3d/original', `${outputName}.webp`))
}

async function processEmoji(folderPath: string): Promise<EmojiEntry | null> {
    const metadataPath = join(folderPath, 'metadata.json')
    let metadata: EmojiMetadata
    try {
        metadata = await Bun.file(metadataPath).json()
    } catch {
        return null
    }

    const baseUnicode = metadata.unicode.toLowerCase().replace(/\s+/g, '-')
    const skinTones: string[] = []
    const threeDPath = join(folderPath, '3D')

    if (await isDirectory(threeDPath)) {
        const contents = await readdir(threeDPath)
        const hasSkinToneFolders = contents.some(name => Object.keys(SKIN_TONE_FOLDERS).includes(name))

        if (hasSkinToneFolders) {
            for (const [skinFolder, skinSuffix] of Object.entries(SKIN_TONE_FOLDERS)) {
                const skinPath = join(threeDPath, skinFolder)
                if (await isDirectory(skinPath)) {
                    const pngFile = await findFileByExt(skinPath, '.png')
                    if (pngFile) {
                        const outputName = skinSuffix ? `${baseUnicode}-${skinSuffix}` : baseUnicode
                        await processPng(join(skinPath, pngFile), outputName)
                        if (skinSuffix) skinTones.push(skinSuffix)
                    }
                }
            }
        } else {
            const pngFile = await findFileByExt(threeDPath, '.png')
            if (pngFile) {
                await processPng(join(threeDPath, pngFile), baseUnicode)
            }
        }
    }

    const colorPath = join(folderPath, 'Color')
    if (await isDirectory(colorPath)) {
        const defaultPath = join(colorPath, 'Default')
        const targetDir = await isDirectory(defaultPath) ? defaultPath : colorPath
        const svgFile = await findFileByExt(targetDir, '.svg')

        if (svgFile) {
            const source = Bun.file(join(targetDir, svgFile))
            await Bun.write(join(OUTPUT_PATH, 'flat', `${baseUnicode}.svg`), source)
        }
    }

    return {
        unicode: baseUnicode,
        cldr: metadata.cldr,
        keywords: metadata.keywords,
        hasSkinTones: skinTones.length > 0,
        skinTones: skinTones.length > 0 ? skinTones : undefined
    }
}

async function runWorker(batchIndex: number, start: number, end: number, folders: string[]) {
    console.log(`[Worker ${batchIndex}] Processing items ${start} to ${end}...`)

    const batchFolders = folders.slice(start, end)
    const emojiMap: Record<string, EmojiEntry> = {}
    let processed = 0

    for (const folder of batchFolders) {
        const folderPath = join(ASSETS_PATH, folder)
        try {
            const result = await processEmoji(folderPath)
            if (result) {
                emojiMap[result.unicode] = result
                processed++
            }
        } catch (err) {
            console.error(`[Worker ${batchIndex}] Failed on ${folder}`)
        }
    }

    await writeFile(
        join(TEMP_DIR, `batch_${batchIndex}.json`),
        JSON.stringify(emojiMap)
    )

    console.log(`[Worker ${batchIndex}] Done. Processed: ${processed}`)
}

async function orchestrator() {
    const startTime = performance.now()
    const skipDownload = process.argv.includes('--skip-download')

    if (!skipDownload) {
        console.log('cleaning up previous clone...')
        try { await rm(CLONE_PATH, { recursive: true, force: true }) } catch {}
        console.log('cloning repo...')
        await $`git clone --depth 1 ${REPO_URL} ${CLONE_PATH}`.quiet()
    } else {
        if (!(await isDirectory(ASSETS_PATH))) throw new Error('No assets found')
        console.log('skipping download')
    }

    console.log('preparing output...')
    try { await rm(OUTPUT_PATH, { recursive: true, force: true }) } catch {}
    await $`mkdir -p ${join(OUTPUT_PATH, '3d/trimmed')}`.quiet()
    await $`mkdir -p ${join(OUTPUT_PATH, '3d/original')}`.quiet()
    await $`mkdir -p ${join(OUTPUT_PATH, 'flat')}`.quiet()
    await $`mkdir -p ${TEMP_DIR}`.quiet()

    const allFiles = await readdir(ASSETS_PATH)
    const validFolders = []

    console.log('scanning folders...')
    for (const file of allFiles) {
        if (await isDirectory(join(ASSETS_PATH, file))) validFolders.push(file)
    }

    console.log(`Total folders: ${validFolders.length}. Batch size: ${BATCH_SIZE}`)
    const totalBatches = Math.ceil(validFolders.length / BATCH_SIZE)

    for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE
        const end = Math.min((i + 1) * BATCH_SIZE, validFolders.length)

        console.log(`Starting Batch ${i + 1}/${totalBatches} (Files ${start}-${end})`)

        const proc = Bun.spawn({
            cmd: ['bun', 'run', __filename, '--worker', i.toString(), start.toString(), end.toString()],
            stdout: 'inherit',
            stderr: 'inherit'
        })

        const exitCode = await proc.exited
        if (exitCode !== 0) {
            console.error(`Batch ${i + 1} crashed with code ${exitCode}. Continuing next batch...`)
        }
    }

    console.log('Merging results...')
    const finalMap: Record<string, EmojiEntry> = {}
    const tempFiles = await readdir(TEMP_DIR)

    for (const file of tempFiles) {
        if (file.endsWith('.json')) {
            const data = await Bun.file(join(TEMP_DIR, file)).json()
            Object.assign(finalMap, data)
        }
    }

    await Bun.write(join(OUTPUT_PATH, 'emoji-map.json'), JSON.stringify(finalMap, null, 2))
    await rm(TEMP_DIR, { recursive: true, force: true })

    if (!skipDownload) {
        await rm(CLONE_PATH, { recursive: true, force: true })
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    console.log(`Build Complete! Time: ${elapsed}s. Total emojis: ${Object.keys(finalMap).length}`)
}

const args = process.argv.slice(2)
if (args.includes('--worker')) { // @ts-ignore
    const batchIndex = parseInt(args[args.indexOf('--worker') + 1]) // @ts-ignore
    const start = parseInt(args[args.indexOf('--worker') + 2]) // @ts-ignore
    const end = parseInt(args[args.indexOf('--worker') + 3])

    readdir(ASSETS_PATH).then(async (files) => {
        const folders = []
        for (const f of files) {
            if (await isDirectory(join(ASSETS_PATH, f))) folders.push(f)
        }
        await runWorker(batchIndex, start, end, folders)
    })
} else {
    orchestrator().catch(console.error)
}