let worker;
let job = 0;
export async function extractGarment(source, category, onProgress) {
  worker ||= new Worker(new URL('./segment-worker.js', import.meta.url), { type:'module' });
  const id = ++job;
  const masks = await new Promise((resolve,reject) => {
    const timer = setTimeout(() => finish(new Error('Model download timed out. Please retry with an internet connection.')), 240000);
    function finish(error, result) { clearTimeout(timer); worker.removeEventListener('message', receive); worker.removeEventListener('error', fail); error ? reject(error) : resolve(result); }
    function receive({data}) { if(data.id !== id)return; if(data.progress)onProgress(data.progress); else finish(data.error ? new Error(data.error) : null,data.masks); }
    function fail(){finish(new Error('Clothing model could not load. Check your connection and retry.')); worker.terminate(); worker=null;}
    worker.addEventListener('message',receive); worker.addEventListener('error',fail); worker.postMessage({id,image:source});
  });
  const labels = {shirt:['Upper-clothes','Coat'],tshirt:['Upper-clothes'],dress:['Dress'],pants:['Pants','Skirt'],shoes:['Left-shoe','Right-shoe'],accessory:['Bag','Scarf','Belt','Hat'],watch:[]}[category] || [];
  const selected = masks.filter(m => labels.includes(m.label));
  if(!selected.length)throw new Error('No garment found for this category. Try a clearer photo or select a different category.');
  const bitmap = await createImageBitmap(await (await fetch(source)).blob());
  const canvas=document.createElement('canvas'); canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  let minX=canvas.width,minY=canvas.height,maxX=0,maxY=0,count=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const alpha=selected.some(m => m.data[(Math.min(m.height-1,Math.floor(y*m.height/canvas.height))*m.width+Math.min(m.width-1,Math.floor(x*m.width/canvas.width)))*m.channels]>127);
    if(!alpha)pixels.data[(y*canvas.width+x)*4+3]=0;
    else {minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;}
  }
  if(count<100)throw new Error('The garment is too small to extract. Try a closer photograph.');
  ctx.putImageData(pixels,0,0);
  const crop=document.createElement('canvas');crop.width=maxX-minX+17;crop.height=maxY-minY+17;
  crop.getContext('2d').drawImage(canvas,minX,minY,maxX-minX+1,maxY-minY+1,8,8,maxX-minX+1,maxY-minY+1);
  return crop.toDataURL('image/png');
}
