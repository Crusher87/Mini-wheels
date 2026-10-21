import type { AppState } from "../app/AppState";
import type { GameAppDebugSnapshot } from "../app/GameApp";
import type { RuntimePerformanceSnapshot } from "./RuntimePerformanceMonitor";
import type { AudioServiceDebugSnapshot } from "../audio/AudioService";
import type { RenderSystemDebugSnapshot } from "../render/RenderSystem";
import type { DebugBodyState, WorldDebugSnapshot } from "../world/WorldSession";

declare global {
  interface Window {
    __MINI_WHEELS_TEST__?:
      | {
          readonly state: () => AppState;
          readonly snapshot: () => WorldDebugSnapshot | null;
          readonly renderSnapshot: () => RenderSystemDebugSnapshot | null;
          readonly appSnapshot: () => GameAppDebugSnapshot;
          readonly performanceSnapshot: () => RuntimePerformanceSnapshot;
          readonly audioSnapshot: () => AudioServiceDebugSnapshot;
          readonly resetPerformance: () => void;
          readonly resetSandbox: () => Promise<void>;
          readonly dropVehicle: () => void;
          readonly moveVehicle: (
            playerIndex: number,
            position: { readonly x: number; readonly y: number; readonly z: number },
          ) => void;
          readonly setVehicleState: (playerIndex: number, state: DebugBodyState) => void;
          readonly setBallState: (ballIndex: number, state: DebugBodyState) => void;
          readonly setCubeState: (cubeIndex: number, state: DebugBodyState) => void;
        }
      | undefined;
  }
}

export {};
