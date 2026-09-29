import type { PinBox } from './types';

export interface Placement {
  left: number;
  top: number;
  flip: boolean;
}

function clampX(x: number, halfWidth: number, W: number): number {
  const half = Math.min(halfWidth, W / 2);
  return Math.max(half, Math.min(W - half, x));
}

export function previewPlacement(
  box: { x: number; y: number; headR: number; tipY: number },
  W: number,
): Placement {
  const above = box.y - box.headR > 92;
  return {
    left: clampX(box.x, 124, W),
    top: above ? box.y - 8 : box.tipY + 10,
    flip: !above,
  };
}

export function cardPlacement(xy: [number, number], W: number): Placement {
  const above = xy[1] > 160;
  return {
    left: clampX(xy[0], 126, W),
    top: above ? xy[1] - 12 : xy[1] + 12,
    flip: !above,
  };
}

export function applyPlacement(el: HTMLElement, p: Placement): void {
  el.style.left = p.left + 'px';
  el.style.top = p.top + 'px';
  el.classList.toggle('flip', p.flip);
}

export function cardOnStage(xy: [number, number] | null, W: number): xy is [number, number] {
  return !!xy && isFinite(xy[0]) && xy[0] >= -80 && xy[0] <= W + 80;
}

export class CardLayer {
  constructor(
    private nodes: {
      preview: () => HTMLElement | null;
      card: () => HTMLElement | null;
    },
  ) {}

  preview(box: PinBox | undefined, W: number): void {
    const el = this.nodes.preview();
    if (!el) return;
    if (!box) {
      el.classList.remove('show');
      return;
    }
    applyPlacement(el, previewPlacement(box, W));
    el.classList.add('show');
  }

  openPreview(): void {
    const el = this.nodes.preview();
    if (el) el.hidden = false;
  }

  closePreview(): void {
    const el = this.nodes.preview();
    if (!el) return;
    el.classList.remove('show');
    el.hidden = true;
  }

  entry(xy: [number, number] | null, W: number): void {
    const el = this.nodes.card();
    if (!el) return;
    if (!cardOnStage(xy, W)) {
      this.closeEntry();
      return;
    }
    const wasHidden = el.hidden;
    el.hidden = false;
    applyPlacement(el, cardPlacement(xy, W));
    if (wasHidden) requestAnimationFrame(() => el.classList.add('show'));
    else el.classList.add('show');
  }

  closeEntry(): void {
    const el = this.nodes.card();
    if (!el) return;
    el.classList.remove('show');
    el.hidden = true;
  }
}
