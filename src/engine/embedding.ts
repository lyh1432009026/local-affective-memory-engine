import { pipeline, env } from '@huggingface/transformers';

// 国内网络镜像加速，首次运行自动拉取 ~130MB ONNX 模型并缓存至本地
const mirror = process.env.HF_MIRROR || 'https://hf-mirror.com';
env.remoteHost = mirror.endsWith('/') ? mirror : `${mirror}/`;

let extractorPromise: Promise<any> | null = null;

export async function embedText(text: string): Promise<Float32Array> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
      dtype: 'q8',
    });
  }
  const extractor = await extractorPromise;
  const output = await extractor(text, { pooling: 'cls', normalize: true });
  return new Float32Array(output.data);
}

/** 计算两个归一化 512 维向量的余弦相似度（用于话题硬切换检测） */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}
