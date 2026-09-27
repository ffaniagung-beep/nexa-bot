import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runTool } from './maker-runtime.js'

export async function enhancePhoto(buffer) {
  if (!buffer?.length) throw new Error('EMPTY_IMAGE')
  if (buffer.length > 16 * 1024 * 1024) throw new Error('MEDIA_TOO_LARGE')
  const dir = await mkdtemp(join(tmpdir(), 'nexa-hd-'))
  const input = join(dir, 'input.img'), output = join(dir, 'result.jpg')
  const cleanup = () => rm(dir, { recursive: true, force: true })
  try {
    await writeFile(input, buffer)
    const raw = await runTool('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'json', input], 10000)
    const info = JSON.parse(raw).streams?.[0]
    if (!info?.width || !info?.height) throw new Error('INVALID_IMAGE')
    if (info.width * info.height > 32000000) throw new Error('PIXEL_LIMIT')
    // Denoise before enlarging. Bound output to avoid 8K/12K allocations on a phone.
    const filter = [
      'hqdn3d=1.0:1.0:3.0:3.0',
      "scale=w='max(2,trunc(iw*min(2,4096/max(iw,ih))/2)*2)':h='max(2,trunc(ih*min(2,4096/max(iw,ih))/2)*2)':flags=lanczos",
      'unsharp=5:5:0.65:5:5:0.0', 'eq=contrast=1.035:saturation=1.035'
    ].join(',')
    await runTool('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      '-threads', '1', '-i', input, '-filter_threads', '1', '-vf', filter,
      '-frames:v', '1', '-q:v', '3', '-pix_fmt', 'yuvj420p', '-threads', '1', output], 30000)
    const result = await readFile(output)
    if (!result.length) throw new Error('HD_OUTPUT_EMPTY')
    return { buffer: result, path: output, cleanup }
  } catch (err) { await cleanup(); throw err }
}

// NEXA_PREMIUM_HDPLUS_V2
export async function enhancePhotoPlus(buffer) {
  if (!buffer?.length) throw new Error('EMPTY_IMAGE')
  if (buffer.length > 16 * 1024 * 1024) throw new Error('MEDIA_TOO_LARGE')

  const dir = await mkdtemp(join(tmpdir(), 'nexa-hdplus-v2-'))
  const input = join(dir, 'input.img')
  const output = join(dir, 'result.jpg')
  const cleanup = () => rm(dir, { recursive: true, force: true })

  try {
    await writeFile(input, buffer)

    const raw = await runTool(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'json',
        input
      ],
      10000
    )

    const info = JSON.parse(raw).streams?.[0]
    const width = Number(info?.width) || 0
    const height = Number(info?.height) || 0

    if (!width || !height) throw new Error('INVALID_IMAGE')
    if (width * height > 32000000) throw new Error('PIXEL_LIMIT')

    const maxSafe =
      "min(4,min(6144/max(iw,ih),sqrt(36000000/(iw*ih))))"

    // Biar terasa beda dari HD biasa:
    // kecil -> 4x, menengah -> 3x, agak besar -> 2x, besar -> 1.5x
    const desired =
      "if(gte(max(iw,ih),2200),1.5,if(gte(max(iw,ih),1400),2,if(gte(max(iw,ih),900),3,4)))"

    const factor =
      "min(" + desired + "," + maxSafe + ")"

    const filter = [
      'hqdn3d=0.35:0.35:1.8:1.8',
      (
        "scale=" +
        "w='max(2,trunc(iw*" + factor + "/2)*2)':" +
        "h='max(2,trunc(ih*" + factor + "/2)*2)':" +
        "flags=spline+accurate_rnd+full_chroma_int"
      ),
      'unsharp=9:9:1.45:7:7:0.55',
      'eq=contrast=1.06:saturation=1.08:gamma=1.02',
      'unsharp=5:5:0.55:3:3:0.18'
    ].join(',')

    await runTool(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-nostdin',
        '-y',
        '-threads', '1',
        '-i', input,
        '-filter_threads', '1',
        '-vf', filter,
        '-frames:v', '1',
        '-q:v', '2',
        '-pix_fmt', 'yuvj420p',
        output
      ],
      60000
    )

    const result = await readFile(output)

    if (!result.length) throw new Error('HDPLUS_OUTPUT_EMPTY')
    if (result.length > 32 * 1024 * 1024) {
      throw new Error('HDPLUS_OUTPUT_TOO_LARGE')
    }

    return {
      buffer: result,
      path: output,
      width,
      height,
      cleanup
    }
  } catch (err) {
    await cleanup()
    throw err
  }
}
