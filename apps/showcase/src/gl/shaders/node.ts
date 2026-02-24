export const nodeVertexShader = `#version 300 es
precision highp float;

in vec2 a_corner;
in vec2 a_currentPos;
in vec2 a_targetPos;
in float a_size;
in float a_flags;
in float a_visible;
in float a_nodeId;

uniform mat3 u_camera;
uniform vec2 u_viewport;
uniform float u_morph;
uniform bool u_glow;
uniform float u_glowScale;

out vec2 v_local;
out float v_flags;
out float v_visible;
flat out int v_nodeId;

vec2 toNdc(vec2 screen, vec2 viewport) {
  return vec2(
    (screen.x / max(1.0, viewport.x)) * 2.0 - 1.0,
    1.0 - (screen.y / max(1.0, viewport.y)) * 2.0
  );
}

void main() {
  vec2 world = mix(a_currentPos, a_targetPos, clamp(u_morph, 0.0, 1.0));
  vec2 screen = (u_camera * vec3(world, 1.0)).xy;
  float scale = u_glow ? max(1.0, u_glowScale) : 1.0;
  vec2 expanded = screen + a_corner * max(0.5, a_size) * scale;
  gl_Position = vec4(toNdc(expanded, u_viewport), 0.0, 1.0);

  v_local = a_corner;
  v_flags = a_flags;
  v_visible = a_visible;
  v_nodeId = int(a_nodeId);
}
`;

export const nodeFragmentShader = `#version 300 es
precision highp float;

in vec2 v_local;
in float v_flags;
in float v_visible;
flat in int v_nodeId;

uniform float u_time;
uniform bool u_preview;
uniform bool u_glow;

out vec4 outColor;

float hasBit(float flags, float bit) {
  return mod(floor(flags / bit), 2.0);
}

void main() {
  if (v_visible < 0.5) {
    discard;
  }

  float d = length(v_local);
  if (u_glow) {
    if (d > 1.6) {
      discard;
    }
  } else {
    if (d > 1.0) {
      discard;
    }
  }

  float isArticulation = hasBit(v_flags, 2.0);
  float isSelected = hasBit(v_flags, 16.0);
  float isNeighbor = hasBit(v_flags, 32.0);

  vec3 color = mix(vec3(0.82, 0.9, 0.98), vec3(0.03, 0.62, 0.9), step(0.5, isArticulation));
  if (isNeighbor > 0.5) {
    color = vec3(0.91, 0.62, 0.12);
  }
  if (isSelected > 0.5) {
    color = vec3(0.06, 0.74, 0.51);
  }

  float rim = smoothstep(0.78, 1.0, d);
  color = mix(color, vec3(0.95), rim * 0.24);

  if (u_glow) {
    float glow = 1.0 - smoothstep(0.2, 1.5, d);
    vec3 glowColor = mix(color, vec3(0.72, 0.9, 1.0), 0.42);
    outColor = vec4(glowColor, glow * 0.56);
    return;
  }

  if (u_preview) {
    float pulse = 0.08 * sin(u_time * 0.005 + float(v_nodeId) * 0.11);
    color += pulse;
  }

  outColor = vec4(color, 1.0);
}
`;

export const nodePickFragmentShader = `#version 300 es
precision highp float;

in vec2 v_local;
in float v_visible;
flat in int v_nodeId;

out vec4 outColor;

void main() {
  if (v_visible < 0.5) {
    discard;
  }
  if (length(v_local) > 1.0) {
    discard;
  }

  int id = v_nodeId + 1;
  int r = id & 255;
  int g = (id >> 8) & 255;
  int b = (id >> 16) & 255;
  outColor = vec4(float(r) / 255.0, float(g) / 255.0, float(b) / 255.0, 1.0);
}
`;
