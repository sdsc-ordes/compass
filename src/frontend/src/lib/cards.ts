/**
 * The two floating map cards: where they sit, and when they are on screen.
 *
 * Both are HTML boxes pinned to a point on the canvas, so their placement is
 * computed here rather than expressed in CSS — and since the placement lives
 * here, so does the show/hide, which is fiddlier than it looks (see CardLayer).
 */
import type { PinBox } from './types';

/** A card's resting place, in stage pixels, plus which way it points. */
export interface Placement {
  left: number;
  top: number;
  /** True when the card had to go below its point and its tail points up. */
  flip: boolean;
}

/** Clamps the origin so a card centred on it stays on stage — keyboard focus
    walks every pin, including the ones hard against an edge. */
function clampX(x: number, halfWidth: number, W: number): number {
  const half = Math.min(halfWidth, W / 2);
  return Math.max(half, Math.min(W - half, x));
}

/** The hover preview, over the pin's head, flipping below when there is no room. */
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

/** The close-range card, anchored on the projected coordinate itself. */
export function cardPlacement(xy: [number, number], W: number): Placement {
  const above = xy[1] > 160;
  return {
    left: clampX(xy[0], 126, W),
    top: above ? xy[1] - 12 : xy[1] + 12,
    flip: !above,
  };
}

/** Writes a placement onto the card. */
export function applyPlacement(el: HTMLElement, p: Placement): void {
  el.style.left = p.left + 'px';
  el.style.top = p.top + 'px';
  el.classList.toggle('flip', p.flip);
}

/** True when a point is inside the stage by enough for a card to be worth
    drawing. The 80px of slack keeps a card whose pin is just off-stage. */
export function cardOnStage(xy: [number, number] | null, W: number): xy is [number, number] {
  return !!xy && isFinite(xy[0]) && xy[0] >= -80 && xy[0] <= W + 80;
}

/**
 * Owns the two card nodes' visibility.
 *
 * Neither card can simply be toggled: both transition in, and a transition needs
 * a start state, so the node is unhidden one frame before `.show` goes on. Get
 * that order wrong and the card appears without its fade. Stage keeps the
 * decisions — what is hovered, what is selected, how far in the map is — and
 * calls in here with the answer.
 *
 * The nodes arrive as getters, not values: Svelte assigns `bind:this` after this
 * is constructed and nulls it again on destroy.
 */
export class CardLayer {
  constructor(
    private nodes: {
      preview: () => HTMLElement | null;
      card: () => HTMLElement | null;
    },
  ) {}

  /** Puts the preview over its pin, or takes it off screen. Owns `.show`.
      Deliberately does not re-hide: a pin still flying in gets its place next
      frame, and `hidden` would restart the fade. */
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

  /** Unhides the preview so the next frame's placement has something to fade. */
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

  /** The close-range card, at a projected coordinate — or gone, when that
      coordinate has left the stage. */
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
    /* Unhidden a frame before .show, so the transition has a start state. */
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
