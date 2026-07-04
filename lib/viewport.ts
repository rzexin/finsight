// 浮层定位小工具：给定希望居中的 x 坐标与浮层宽度，收敛到视口内，避免贴边溢出。
export function clampCenterX(centerX: number, width: number, margin = 10): number {
  if (typeof window === "undefined") return centerX - width / 2;
  return Math.min(Math.max(centerX - width / 2, margin), window.innerWidth - width - margin);
}
