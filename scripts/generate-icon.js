const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height) {
  // 生成 128x128 RGBA 渐变图标，中心带发光圆环
  const bytesPerPixel = 4;
  const scanlineLength = width * bytesPerPixel + 1; // +1 for filter type byte
  const rawData = Buffer.alloc(scanlineLength * height);

  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.42;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * bytesPerPixel;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r) {
        // 内圈渐变：从左上 #38bdf8 到右下 #0284c7
        const factor = (x + y) / (width + height);
        const rVal = Math.round(2 + factor * 54);
        const gVal = Math.round(132 + factor * 57);
        const bVal = Math.round(199 + factor * 49);

        // 如果在中心核心发光区域
        if (dist <= r * 0.35) {
          rawData[pxOffset] = 240;
          rawData[pxOffset + 1] = 250;
          rawData[pxOffset + 2] = 255;
          rawData[pxOffset + 3] = 255;
        } else {
          rawData[pxOffset] = rVal;
          rawData[pxOffset + 1] = gVal;
          rawData[pxOffset + 2] = bVal;
          rawData[pxOffset + 3] = 255;
        }
      } else if (dist <= r + 3) {
        // 抗锯齿边缘
        const alpha = Math.max(0, Math.min(255, Math.round((1 - (dist - r) / 3) * 255)));
        rawData[pxOffset] = 2;
        rawData[pxOffset + 1] = 132;
        rawData[pxOffset + 2] = 199;
        rawData[pxOffset + 3] = alpha;
      } else {
        // 完全透明
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);

    // 计算 CRC32
    let c = 0xffffffff;
    const chunkTypeAndData = buf.subarray(4, 8 + len);
    for (let i = 0; i < chunkTypeAndData.length; i++) {
      c ^= chunkTypeAndData[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
      }
    }
    buf.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + len);
    return buf;
  }

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const targetDir = path.join(__dirname, '..', 'electron', 'assets');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const iconBuffer = createPng(128, 128);
fs.writeFileSync(path.join(targetDir, 'icon.png'), iconBuffer);
console.log('Successfully created electron/assets/icon.png');
