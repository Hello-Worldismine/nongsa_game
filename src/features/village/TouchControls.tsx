import { useEffect, useRef, useState } from 'react';
import { bus } from '@/game/bus';
import { useGame } from '@/stores/gameStore';

/** 터치 기기용 가상 조이스틱 + 상호작용 버튼 (PC 에서는 표시되지 않음) */
export default function TouchControls() {
  const [touch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const set = useGame((s) => s.set);
  useEffect(() => () => set({ touch: { x: 0, y: 0 } }), [set]);
  if (!touch) return null;

  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    setKnob({ x: dx, y: dy });
    const dead = 0.25;
    const nx = Math.abs(dx / max) > dead ? Math.sign(dx) : 0, ny = Math.abs(dy / max) > dead ? Math.sign(dy) : 0;
    set({ touch: { x: nx, y: ny } });
  };
  const end = () => { setKnob({ x: 0, y: 0 }); set({ touch: { x: 0, y: 0 } }); };

  return (
    <>
      <div ref={base} className="pointer-events-auto absolute bottom-[150px] left-5 h-28 w-28 touch-none rounded-full border-4 border-[#c9a274] bg-[#fff8e8]/60"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => { if (e.buttons) move(e); }} onPointerUp={end} onPointerCancel={end}>
        <div className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full border-4 border-[#8a5a3e] bg-[#d39566]"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
      </div>
      <button className="btn btn-gold pointer-events-auto absolute bottom-[170px] right-6 h-16 w-16 rounded-full !p-0 text-lg"
        onPointerDown={(e) => { e.preventDefault(); bus.emit('touch:action'); }}>E</button>
    </>
  );
}
