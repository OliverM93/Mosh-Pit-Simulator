import * as THREE from 'three';

/**
 * PS1-style vertex snapping: clip-space positions are rounded to the low-res
 * pixel grid, producing the characteristic wobbly, jittery geometry.
 * One shared uniform for all materials (updated on resize).
 */
export const PS1_UNIFORMS = {
  uSnap: { value: new THREE.Vector2(240, 135) },
};

export function applyPS1<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = PS1_UNIFORMS.uSnap;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform vec2 uSnap;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 snapped = gl_Position;
          snapped.xy = floor(snapped.xy / snapped.w * uSnap + 0.5) / uSnap * snapped.w;
          gl_Position = snapped;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'ps1';
  return material;
}

export function lambert(params: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  return applyPS1(new THREE.MeshLambertMaterial({ flatShading: true, ...params }));
}

export function basic(params: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return applyPS1(new THREE.MeshBasicMaterial(params));
}
