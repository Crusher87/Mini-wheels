import {
  Color,
  type Object3D,
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { RENDER_CONFIG } from "../config/runtime-defaults";
import type { GameSettings } from "../persistence/schema";
import { PostProcessingPipeline, type PostProcessingDebugSnapshot } from "./PostProcessingPipeline";
import { calculateInternalRenderSize, type InternalRenderSize } from "./render-quality";
import { applyDirectionalShadowQuality } from "./shadow-quality";

export interface RenderSystemHandlers {
  readonly onContextLost: () => void;
  readonly onContextRestored: () => void;
}

export interface RenderResourceDebugSnapshot {
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly lines: number;
  readonly points: number;
}

export interface RenderSystemDebugSnapshot {
  readonly postProcessing: PostProcessingDebugSnapshot;
  readonly resources: RenderResourceDebugSnapshot;
}

export class RenderSystem {
  public readonly scene = new Scene();
  public readonly camera: OrthographicCamera;
  public readonly renderer: WebGLRenderer;

  private readonly resizeObserver: ResizeObserver;
  private readonly postProcessing: PostProcessingPipeline;
  private readonly shadowConfiguredRoots = new WeakSet<Object3D>();
  private renderSettings: GameSettings;
  private renderSize: InternalRenderSize;
  private scheduledResize: number | undefined;
  private disposed = false;

  private readonly contextLostHandler = (event: Event): void => {
    event.preventDefault();
    this.handlers.onContextLost();
  };

  private readonly contextRestoredHandler = (): void => {
    this.handlers.onContextRestored();
  };

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    settings: GameSettings,
    private readonly handlers: RenderSystemHandlers,
  ) {
    const context = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });
    if (context === null) {
      throw new Error("WebGL 2 is required. Update your desktop browser or graphics driver.");
    }

    this.renderer = new WebGLRenderer({
      canvas,
      context,
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(RENDER_CONFIG.background, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;

    this.scene.background = new Color(RENDER_CONFIG.background);
    this.camera = new OrthographicCamera(
      -RENDER_CONFIG.minimumOrthographicSize,
      RENDER_CONFIG.minimumOrthographicSize,
      RENDER_CONFIG.minimumOrthographicSize,
      -RENDER_CONFIG.minimumOrthographicSize,
      RENDER_CONFIG.nearClip,
      RENDER_CONFIG.farClip,
    );
    this.camera.position.set(
      RENDER_CONFIG.initialCameraPosition.x,
      RENDER_CONFIG.initialCameraPosition.y,
      RENDER_CONFIG.initialCameraPosition.z,
    );
    this.camera.lookAt(new Vector3(0, 0, 0));

    this.renderSettings = settings;
    this.renderSize = calculateInternalRenderSize(1, 1, window.devicePixelRatio, settings);
    this.postProcessing = new PostProcessingPipeline(
      this.renderer,
      this.scene,
      this.camera,
      settings,
    );
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleResize();
    });
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    canvas.addEventListener("webglcontextlost", this.contextLostHandler);
    canvas.addEventListener("webglcontextrestored", this.contextRestoredHandler);
    this.resize();
  }

  public applySettings(settings: GameSettings): void {
    if (this.disposed) {
      return;
    }
    this.renderSettings = settings;
    this.postProcessing.applySettings(settings);
    if (applyDirectionalShadowQuality(this.scene, settings.shadowQuality) > 0) {
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.resize();
  }

  public resize(): void {
    if (this.disposed) {
      return;
    }
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const aspect = width / height;
    const halfHeight = RENDER_CONFIG.minimumOrthographicSize;
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();

    this.renderSize = calculateInternalRenderSize(
      width,
      height,
      window.devicePixelRatio,
      this.renderSettings,
    );
    this.renderer.setPixelRatio(this.renderSize.effectivePixelRatio);
    this.renderer.setSize(this.renderSize.cssWidth, this.renderSize.cssHeight, false);
    this.postProcessing.setSize(this.renderSize);
  }

  public render(): void {
    if (!this.disposed) {
      this.configureNewSceneRoots();
      this.postProcessing.render();
    }
  }

  public async precompile(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.configureNewSceneRoots();
    try {
      if (this.renderer.extensions.has("KHR_parallel_shader_compile")) {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else {
        this.renderer.compile(this.scene, this.camera);
      }
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    if (!this.disposed) {
      // Compile the full-screen pass materials while the loading UI is still visible.
      this.postProcessing.render();
    }
  }

  public get aspectRatio(): number {
    return Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight);
  }

  public debugSnapshot(): RenderSystemDebugSnapshot {
    const { memory, render, programs } = this.renderer.info;
    return Object.freeze({
      postProcessing: this.postProcessing.debugSnapshot(),
      resources: Object.freeze({
        geometries: memory.geometries,
        textures: memory.textures,
        programs: programs?.length ?? 0,
        drawCalls: render.calls,
        triangles: render.triangles,
        lines: render.lines,
        points: render.points,
      }),
    });
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.resizeObserver.disconnect();
    if (this.scheduledResize !== undefined) {
      cancelAnimationFrame(this.scheduledResize);
      this.scheduledResize = undefined;
    }
    this.canvas.removeEventListener("webglcontextlost", this.contextLostHandler);
    this.canvas.removeEventListener("webglcontextrestored", this.contextRestoredHandler);
    this.postProcessing.dispose();
    this.renderer.dispose();
  }

  private scheduleResize(): void {
    if (this.disposed || this.scheduledResize !== undefined) {
      return;
    }
    this.scheduledResize = requestAnimationFrame(() => {
      this.scheduledResize = undefined;
      this.resize();
    });
  }

  private configureNewSceneRoots(): void {
    for (const root of this.scene.children) {
      if (this.shadowConfiguredRoots.has(root)) {
        continue;
      }
      if (applyDirectionalShadowQuality(root, this.renderSettings.shadowQuality) > 0) {
        this.renderer.shadowMap.needsUpdate = true;
      }
      this.shadowConfiguredRoots.add(root);
    }
  }
}
