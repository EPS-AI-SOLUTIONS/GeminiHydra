/**
 * Rotate a base64-encoded image by the given degrees (90, 180, 270) using Canvas API.
 * Returns a new base64 string (without data URL prefix) encoded as JPEG q=0.92.
 */
export function rotateBase64Image(base64: string, degrees: number, mimeType: string = 'image/jpeg'): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context unavailable'));

      const swap = degrees === 90 || degrees === 270;
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      resolve(dataUrl.split(',')[1]!);
    };
    img.onerror = () => reject(new Error('Failed to load image for rotation'));
    img.src = `data:${mimeType};base64,${base64}`;
  });
}
