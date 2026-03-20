/**
 * Icon Resizer sub-app
 *
 * Resizes a 1024x1024 PNG to all required iOS app icon sizes.
 * Returns a ZIP archive containing all resized icons.
 *
 * Mount: app.route('/api', iconsApp)
 */
import { Hono } from 'hono';
import sharp from 'sharp';
import archiver from 'archiver';
import { PassThrough } from 'stream';

const app = new Hono();

/** All required iOS icon sizes in pixels */
const ICON_SIZES = [29, 40, 57, 58, 76, 80, 87, 114, 120, 152, 167, 171, 180, 1024];

/**
 * Resize a 1024x1024 PNG to all iOS icon sizes and return as ZIP.
 *
 * @route POST /icons/resize
 * @param {File} file - PNG image (must be 1024x1024)
 * @returns {Response} ZIP file containing all icon sizes
 * @throws {400} If no file, not PNG, or wrong dimensions
 * @throws {500} On processing failure
 */
app.post('/icons/resize', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No PNG file provided' }, 400);
    }

    if (file.type !== 'image/png') {
      return c.json({ error: 'File must be a PNG image' }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer).metadata();

    if (metadata.width !== 1024 || metadata.height !== 1024) {
      return c.json({ error: `Image must be 1024x1024. Got ${metadata.width}x${metadata.height}` }, 400);
    }

    const passthrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(passthrough);

    for (const size of ICON_SIZES) {
      const resized = await sharp(buffer)
        .resize(size, size, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();
      archive.append(resized, { name: `icon-${size}x${size}.png` });
    }

    await archive.finalize();

    return new Response(passthrough, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="app-icons.zip"'
      }
    });
  } catch (err) {
    console.error('Icon resize error:', err);
    return c.json({ error: 'Failed to resize icons' }, 500);
  }
});

export { ICON_SIZES };
export default app;
