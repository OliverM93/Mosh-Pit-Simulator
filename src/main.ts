import './ui/styles.css';
import { Game } from './game/Game';

function boot(): void {
  const container = document.getElementById('viewport');
  if (!container) throw new Error('#viewport missing');
  try {
    const game = new Game(container);
    // Handy for debugging in the browser console.
    (window as unknown as { moshpit: Game }).moshpit = game;
  } catch (err) {
    console.error(err);
    document.body.innerHTML =
      '<div style="color:#fff;font-family:monospace;padding:40px">MOSH PIT needs WebGL + Web Audio. Your browser refused: ' + String(err) + '</div>';
  }
}

boot();
