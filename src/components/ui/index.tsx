import { useEffect, useRef, type ReactNode } from 'react';
import { play } from '@/audio/sfx';
import type { Appearance } from '@/config/appearance';
import { CHAR_FRAMES, CHAR_H, CHAR_W, renderCharacterSheet } from '@/game/art/characters';
import { iconUrl } from '@/game/art/registry';

/** 픽셀 아이콘 (아이템 ID 또는 텍스처 키) */
export function PixelIcon({ id, size = 32, className = '' }: { id: string; size?: number; className?: string }) {
  const src = iconUrl(id);
  return <img src={src} width={size} height={size} alt="" draggable={false} className={`pixelated inline-block ${className}`} style={{ width: size, height: size, objectFit: 'contain' }} />;
}

export function Gold({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <PixelIcon id="coin" size={18} />
      <span>{value.toLocaleString()}G</span>
    </span>
  );
}

/** 걷는 캐릭터 미리보기 (방향 순환 가능) */
export function CharacterPreview({ appearance, scale = 6, dir = 0, walking = true, className = '' }: {
  appearance: Appearance; scale?: number; dir?: number; walking?: boolean; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const sheetCanvas = renderCharacterSheet(appearance);
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    let frame = 0;
    const seq = [1, 0, 2, 0];
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const f = walking ? seq[frame % 4] : 0;
      ctx.drawImage(sheetCanvas, f * CHAR_W, dir * CHAR_H, CHAR_W, CHAR_H, 0, 0, CHAR_W * scale, CHAR_H * scale);
      frame++;
    };
    draw();
    const t = setInterval(draw, 160);
    return () => clearInterval(t);
  }, [appearance, scale, dir, walking]);
  void CHAR_FRAMES;
  return <canvas ref={ref} width={CHAR_W * scale} height={CHAR_H * scale} className={`pixelated ${className}`} />;
}

export function Modal({ title, icon, onClose, children, width = 560, footer }: {
  title: string; icon?: string; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode;
}) {
  useEffect(() => { play('open'); }, []);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#4a3036]/30 anim-fade p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel anim-pop relative flex max-h-[88vh] w-full flex-col" style={{ maxWidth: width }} role="dialog" aria-label={title}>
        <div className="panel-title absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap px-5 py-2 text-[15px]">
          {icon && <PixelIcon id={icon} size={20} />}
          {title}
        </div>
        <button className="btn btn-pink btn-sm absolute -right-3 -top-3 h-9 w-9 !p-0 text-base" onClick={() => { play('close'); onClose(); }} aria-label="닫기">✕</button>
        <div className="scroll-cute mt-6 overflow-y-auto px-5 pb-4 pt-3">{children}</div>
        {footer && <div className="border-t-2 border-dashed border-[#e2c9a0] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function QtyPicker({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  const set = (v: number) => onChange(Math.max(1, Math.min(max, v)));
  return (
    <div className="flex items-center gap-1">
      <button className="btn btn-cream btn-sm !px-2" onClick={() => set(value - 1)} disabled={value <= 1}>−</button>
      <input
        className="input !w-12 !px-1 !py-1 text-center text-sm"
        value={value}
        inputMode="numeric"
        onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); set(Number.isNaN(n) ? 1 : n); }}
      />
      <button className="btn btn-cream btn-sm !px-2" onClick={() => set(value + 1)} disabled={value >= max}>+</button>
    </div>
  );
}
