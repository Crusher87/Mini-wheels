import type { IUniform } from "three";

export interface VignetteShaderDefinition {
  readonly name: string;
  readonly uniforms: {
    readonly tDiffuse: IUniform;
    readonly darkness: IUniform<number>;
  };
  readonly vertexShader: string;
  readonly fragmentShader: string;
}

export const MILD_VIGNETTE_SHADER: VignetteShaderDefinition = Object.freeze({
  name: "MiniWheelsMildVignette",
  uniforms: {
    tDiffuse: { value: null },
    darkness: { value: 0.18 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    varying vec2 vUv;

    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec2 centered = vUv - vec2(0.5);
      float edge = smoothstep(0.12, 0.5, dot(centered, centered));
      gl_FragColor = vec4(source.rgb * (1.0 - edge * darkness), source.a);
    }
  `,
});
