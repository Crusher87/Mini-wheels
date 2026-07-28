import { Vector3 } from "three";
import type { Object3D, OrthographicCamera } from "three";
import type { MarkerSize } from "../persistence/schema";

export const DOM_MARKER_ANCHOR_HEIGHT = 1.378;
export const DOM_MARKER_PLAYER_LIMIT = 10;

const REFERENCE_ORTHOGRAPHIC_HALF_HEIGHT = 13;
const MINIMUM_MARKER_SCALE = 0.78;
const MAXIMUM_MARKER_SCALE = 1.18;
const MINIMUM_CAMERA_ZOOM = 0.000_001;

const PLAYER_SYMBOLS = ["●", "▲", "■", "◆", "★", "✚", "⬟", "✦", "⬢", "⦿"] as const;

interface MarkerRecord {
  root: Object3D;
  readonly element: HTMLDivElement;
  resetting: boolean;
  hidden: boolean;
  pixelX: number;
  pixelY: number;
  scale: number;
}

export function markerSizeMultiplier(markerSize: MarkerSize): number {
  switch (markerSize) {
    case "small":
      return 0.8;
    case "medium":
      return 1;
    case "large":
      return 1.25;
  }
}

function playerSlot(playerNumber: number): number {
  if (
    !Number.isInteger(playerNumber) ||
    playerNumber < 1 ||
    playerNumber > DOM_MARKER_PLAYER_LIMIT
  ) {
    throw new RangeError(`Player number must be an integer from 1 to ${DOM_MARKER_PLAYER_LIMIT}.`);
  }

  return playerNumber - 1;
}

function isVisibleInHierarchy(root: Object3D): boolean {
  let current: Object3D | null = root;
  while (current !== null) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

/**
 * Projects player identity markers into an HTML overlay without adding marker
 * objects to the Three.js scene.
 */
export class DomMarkerSystem {
  private readonly markers: Array<MarkerRecord | undefined> = [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ];
  private readonly projectedAnchor = new Vector3();
  private sizeMultiplier = 1;
  private resetting = false;
  private disposed = false;

  public constructor(
    private readonly camera: OrthographicCamera,
    private readonly overlay: HTMLElement,
  ) {}

  public get markerCount(): number {
    let count = 0;
    for (let index = 0; index < this.markers.length; index += 1) {
      if (this.markers[index] !== undefined) {
        count += 1;
      }
    }
    return count;
  }

  public setMarkerSize(markerSize: MarkerSize): void {
    this.sizeMultiplier = markerSizeMultiplier(markerSize);
    for (const marker of this.markers) {
      if (marker !== undefined) {
        marker.scale = Number.NaN;
      }
    }
  }

  /**
   * Registers or retargets one stable P1-P10 marker.
   */
  public register(playerNumber: number, root: Object3D): void {
    if (this.disposed) {
      throw new Error("Cannot register a marker after DomMarkerSystem disposal.");
    }

    const slot = playerSlot(playerNumber);
    const existing = this.markers[slot];
    if (existing !== undefined) {
      existing.root = root;
      existing.resetting = false;
      return;
    }

    const symbol = PLAYER_SYMBOLS[slot];
    if (symbol === undefined) {
      throw new RangeError(`No identity symbol is configured for P${playerNumber}.`);
    }

    const document = this.overlay.ownerDocument;
    const element = document.createElement("div");
    const symbolElement = document.createElement("span");
    const labelElement = document.createElement("span");

    element.className = "player-marker";
    element.dataset["player"] = String(playerNumber);
    element.dataset["symbol"] = symbol;
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");

    symbolElement.className = "player-marker__symbol";
    symbolElement.textContent = symbol;
    symbolElement.setAttribute("aria-hidden", "true");

    labelElement.className = "player-marker__label";
    labelElement.textContent = `P${playerNumber}`;

    element.append(symbolElement, labelElement);
    this.overlay.append(element);

    this.markers[slot] = {
      root,
      element,
      resetting: false,
      hidden: true,
      pixelX: Number.NaN,
      pixelY: Number.NaN,
      scale: Number.NaN,
    };
  }

  /**
   * Removes a player's marker. Calling this for an unregistered player is safe.
   */
  public deregister(playerNumber: number): void {
    const slot = playerSlot(playerNumber);
    const marker = this.markers[slot];
    if (marker === undefined) {
      return;
    }

    marker.element.remove();
    this.markers[slot] = undefined;
  }

  /**
   * Hides all markers during an atomic world reset.
   */
  public setResetting(resetting: boolean): void {
    this.resetting = resetting;
    if (!resetting) {
      return;
    }

    for (let index = 0; index < this.markers.length; index += 1) {
      const marker = this.markers[index];
      if (marker !== undefined) {
        this.setHidden(marker, true);
      }
    }
  }

  /**
   * Allows individual cars to hide their marker while being recovered/replaced.
   */
  public setPlayerResetting(playerNumber: number, resetting: boolean): void {
    const marker = this.markers[playerSlot(playerNumber)];
    if (marker === undefined) {
      return;
    }

    marker.resetting = resetting;
    if (resetting) {
      this.setHidden(marker, true);
    }
  }

  /**
   * Updates screen positions after interpolated car and camera transforms.
   *
   * The optional argument supports callers that already have reset state in
   * their frame loop; otherwise `setResetting` controls global visibility.
   */
  public update(resetInProgress = this.resetting): void {
    if (this.disposed) {
      return;
    }

    const width = this.overlay.clientWidth;
    const height = this.overlay.clientHeight;
    if (resetInProgress || width <= 0 || height <= 0) {
      this.hideAll();
      return;
    }

    this.camera.updateWorldMatrix(true, false);
    const markerScale = this.calculateMarkerScale();

    for (let index = 0; index < this.markers.length; index += 1) {
      const marker = this.markers[index];
      if (marker === undefined) {
        continue;
      }

      if (marker.resetting || !isVisibleInHierarchy(marker.root)) {
        this.setHidden(marker, true);
        continue;
      }

      marker.root.updateWorldMatrix(true, false);
      this.projectedAnchor.setFromMatrixPosition(marker.root.matrixWorld);
      this.projectedAnchor.y += DOM_MARKER_ANCHOR_HEIGHT;
      this.projectedAnchor.project(this.camera);

      if (!this.isOnScreen()) {
        this.setHidden(marker, true);
        continue;
      }

      const pixelX = Math.round((this.projectedAnchor.x * 0.5 + 0.5) * width);
      const pixelY = Math.round((-this.projectedAnchor.y * 0.5 + 0.5) * height);
      this.positionMarker(marker, pixelX, pixelY, markerScale);
      this.setHidden(marker, false);
    }
  }

  public clear(): void {
    for (let index = 0; index < this.markers.length; index += 1) {
      const marker = this.markers[index];
      if (marker !== undefined) {
        marker.element.remove();
        this.markers[index] = undefined;
      }
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.clear();
  }

  private calculateMarkerScale(): number {
    const zoom = Math.max(Math.abs(this.camera.zoom), MINIMUM_CAMERA_ZOOM);
    const halfHeight = Math.abs(this.camera.top - this.camera.bottom) / (2 * zoom);
    if (!Number.isFinite(halfHeight) || halfHeight <= 0) {
      return 1;
    }

    return (
      Math.min(
        MAXIMUM_MARKER_SCALE,
        Math.max(MINIMUM_MARKER_SCALE, Math.sqrt(REFERENCE_ORTHOGRAPHIC_HALF_HEIGHT / halfHeight)),
      ) * this.sizeMultiplier
    );
  }

  private hideAll(): void {
    for (let index = 0; index < this.markers.length; index += 1) {
      const marker = this.markers[index];
      if (marker !== undefined) {
        this.setHidden(marker, true);
      }
    }
  }

  private isOnScreen(): boolean {
    return (
      Number.isFinite(this.projectedAnchor.x) &&
      Number.isFinite(this.projectedAnchor.y) &&
      Number.isFinite(this.projectedAnchor.z) &&
      this.projectedAnchor.x >= -1 &&
      this.projectedAnchor.x <= 1 &&
      this.projectedAnchor.y >= -1 &&
      this.projectedAnchor.y <= 1 &&
      this.projectedAnchor.z >= -1 &&
      this.projectedAnchor.z <= 1
    );
  }

  private positionMarker(
    marker: MarkerRecord,
    pixelX: number,
    pixelY: number,
    scale: number,
  ): void {
    if (marker.pixelX === pixelX && marker.pixelY === pixelY && marker.scale === scale) {
      return;
    }

    marker.pixelX = pixelX;
    marker.pixelY = pixelY;
    marker.scale = scale;
    marker.element.style.transform =
      `translate3d(${String(pixelX)}px, ${String(pixelY)}px, 0) ` +
      `translate(-50%, -100%) scale(${String(scale)})`;
  }

  private setHidden(marker: MarkerRecord, hidden: boolean): void {
    if (marker.hidden === hidden) {
      return;
    }

    marker.hidden = hidden;
    marker.element.hidden = hidden;
  }
}
