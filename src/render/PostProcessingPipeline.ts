import type { Camera, Scene, WebGLRenderer } from "three";
import { Vector2 } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { Pass } from "three/addons/postprocessing/Pass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import {
  POST_PROCESSING_PASS_ORDER,
  resolveRenderQuality,
  type InternalRenderSize,
  type PostProcessingPassName,
  type RenderQualitySettings,
} from "./render-quality";
import { MILD_VIGNETTE_SHADER } from "./VignetteShader";

export interface PostProcessingPassDebugState {
  readonly name: PostProcessingPassName;
  readonly enabled: boolean;
}

export interface PostProcessingDebugSnapshot {
  readonly disposed: boolean;
  readonly internalSize: InternalRenderSize;
  readonly passes: readonly PostProcessingPassDebugState[];
}

class ResolutionAwareFxaaPass extends ShaderPass {
  public constructor() {
    super(FXAAShader);
  }

  public override setSize(width: number, height: number): void {
    const resolution: unknown = this.uniforms["resolution"]?.value;
    if (resolution instanceof Vector2) {
      resolution.set(1 / Math.max(1, width), 1 / Math.max(1, height));
    }
  }
}

class QuarterResolutionGtaoPass extends GTAOPass {
  public override setSize(width: number, height: number): void {
    super.setSize(Math.max(1, Math.round(width * 0.25)), Math.max(1, Math.round(height * 0.25)));
  }
}

export class PostProcessingPipeline {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly ambientOcclusionPass: GTAOPass;
  private readonly vignettePass: ShaderPass;
  private readonly fxaaPass: ResolutionAwareFxaaPass;
  private readonly smaaPass: SMAAPass;
  private readonly outputPass: OutputPass;
  private readonly namedPasses: ReadonlyMap<PostProcessingPassName, Pass>;
  private disposed = false;
  private sizeInitialized = false;
  private size: InternalRenderSize = Object.freeze({
    cssWidth: 1,
    cssHeight: 1,
    effectivePixelRatio: 1,
    internalWidth: 1,
    internalHeight: 1,
  });

  public constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    settings: RenderQualitySettings,
  ) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    // A denoised quarter-resolution GTAO buffer keeps the low-poly contact shading
    // visible without making the optional effect dominate the browser frame budget.
    this.ambientOcclusionPass = new QuarterResolutionGtaoPass(scene, camera, 1, 1);
    this.ambientOcclusionPass.blendIntensity = 0.45;
    this.ambientOcclusionPass.updateGtaoMaterial({ samples: 4 });
    this.ambientOcclusionPass.updatePdMaterial({ samples: 8 });
    this.vignettePass = new ShaderPass(MILD_VIGNETTE_SHADER);
    this.fxaaPass = new ResolutionAwareFxaaPass();
    this.smaaPass = new SMAAPass();
    this.outputPass = new OutputPass();

    this.namedPasses = new Map<PostProcessingPassName, Pass>([
      ["render", this.renderPass],
      ["ambient-occlusion", this.ambientOcclusionPass],
      ["vignette", this.vignettePass],
      ["fxaa", this.fxaaPass],
      ["smaa", this.smaaPass],
      ["output", this.outputPass],
    ]);

    for (const passName of POST_PROCESSING_PASS_ORDER) {
      const pass = this.namedPasses.get(passName);
      if (pass !== undefined) {
        this.composer.addPass(pass);
      }
    }
    this.applySettings(settings);
  }

  public applySettings(settings: RenderQualitySettings): void {
    if (this.disposed) {
      return;
    }
    const quality = resolveRenderQuality(settings);
    this.renderPass.enabled = true;
    this.ambientOcclusionPass.enabled = quality.ambientOcclusionEnabled;
    this.vignettePass.enabled = quality.vignetteEnabled;
    this.fxaaPass.enabled = quality.selectedAaPass === "fxaa";
    this.smaaPass.enabled = quality.selectedAaPass === "smaa";
    this.outputPass.enabled = true;
  }

  public setSize(size: InternalRenderSize): void {
    if (this.disposed) {
      return;
    }
    const pixelRatioChanged =
      !this.sizeInitialized || size.effectivePixelRatio !== this.size.effectivePixelRatio;
    const cssSizeChanged =
      !this.sizeInitialized ||
      size.cssWidth !== this.size.cssWidth ||
      size.cssHeight !== this.size.cssHeight;

    if (pixelRatioChanged) {
      this.composer.setPixelRatio(size.effectivePixelRatio);
    }
    if (cssSizeChanged) {
      this.composer.setSize(size.cssWidth, size.cssHeight);
    }
    this.size = size;
    this.sizeInitialized = true;
  }

  public render(): void {
    if (!this.disposed) {
      this.composer.render();
    }
  }

  public debugSnapshot(): PostProcessingDebugSnapshot {
    return Object.freeze({
      disposed: this.disposed,
      internalSize: this.size,
      passes: Object.freeze(
        POST_PROCESSING_PASS_ORDER.map((name) =>
          Object.freeze({
            name,
            enabled: this.namedPasses.get(name)?.enabled ?? false,
          }),
        ),
      ),
    });
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.renderPass.dispose();
    this.ambientOcclusionPass.dispose();
    // GTAOPass r185 does not release these two materials in its own disposer.
    this.ambientOcclusionPass.gtaoMaterial.dispose();
    this.ambientOcclusionPass.blendMaterial.dispose();
    this.vignettePass.dispose();
    this.fxaaPass.dispose();
    this.smaaPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }
}
