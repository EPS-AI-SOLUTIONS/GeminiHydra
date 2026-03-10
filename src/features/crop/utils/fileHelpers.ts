/** Jaskier Shared Pattern */

/** Build crop filename preserving the original extension: `2.png` + crop 1 → `2_crop_1.png` */
export function cropFileName(name: string, cropIndex: number): string {
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx <= 0) return `${name}_crop_${cropIndex}`;
  return `${name.slice(0, dotIdx)}_crop_${cropIndex}${name.slice(dotIdx)}`;
}
