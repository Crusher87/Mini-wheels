import {
  TRACK_SURFACE_COOLDOWN_MAXIMUM_SECONDS,
  TRACK_SURFACE_COOLDOWN_MINIMUM_SECONDS,
  TRACK_SURFACE_STRENGTH_MAXIMUM,
  TRACK_SURFACE_STRENGTH_MINIMUM,
  type TrackSurface,
} from "../../maps/MapDocument";

export interface AuthoredSurfaceContact {
  readonly surface: TrackSurface;
  readonly strength: number;
  readonly cooldownSeconds: number;
}

export interface SurfaceContactFrame {
  readonly dominantSurface: TrackSurface | null;
  readonly supportingWheelCount: number;
  readonly frictionSlipMultiplier: number;
  readonly sideGripMultiplier: number;
  readonly slowStrength: number;
  readonly triggerBoost: boolean;
  readonly boostStrength: number;
  readonly triggerBounce: boolean;
  readonly bounceStrength: number;
  readonly triggerHazard: boolean;
  readonly hazardStrength: number;
}

export const AUTHORED_SURFACE_PRESETS = Object.freeze({
  slippery: Object.freeze({ frictionSlipMultiplier: 0.35, sideGripMultiplier: 0.3 }),
  sticky: Object.freeze({ frictionSlipMultiplier: 1.3, sideGripMultiplier: 1.4 }),
  slow: Object.freeze({ dampingPerSecond: 2.8 }),
  boost: Object.freeze({ deltaSpeed: 5.5, cooldownSeconds: 0.35 }),
  bouncy: Object.freeze({ minimumVerticalSpeed: 6.5, cooldownSeconds: 0.65 }),
  hazard: Object.freeze({ speedMultiplier: 0.38, yawImpulse: 4.5, cooldownSeconds: 0.9 }),
  gripClamp: Object.freeze({ minimum: 0.25, maximum: 1.5 }),
});

const DOMINANCE_PRIORITY: readonly TrackSurface[] = Object.freeze([
  "hazard",
  "boost",
  "bouncy",
  "slow",
  "sticky",
  "slippery",
  "normal",
]);

interface EdgeState {
  touching: boolean;
  cooldownSeconds: number;
}

/**
 * Resolves authored road contacts at the fixed simulation boundary.
 *
 * Every supporting wheel has equal weight because Rapier's ray-cast vehicle
 * API exposes contact state but no stable per-wheel normal load. Grip is the
 * bounded mean of those contacts; slow strength is its supporting-wheel
 * fraction. Impulse surfaces trigger only on a contact edge and respect their
 * own deterministic cooldown.
 */
export class SurfaceContactSystem {
  private readonly boost: EdgeState = { touching: false, cooldownSeconds: 0 };
  private readonly bounce: EdgeState = { touching: false, cooldownSeconds: 0 };
  private readonly hazard: EdgeState = { touching: false, cooldownSeconds: 0 };

  public step(
    wheelSurfaces: readonly (AuthoredSurfaceContact | null)[],
    fixedDeltaSeconds: number,
  ): SurfaceContactFrame {
    const contacts = wheelSurfaces.filter(
      (contact): contact is AuthoredSurfaceContact => contact !== null,
    );
    const counts = new Map<TrackSurface, number>();
    let frictionSlipTotal = 0;
    let sideGripTotal = 0;
    let slowContacts = 0;

    for (const contact of contacts) {
      const { surface } = contact;
      const strength = clampStrength(contact.strength);
      counts.set(surface, (counts.get(surface) ?? 0) + 1);
      const grip = gripForSurface(surface, strength);
      frictionSlipTotal += grip.frictionSlipMultiplier;
      sideGripTotal += grip.sideGripMultiplier;
      if (surface === "slow") {
        slowContacts += strength;
      }
    }

    const contactCount = contacts.length;
    const boostProfile = strongestProfile(contacts, "boost");
    const bounceProfile = strongestProfile(contacts, "bouncy");
    const hazardProfile = strongestProfile(contacts, "hazard");
    const triggerBoost = this.updateEdge(
      this.boost,
      boostProfile !== null,
      boostProfile?.cooldownSeconds ?? AUTHORED_SURFACE_PRESETS.boost.cooldownSeconds,
      fixedDeltaSeconds,
    );
    const triggerBounce = this.updateEdge(
      this.bounce,
      bounceProfile !== null,
      bounceProfile?.cooldownSeconds ?? AUTHORED_SURFACE_PRESETS.bouncy.cooldownSeconds,
      fixedDeltaSeconds,
    );
    const triggerHazard = this.updateEdge(
      this.hazard,
      hazardProfile !== null,
      hazardProfile?.cooldownSeconds ?? AUTHORED_SURFACE_PRESETS.hazard.cooldownSeconds,
      fixedDeltaSeconds,
    );

    return {
      dominantSurface: dominantSurface(counts),
      supportingWheelCount: contactCount,
      frictionSlipMultiplier: contactCount === 0 ? 1 : clampGrip(frictionSlipTotal / contactCount),
      sideGripMultiplier: contactCount === 0 ? 1 : clampGrip(sideGripTotal / contactCount),
      slowStrength: contactCount === 0 ? 0 : slowContacts / contactCount,
      triggerBoost,
      boostStrength: triggerBoost ? (boostProfile?.strength ?? 1) : 0,
      triggerBounce,
      bounceStrength: triggerBounce ? (bounceProfile?.strength ?? 1) : 0,
      triggerHazard,
      hazardStrength: triggerHazard ? (hazardProfile?.strength ?? 1) : 0,
    };
  }

  public reset(): void {
    resetEdge(this.boost);
    resetEdge(this.bounce);
    resetEdge(this.hazard);
  }

  private updateEdge(
    state: EdgeState,
    touching: boolean,
    cooldownSeconds: number,
    fixedDeltaSeconds: number,
  ): boolean {
    state.cooldownSeconds = Math.max(0, state.cooldownSeconds - fixedDeltaSeconds);
    const activated = touching && !state.touching && state.cooldownSeconds <= 0;
    state.touching = touching;
    if (activated) {
      state.cooldownSeconds = cooldownSeconds;
    }
    return activated;
  }
}

function gripForSurface(
  surface: TrackSurface,
  strength: number,
): {
  readonly frictionSlipMultiplier: number;
  readonly sideGripMultiplier: number;
} {
  if (surface === "slippery") {
    return scaleGrip(AUTHORED_SURFACE_PRESETS.slippery, strength);
  }
  if (surface === "sticky") {
    return scaleGrip(AUTHORED_SURFACE_PRESETS.sticky, strength);
  }
  return { frictionSlipMultiplier: 1, sideGripMultiplier: 1 };
}

function scaleGrip(
  grip: { readonly frictionSlipMultiplier: number; readonly sideGripMultiplier: number },
  strength: number,
): { readonly frictionSlipMultiplier: number; readonly sideGripMultiplier: number } {
  return {
    frictionSlipMultiplier: 1 + (grip.frictionSlipMultiplier - 1) * strength,
    sideGripMultiplier: 1 + (grip.sideGripMultiplier - 1) * strength,
  };
}

function strongestProfile(
  contacts: readonly AuthoredSurfaceContact[],
  surface: TrackSurface,
): AuthoredSurfaceContact | null {
  let selected: AuthoredSurfaceContact | null = null;
  let cooldownSeconds = 0;
  for (const contact of contacts) {
    if (contact.surface !== surface) {
      continue;
    }
    const strength = clampStrength(contact.strength);
    cooldownSeconds = Math.max(
      cooldownSeconds,
      Math.min(
        TRACK_SURFACE_COOLDOWN_MAXIMUM_SECONDS,
        Math.max(TRACK_SURFACE_COOLDOWN_MINIMUM_SECONDS, contact.cooldownSeconds),
      ),
    );
    if (selected === null || strength > selected.strength) {
      selected = { ...contact, strength };
    }
  }
  return selected === null ? null : { ...selected, cooldownSeconds };
}

function clampStrength(value: number): number {
  return Math.min(TRACK_SURFACE_STRENGTH_MAXIMUM, Math.max(TRACK_SURFACE_STRENGTH_MINIMUM, value));
}

function clampGrip(value: number): number {
  return Math.min(
    AUTHORED_SURFACE_PRESETS.gripClamp.maximum,
    Math.max(AUTHORED_SURFACE_PRESETS.gripClamp.minimum, value),
  );
}

function dominantSurface(counts: ReadonlyMap<TrackSurface, number>): TrackSurface | null {
  let selected: TrackSurface | null = null;
  let selectedCount = 0;
  for (const surface of DOMINANCE_PRIORITY) {
    const count = counts.get(surface) ?? 0;
    if (count > selectedCount) {
      selected = surface;
      selectedCount = count;
    }
  }
  return selected;
}

function resetEdge(state: EdgeState): void {
  state.touching = false;
  state.cooldownSeconds = 0;
}
