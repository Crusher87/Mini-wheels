import { describe, expect, it } from "vitest";
import type { RigidBody } from "@dimforge/rapier3d";
import { AuthoredInteractionSystem } from "../../src/gameplay/interactables/AuthoredInteractionSystem";
import { EditorSession } from "../../src/editor/EditorSession";
import { createStarterMapDocument } from "../../src/maps/MapDocument";
import { decodeMapDocument, encodeMapDocument, MapFormatError } from "../../src/maps/MapCodec";

function bodyAt(x: number, y: number, z: number): RigidBody {
  return { translation: () => ({ x, y, z }) } as unknown as RigidBody;
}

describe("AuthoredInteractionSystem", () => {
  it("fires an edge-triggered button link once per entry and again after exit", () => {
    let nextId = 0;
    const createId = () => `interaction-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Links", createId), createId);
    const button = session.placeEntity("interaction.button", [0, 0, 0], {
      elevation: 0,
      primarySize: 2,
      secondarySize: 2,
      yawRadians: 0,
    });
    const door = session.placeEntity("motion.door", [8, 0, 0], {
      elevation: 0,
      primarySize: 4,
      secondarySize: 5,
      yawRadians: 0,
    });
    expect(
      session.addInteractionLink({
        sourceEntityId: button.id,
        event: "pressed",
        condition: null,
        targetEntityId: door.id,
        action: "open",
      }),
    ).not.toBeNull();
    const actions: string[] = [];
    const system = new AuthoredInteractionSystem(
      session.document.entities,
      session.document.interactions,
      { onAction: ({ interaction }) => actions.push(interaction.action) },
    );

    system.fixedStep(0.02, [bodyAt(0, 0.5, 0)]);
    system.fixedStep(0.02, [bodyAt(0, 0.5, 0)]);
    expect(actions).toEqual(["open"]);
    system.fixedStep(0.02, [bodyAt(20, 0.5, 0)]);
    system.fixedStep(0.02, [bodyAt(0, 0.5, 0)]);
    expect(actions).toEqual(["open", "open"]);
    expect(system.debugSnapshot()).toMatchObject({
      linkCount: 1,
      zoneCount: 1,
      activationCount: 2,
      boundedActionCount: 0,
    });
  });

  it("chains a repeating timer through a counter with deterministic thresholds", () => {
    let nextId = 0;
    const createId = () => `logic-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Logic", createId), createId);
    const timer = session.placeEntity("interaction.timer", [0, 0, 0], {
      elevation: 0,
      primarySize: 2,
      yawRadians: 0,
    });
    const counter = session.placeEntity("interaction.counter", [4, 0, 0], {
      elevation: 0,
      primarySize: 2,
      yawRadians: 0,
    });
    const effect = session.placeEntity("decoration.effect-emitter", [8, 0, 0], {
      elevation: 0,
      primarySize: 3,
      yawRadians: 0,
    });
    const entities = session.document.entities.map((entity) =>
      entity.id === timer.id
        ? Object.freeze({
            ...entity,
            properties: Object.freeze({
              ...entity.properties,
              durationSeconds: 0.1,
              repeat: true,
            }),
          })
        : entity.id === counter.id
          ? Object.freeze({
              ...entity,
              properties: Object.freeze({ ...entity.properties, threshold: 2 }),
            })
          : entity,
    );
    const interactions = [
      {
        id: createId(),
        sourceEntityId: timer.id,
        event: "elapsed" as const,
        condition: null,
        targetEntityId: counter.id,
        action: "increment" as const,
      },
      {
        id: createId(),
        sourceEntityId: counter.id,
        event: "activated" as const,
        condition: null,
        targetEntityId: effect.id,
        action: "play" as const,
      },
    ];
    const actions: string[] = [];
    const system = new AuthoredInteractionSystem(entities, interactions, {
      onAction: ({ interaction }) => actions.push(interaction.action),
    });

    for (let index = 0; index < 10; index += 1) {
      system.fixedStep(0.02, []);
    }
    expect(actions).toEqual(["increment", "increment", "play"]);
    expect(system.debugSnapshot().counters[counter.id]).toBe(2);
  });

  it("round-trips safe links and rejects incompatible imported actions", () => {
    let nextId = 0;
    const createId = () => `codec-link-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Safe Links", createId), createId);
    const button = session.placeEntity("interaction.button", [0, 0, 0], {
      elevation: 0,
      primarySize: 2,
      yawRadians: 0,
    });
    const door = session.placeEntity("motion.door", [5, 0, 0], {
      elevation: 0,
      primarySize: 4,
      yawRadians: 0,
    });
    session.addInteractionLink({
      sourceEntityId: button.id,
      event: "pressed",
      condition: "race-running",
      targetEntityId: door.id,
      action: "toggle",
    });
    const encoded = encodeMapDocument(session.document);
    expect(decodeMapDocument(encoded).interactions).toEqual(session.document.interactions);

    const unsafe = JSON.parse(encoded) as { interactions: { action: string }[] };
    unsafe.interactions[0]!.action = "play";
    expect(() => decodeMapDocument(unsafe)).toThrow(MapFormatError);
  });
});
