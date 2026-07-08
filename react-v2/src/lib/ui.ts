const MENU_WIDTH = 180;
const MENU_HEIGHT = 220;

export function clampMenuPosition(x: number, y: number): { x: number; y: number } {
  const maxX = window.innerWidth - MENU_WIDTH - 8;
  const maxY = window.innerHeight - MENU_HEIGHT - 8;
  return {
    x: Math.min(x, maxX),
    y: y > maxY ? Math.max(8, y - MENU_HEIGHT) : y,
  };
}
