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

// NEXA_PREMIUM_HDPLUS_V1
export async function enhancePhotoPlus(buffer) {
  if (!buffer?.length) throw new Error('EMPTY_IMAGE')
  if (buffer.length > 16 * 1024 * 1024) throw new Error('MEDIA_TOO_LARGE')

  const dir = await mkdtemp(join(tmpdir(), 'nexa-hdplus-'))
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

    const factor =
      "min(4,min(6144/max(iw,ih),sqrt(36000000/(iw*ih))))"

    const filter = [
      'hqdn3d=0.85:0.85:2.6:2.6',
      (
        "scale=" +
        "w='max(2,trunc(iw*" + factor + "/2)*2)':" +
        "h='max(2,trunc(ih*" + factor + "/2)*2)':" +
        "flags=lanczos"
      ),
      'unsharp=7:7:0.8:5:5:0.2',
      'eq=contrast=1.045:saturation=1.04:gamma=1.01'
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
        '-threads', '1',
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
