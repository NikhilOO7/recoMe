const COLORS = ['#6366f1', '#8b5cf6', '#10b981', '#06b6d4', '#f59e0b', '#ef4444', '#ec4899'];

export function showConfetti(): void {
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483646;overflow:hidden;';
  document.body.appendChild(container);

  const count = 22;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    const x = 20 + Math.random() * 60; // keep pieces somewhat centered
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
    const size = 6 + Math.random() * 7;
    const delay = Math.random() * 350;
    const duration = 900 + Math.random() * 500;
    const tx = (Math.random() - 0.5) * 220;
    const isCircle = Math.random() > 0.5;

    piece.style.cssText = [
      `position:absolute`,
      `left:${x}%`,
      `top:75%`,
      `width:${size}px`,
      `height:${size}px`,
      `background:${color}`,
      `border-radius:${isCircle ? '50%' : '2px'}`,
      `--recome-tx:${tx}px`,
      `animation:recome-confetti ${duration}ms ${delay}ms ease-out forwards`,
    ].join(';');

    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 1800);
}
