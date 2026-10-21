import { describe, expect, it } from "vitest";
import {
  canonicalMapDocument,
  decodeMapDocument,
  encodeMapDocument,
  MapFormatError,
} from "../../src/maps/MapCodec";
import { createStarterMapDocument } from "../../src/maps/MapDocument";
import { EditorSession } from "../../src/editor/EditorSession";

function sequentialIds(): () => string {
  let index = 0;
  return () => `test-id-${String(++index)}`;
}

describe("MapCodec", () => {
  it("round-trips the portable starter document canonically", () => {
    const document = createStarterMapDocument("First Track", sequentialIds());
    const encoded = encodeMapDocument(document);
    const decoded = decodeMapDocument(encoded);

    expect(decoded).toEqual(document);
    expect(encodeMapDocument(decoded)).toBe(encoded);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(encoded).not.toContain("createdAt");
    expect(encoded).not.toContain("favorite");
  });

  it("fills safe world-setting defaults for older v1 maps and rejects unknown music", () => {
    const plain = JSON.parse(
      encodeMapDocument(createStarterMapDocument("Legacy World", sequentialIds())),
    ) as { environment: Record<string, unknown> };
    delete plain.environment["skyPreset"];
    delete plain.environment["keyLight"];
    delete plain.environment["ambientLight"];
    delete plain.environment["musicVolume"];
    delete plain.environment["outOfBoundsHeight"];
    const migrated = decodeMapDocument(plain);
    expect(migrated.environment).toMatchObject({
      skyPreset: "custom",
      musicVolume: 0.7,
      outOfBoundsHeight: -20,
    });

    plain.environment["musicAssetId"] = "music.unknown";
    expect(() => decodeMapDocument(plain)).toThrow(/Unknown built-in music/);
  });

  it("normalizes signed zero and quaternion sign", () => {
    const document = createStarterMapDocument("Signed Zero", sequentialIds());
    const plain = JSON.parse(encodeMapDocument(document)) as {
      entities: Array<{
        transform: {
          position: number[];
          rotation: number[];
        };
      }>;
    };
    const first = plain.entities[0];
    expect(first).toBeDefined();
    first!.transform.position[0] = -0;
    first!.transform.rotation = [0, 0, 0, -1];

    const canonical = canonicalMapDocument(plain as never);
    expect(Object.is(canonical.entities[0]?.transform.position[0], -0)).toBe(false);
    expect(canonical.entities[0]?.transform.rotation).toEqual([0, 0, 0, 1]);
  });

  it("rejects duplicate IDs, unknown fields, and non-finite coordinates", () => {
    const document = createStarterMapDocument("Unsafe", sequentialIds());
    const duplicate = JSON.parse(encodeMapDocument(document)) as {
      entities: Array<{ id: string }>;
    };
    duplicate.entities[1]!.id = duplicate.entities[0]!.id;
    expect(() => decodeMapDocument(duplicate)).toThrow(/Duplicate entity ID/);

    const unknown = JSON.parse(encodeMapDocument(document)) as Record<string, unknown>;
    unknown["script"] = "alert(1)";
    expect(() => decodeMapDocument(unknown)).toThrow(/Unknown field/);

    const nonFinite = JSON.parse(encodeMapDocument(document)) as {
      entities: Array<{ transform: { position: number[] } }>;
    };
    nonFinite.entities[0]!.transform.position[0] = Number.POSITIVE_INFINITY;
    expect(() => decodeMapDocument(nonFinite)).toThrow(/finite number/);
  });

  it("reports paths for malformed imports", () => {
    expect(() => decodeMapDocument("{broken")).toThrow(MapFormatError);
    const future = JSON.parse(
      encodeMapDocument(createStarterMapDocument("Future", sequentialIds())),
    ) as { header: { schemaVersion: number } };
    future.header.schemaVersion = 99;
    expect(() => decodeMapDocument(future)).toThrow(/\$\.header\.schemaVersion/);

    const unknownAsset = JSON.parse(
      encodeMapDocument(createStarterMapDocument("Unknown Asset", sequentialIds())),
    ) as { entities: Array<{ assetId: string }> };
    unknownAsset.entities[0]!.assetId = "custom.executable-object";
    expect(() => decodeMapDocument(unknownAsset)).toThrow(/Unsupported asset/);
  });

  it("rejects object groups that contain only one entity", () => {
    const document = createStarterMapDocument("Broken Group", sequentialIds());
    const unsafe = JSON.parse(encodeMapDocument(document)) as {
      entities: Array<{ groupId: string | null }>;
    };
    unsafe.entities[0]!.groupId = "lonely-group";

    expect(() => decodeMapDocument(unsafe)).toThrow(/must contain at least two entities/);
  });

  it("requires finish references to target finish gates", () => {
    const document = createStarterMapDocument("Bad Finish", sequentialIds());
    const unsafe = JSON.parse(encodeMapDocument(document)) as {
      entities: Array<{ id: string; assetId: string }>;
      race: { finishEntityIds: string[] };
    };
    unsafe.race.finishEntityIds = [unsafe.entities[0]!.id];

    expect(() => decodeMapDocument(unsafe)).toThrow(/must target a race\.finish-gate/);
  });

  it("round-trips typed checkpoint routes and rejects broken route references", () => {
    const createId = sequentialIds();
    const session = new EditorSession(createStarterMapDocument("Typed Route", createId), createId);
    const checkpoints = [0, 8].map((x) =>
      session.placeEntity("race.checkpoint", [x, 0, 0], {
        elevation: 0,
        primarySize: 7,
        secondarySize: 4,
        yawRadians: 0,
      }),
    );
    session.selectMany(checkpoints.map((checkpoint) => checkpoint.id));
    expect(session.linkSelectedCheckpoints()).toBe(true);
    const encoded = encodeMapDocument(session.document);
    const decoded = decodeMapDocument(encoded);
    expect(decoded.race.checkpointGroups).toHaveLength(2);
    expect(decoded.race.routeEdges).toHaveLength(1);
    expect(encodeMapDocument(decoded)).toBe(encoded);

    const broken = JSON.parse(encoded) as {
      race: { routeEdges: Array<{ toGroupId: string }> };
    };
    broken.race.routeEdges[0]!.toGroupId = "missing-group";
    expect(() => decodeMapDocument(broken)).toThrow(/existing checkpoint groups/);
  });

  it("round-trips recovery links, migrates older volumes, and rejects invalid safe poses", () => {
    const createId = sequentialIds();
    const session = new EditorSession(
      createStarterMapDocument("Recovery Link", createId),
      createId,
    );
    const volume = session.placeEntity("race.recovery-volume", [0, 0, 0], {
      elevation: 0,
      primarySize: 8,
      secondarySize: 8,
      yawRadians: 0,
    });
    const pose = session.placeEntity("race.recovery-pose", [10, 0, 0], {
      elevation: 0,
      primarySize: 2,
      yawRadians: 0,
    });
    session.selectMany([volume.id, pose.id]);
    expect(session.assignSelectedRecoveryPose()).toBe(true);
    const encoded = encodeMapDocument(session.document);
    expect(decodeMapDocument(encoded)).toEqual(session.document);

    const legacy = JSON.parse(encoded) as {
      entities: Array<{
        id: string;
        assetId: string;
        properties: Record<string, unknown>;
      }>;
    };
    const legacyVolume = legacy.entities.find((entity) => entity.id === volume.id)!;
    delete legacyVolume.properties["safePoseEntityId"];
    expect(
      decodeMapDocument(legacy).entities.find((entity) => entity.id === volume.id)?.properties[
        "safePoseEntityId"
      ],
    ).toBeNull();

    legacyVolume.properties["safePoseEntityId"] = legacy.entities.find(
      (entity) => entity.assetId === "floor.rectangle",
    )!.id;
    expect(() => decodeMapDocument(legacy)).toThrow(/must target a race\.recovery-pose/);
  });

  it("rejects impossible rounded and polygon platform geometry", () => {
    const createId = sequentialIds();
    const session = new EditorSession(createStarterMapDocument("Platforms", createId), createId);
    session.placeEntity("floor.rounded", [0, 0, 0], {
      elevation: 0,
      primarySize: 8,
      secondarySize: 6,
      yawRadians: 0,
    });
    session.placeEntity("floor.polygon", [12, 0, 0], {
      elevation: 0,
      primarySize: 8,
      secondarySize: 8,
      yawRadians: 0,
    });
    const encoded = encodeMapDocument(session.document);
    const rounded = JSON.parse(encoded) as {
      entities: Array<{ assetId: string; properties: { cornerRadius?: number; sides?: number } }>;
    };
    rounded.entities.find((entity) => entity.assetId === "floor.rounded")!.properties.cornerRadius =
      20;
    expect(() => decodeMapDocument(rounded)).toThrow(/Corner radius/);

    const polygon = JSON.parse(encoded) as typeof rounded;
    polygon.entities.find((entity) => entity.assetId === "floor.polygon")!.properties.sides = 2;
    expect(() => decodeMapDocument(polygon)).toThrow(/properties\.sides/);
  });

  it("rejects self-crossing freeform floor imports", () => {
    const createId = sequentialIds();
    const session = new EditorSession(createStarterMapDocument("Freeform", createId), createId);
    session.placeEntity("floor.freeform", [0, 0, 0], {
      elevation: 0,
      primarySize: 8,
      secondarySize: 6,
      yawRadians: 0,
    });
    const unsafe = JSON.parse(encodeMapDocument(session.document)) as {
      entities: Array<{ assetId: string; properties: { outline?: number[][] } }>;
    };
    unsafe.entities.find((entity) => entity.assetId === "floor.freeform")!.properties.outline = [
      [-2, -2],
      [2, 2],
      [-2, 2],
      [2, -2],
    ];

    expect(() => decodeMapDocument(unsafe)).toThrow(/cannot cross itself/);
  });

  it("rejects modular corners whose road is wider than the authored turn", () => {
    const createId = sequentialIds();
    const session = new EditorSession(createStarterMapDocument("Corner", createId), createId);
    session.placeEntity("track.modular-corner", [0, 0, 0], {
      elevation: 0,
      primarySize: 8,
      secondarySize: 5,
      yawRadians: 0,
    });
    const unsafe = JSON.parse(encodeMapDocument(session.document)) as {
      entities: Array<{ assetId: string; properties: { radius?: number; width?: number } }>;
    };
    const corner = unsafe.entities.find((entity) => entity.assetId === "track.modular-corner")!;
    corner.properties.radius = 3;
    corner.properties.width = 8;

    expect(() => decodeMapDocument(unsafe)).toThrow(/width must fit inside its turn radius/);
  });

  it("round-trips typed spline tracks and rejects unsafe track values", () => {
    const createId = sequentialIds();
    const session = new EditorSession(createStarterMapDocument("Spline", createId), createId);
    const track = session.createTrack(
      [
        [0, 0, 0],
        [5, 1, 5],
        [12, 2, 8],
      ],
      { width: 6, elevation: 0, bankRadians: 0.1 },
    )!;
    expect(session.moveTrackTangent(track.id, track.nodes[1]!.id, "out", [3, 2, 7])).toBe(true);
    expect(session.commitContinuousEdit()).toBe(true);
    expect(
      session.editTrackRoadProperties(track.id, 3, 10, {
        width: 8,
        bankRadians: 0.2,
        surface: "slippery",
        materialId: "track.rainbow",
        surfaceStrength: 1.5,
        surfaceCooldownSeconds: 0.8,
      }),
    ).toBe(true);
    const encoded = encodeMapDocument(session.document);
    const decodedTracks = decodeMapDocument(encoded).tracks;
    expect(decodedTracks).toEqual(session.document.tracks);
    expect(decodedTracks[0]!.nodes[1]!.tangentOut).toEqual([3, 2, 7]);
    expect(decodedTracks[0]!.roadRanges).toHaveLength(1);
    expect(decodedTracks[0]!.roadRanges?.[0]).toMatchObject({
      materialId: "track.rainbow",
      surfaceStrength: 1.5,
      surfaceCooldownSeconds: 0.8,
    });

    const legacyRange = JSON.parse(encoded) as {
      tracks: Array<{
        roadRanges?: Array<{ surfaceStrength?: number; surfaceCooldownSeconds?: number }>;
      }>;
    };
    delete legacyRange.tracks[0]!.roadRanges?.[0]?.surfaceStrength;
    delete legacyRange.tracks[0]!.roadRanges?.[0]?.surfaceCooldownSeconds;
    expect(decodeMapDocument(legacyRange).tracks[0]?.roadRanges?.[0]).toMatchObject({
      surfaceStrength: 1,
      surfaceCooldownSeconds: 0.35,
    });

    const legacy = JSON.parse(encoded) as { tracks: Array<{ roadRanges?: unknown }> };
    delete legacy.tracks[0]!.roadRanges;
    expect(decodeMapDocument(legacy).tracks[0]?.roadRanges).toEqual([]);

    const unsafe = JSON.parse(encoded) as {
      tracks: Array<{ nodes: Array<{ width: number }>; roadRanges: Array<{ width: number }> }>;
    };
    unsafe.tracks[0]!.nodes[0]!.width = -1;
    expect(() => decodeMapDocument(unsafe)).toThrow(/\$\.tracks\[0\]\.nodes\[0\]\.width/);
    unsafe.tracks[0]!.nodes[0]!.width = 6;
    unsafe.tracks[0]!.roadRanges[0]!.width = 101;
    expect(() => decodeMapDocument(unsafe)).toThrow(/roadRanges\[0\]\.width/);
  });
});
