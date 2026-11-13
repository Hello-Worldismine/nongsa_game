/** 개발용 스프라이트 갤러리 (주소 뒤에 ?gallery 를 붙이면 열림) */
import { useEffect, useRef } from 'react';
import { HAIR_STYLES, OUTFIT_STYLES, type Appearance } from '@/config/appearance';
import { renderCharacterSheet } from '@/game/art/characters';
import { buildAllArt } from '@/game/art/registry';

function Canvas({ src, scale = 3 }: { src: HTMLCanvasElement; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(src, 0, 0, src.width * scale, src.height * scale);
  }, [src, scale]);
  return <canvas ref={ref} width={src.width * scale} height={src.height * scale} style={{ imageRendering: 'pixelated' }} />;
}

export default function ArtGallery() {
  const q = new URLSearchParams(location.search);
  const scale = Number(q.get('scale') ?? 3);
  const filter = q.get('f') ?? '';
  const looks: Appearance[] = HAIR_STYLES.map((_, i) => ({ hair: i, hairColor: i % 8, skin: i % 5, outfit: i % OUTFIT_STYLES.length, outfitColor: (i * 3) % 8 }));
  const art = Object.entries(buildAllArt()).filter(([k]) => k.includes(filter));
  return (
    <div style={{ background: '#a7d77a', minHeight: '100vh', padding: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
      {(filter === '' || filter === 'char') && looks.map((a, i) => (
        <div key={i} style={{ background: '#ffffff40', padding: 4 }}><Canvas src={renderCharacterSheet(a)} scale={scale} /></div>
      ))}
      {filter !== 'char' && art.map(([k, v]) => (
        <div key={k} style={{ background: '#ffffff30', padding: 2, fontSize: 9, textAlign: 'center' }}>
          <Canvas src={v.canvas} scale={scale} />
          <div>{k}</div>
        </div>
      ))}
    </div>
  );
}
