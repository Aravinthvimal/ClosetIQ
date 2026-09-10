// Run clothing parsing off the UI thread. Photos never leave this worker.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let segmenter;
self.onmessage = async ({ data: { id, image } }) => {
  try {
    segmenter ||= await pipeline('image-segmentation', 'Xenova/segformer_b2_clothes', {
      device: 'wasm', dtype: 'q8',
      progress_callback: p => self.postMessage({ id, progress: p.status === 'progress' ? `Downloading clothing model · ${Math.round(p.progress)}%` : 'Preparing clothing model…' })
    });
    self.postMessage({ id, progress: 'Finding fabric and garment edges…' });
    const output = await segmenter(image);
    const masks = output.filter(x => !['Background','Hair','Face','Left-arm','Right-arm','Left-leg','Right-leg'].includes(x.label))
      .map(x => ({ label:x.label, width:x.mask.width, height:x.mask.height, channels:x.mask.channels, data:x.mask.data }));
    self.postMessage({ id, masks });
  } catch (error) { segmenter = null; self.postMessage({ id, error:error.message }); }
};
