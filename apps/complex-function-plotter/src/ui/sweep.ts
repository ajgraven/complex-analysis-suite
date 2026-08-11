/**
 * Parameter sweep (catalog G4). Pick one named parameter, a real range `[v0, v1]`, and a step count,
 * and see a **small-multiples montage** — a grid of thumbnails, each the map rendered at a different
 * value of that parameter (its real part swept; the imaginary part held). It reuses the live GPU program
 * (`Plot.renderThumbnail`) per cell, so the montage is exactly the current view under a moving parameter.
 * Clicking a cell jumps the live plot to that value, so the sweep doubles as a navigator.
 *
 * The value spacing is the pure {@link sweepValues} (unit tested); {@link renderMontage} builds the grid.
 */

/** `n` evenly-spaced values from `v0` to `v1` inclusive (`n ≥ 2`); `n ≤ 1` yields just `[v0]`. */
export function sweepValues(v0: number, v1: number, n: number): number[] {
  if (n <= 1) return [v0];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(v0 + ((v1 - v0) * i) / (n - 1));
  return out;
}

export interface SweepCell {
  /** Caption, e.g. `a = 0.5`. */
  label: string;
  /** PNG data URL for the thumbnail. */
  url: string;
  /** Jump the live plot to this cell's parameter value. */
  onPick: () => void;
}

/** Render the montage into `grid` as a near-square grid of clickable, captioned thumbnails. */
export function renderMontage(grid: HTMLElement, cells: SweepCell[]): void {
  grid.replaceChildren();
  const cols = Math.max(1, Math.ceil(Math.sqrt(cells.length)));
  grid.style.setProperty("--sweep-cols", String(cols));
  for (const cell of cells) {
    const fig = document.createElement("figure");
    fig.className = "sweep-cell";
    fig.tabIndex = 0;
    const img = document.createElement("img");
    img.src = cell.url;
    img.alt = cell.label;
    const cap = document.createElement("figcaption");
    cap.textContent = cell.label;
    fig.append(img, cap);
    fig.addEventListener("click", cell.onPick);
    fig.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cell.onPick();
      }
    });
    grid.append(fig);
  }
}
