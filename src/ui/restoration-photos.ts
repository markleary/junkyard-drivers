/** Download the two matching garage views as one workshop print. Images stay out of localStorage. */
export async function downloadRestorationPhotos(before: string, after: string, name: string, patina: boolean): Promise<boolean> {
  const load = async (src: string) => { const image = new Image(); image.src = src; await image.decode(); return image; };
  const images = await Promise.all([load(before), load(after)]);
  const canvas = document.createElement('canvas'); canvas.width = 1680; canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#e9dec4'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#a34732'; ctx.fillRect(30, 28, 1620, 6);
  ctx.font = '600 19px "IBM Plex Mono", monospace'; ctx.fillText('WILLOW CREEK WORKSHOP / RESTORATION RECORD', 40, 70);
  ctx.fillStyle = '#24332e'; ctx.font = '700 40px "Barlow Condensed", sans-serif'; ctx.fillText(name.toUpperCase(), 40, 119);
  images.forEach((image, index) => {
    const x = 40 + index * 820;
    ctx.fillStyle = '#fff9ea'; ctx.fillRect(x - 8, 140, 796, 640);
    ctx.drawImage(image, x, 148, 780, 585);
    ctx.fillStyle = '#24332e'; ctx.font = '600 17px "IBM Plex Mono", monospace';
    ctx.fillText(index ? (patina ? 'AFTER / PATINA PRESERVED' : 'AFTER / FRESH PAINT') : 'BEFORE / AS FOUND', x + 12, 764);
  });
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `junkyard-drivers-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-restoration.png`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
