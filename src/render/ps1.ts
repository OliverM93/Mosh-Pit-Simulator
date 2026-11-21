import * as THREE from 'three';

/**
 * PS1-style vertex snapping: clip-space positions are rounded to the low-res
 * pixel grid, producing the characteristic wobbly, jittery geometry.
 * One shared uniform for all materials (updated on resize).
 */
export const PS1_UNIFORMS = {
  uSnap: { value: new THREE.Vector2(240, 135) },
};

export interface AtlasLayout {
  cols: number;
  rows: number;
}

/**
 * Patch a built-in material with vertex snapping. With `atlas`, instanced
 * meshes read a per-instance `instanceAtlas` (vec2 UV offset) attribute so
 * every crowd member can show a different cell of the same texture atlas.
 */
export function applyPS1<T extends THREE.Material>(material: T, atlas?: AtlasLayout): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = PS1_UNIFORMS.uSnap;
    let header = 'uniform vec2 uSnap;\n';
    if (atlas) {
      shader.uniforms.uAtlasScale = { value: new THREE.Vector2(1 / atlas.cols, 1 / atlas.rows) };
      header += 'attribute vec2 instanceAtlas;\nuniform vec2 uAtlasScale;\n';
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #if defined( USE_INSTANCING ) && defined( USE_MAP )
          vMapUv = vMapUv * uAtlasScale + instanceAtlas;
        #endif`,
      );
    }
    shader.vertexShader = shader.vertexShader.replace('void main() {', `${header}void main() {`).replace(
      '#include <project_vertex>',
      `#include <project_vertex>
        {
          vec4 snapped = gl_Position;
          snapped.xy = floor(snapped.xy / snapped.w * uSnap + 0.5) / uSnap * snapped.w;
          gl_Position = snapped;
        }`,
    );
  };
  material.customProgramCacheKey = () => (atlas ? `ps1-atlas-${atlas.cols}x${atlas.rows}` : 'ps1');
  return material;
}

export function lambert(params: THREE.MeshLambertMaterialParameters, atlas?: AtlasLayout): THREE.MeshLambertMaterial {
  return applyPS1(new THREE.MeshLambertMaterial({ flatShading: true, ...params }), atlas);
}

export function basic(params: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return applyPS1(new THREE.MeshBasicMaterial(params));
}
