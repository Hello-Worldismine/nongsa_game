import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { useGame } from '@/stores/gameStore';
import { WorldScene } from './scenes/WorldScene';

/** Phaser 게임 캔버스를 React 안에 붙이는 컴포넌트 */
export default function PhaserGame() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      backgroundColor: '#a8d973',
      banner: false,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      input: { keyboard: true, mouse: true, touch: true },
      scene: [],
    });
    game.scene.add('world', WorldScene, true, { arrival: useGame.getState().arrival });
    (window as unknown as { __game?: Phaser.Game }).__game = game;

    const unsub = useGame.subscribe((s, prev) => {
      if (s.sceneNonce !== prev.sceneNonce) {
        const scene = game.scene.getScene('world');
        scene?.scene.restart({ arrival: s.arrival });
      }
    });
    return () => {
      unsub();
      game.destroy(true);
    };
  }, []);

  return <div ref={host} className="absolute inset-0" data-testid="game-canvas" />;
}
