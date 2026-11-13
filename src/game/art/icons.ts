/** UI 아이콘 (골드, 도구 등) — 16×16 */
import { PixelGrid } from './pixel';

const OUT = '#4a3036';

export function coin(): PixelGrid {
  const g = new PixelGrid(16, 16);
  g.ellipse(8, 8, 6.5, 6.5, '#f2b83a');
  g.ellipse(8, 8, 5, 5, '#ffd45a');
  g.ellipse(7, 7, 2.6, 2.6, '#ffe58a');
  g.vline(8, 5, 6, '#e09a2a'); g.hline(6, 6, 4, '#e09a2a'); g.hline(6, 10, 4, '#e09a2a');
  g.set(5, 4, '#fff6cc');
  g.outline(OUT, 0.5);
  return g;
}

export function hoe(): PixelGrid {
  const g = new PixelGrid(16, 16);
  g.line(3, 14, 11, 4, '#b8865a'); g.line(4, 14, 12, 4, '#9a6a44');
  g.rect(10, 2, 5, 3, '#a8b4c4'); g.hline(10, 2, 5, '#d8e2ee'); g.vline(14, 2, 5, '#8894a4');
  g.outline(OUT, 0.5);
  return g;
}

export function wateringCan(): PixelGrid {
  const g = new PixelGrid(16, 16);
  g.rect(3, 6, 8, 7, '#7fb8e6'); g.hline(3, 6, 8, '#a8d4f4'); g.hline(3, 12, 8, '#5f98c6');
  g.line(11, 9, 14, 5, '#7fb8e6'); g.rect(13, 3, 3, 2, '#5f98c6');
  g.line(2, 7, 2, 4, '#5f98c6'); g.hline(2, 3, 6, '#5f98c6'); g.vline(7, 3, 3, '#5f98c6');
  g.set(5, 9, '#ffffff');
  g.outline(OUT, 0.5);
  return g;
}

export function basket(): PixelGrid {
  const g = new PixelGrid(16, 16);
  g.rect(2, 7, 12, 7, '#d8a06a'); g.hline(2, 7, 12, '#ecc08a');
  for (let x = 3; x < 14; x += 2) g.vline(x, 8, 5, '#b8804a');
  g.hline(3, 10, 10, '#c08a56');
  g.line(4, 7, 5, 3, '#b8804a'); g.hline(5, 2, 6, '#b8804a'); g.line(11, 3, 12, 7, '#b8804a');
  g.set(6, 6, '#f58a3a'); g.set(9, 6, '#ec4a3e'); g.set(7, 5, '#7cc455');
  g.outline(OUT, 0.5);
  return g;
}

export function bag(): PixelGrid {
  const g = new PixelGrid(16, 16);
  g.ellipse(8, 9.5, 6, 5.5, '#c8905a'); g.rect(4, 3, 8, 4, '#c8905a');
  g.hline(4, 6, 8, '#9a6a44'); g.rect(7, 7, 2, 2, '#ffd84a'); g.set(6, 10, '#e0aa74'); g.set(5, 9, '#e0aa74');
  g.outline(OUT, 0.5);
  return g;
}

export const UI_ICON_ART: Record<string, () => PixelGrid> = {
  coin, 'tool:hoe': hoe, 'tool:watering_can': wateringCan, 'tool:basket': basket, bag,
};
