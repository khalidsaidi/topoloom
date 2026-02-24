export const edgeVertexShader = `#version 300 es
precision highp float;

in vec2 a_corner;
in vec2 a_start;
in vec2 a_end;
in float a_width;
in float a_flags;
in float a_visible;

uniform mat3 u_camera;
uniform vec2 u_viewport;

out float v_flags;
out float v_visible;

vec2 toNdc(vec2 screen, vec2 viewport) {
  return vec2(
    (screen.x / max(1.0, viewport.x)) * 2.0 - 1.0,
    1.0 - (screen.y / max(1.0, viewport.y)) * 2.0
  );
}

void main() {
  vec2 delta = a_end - a_start;
  float len = length(delta);
  vec2 dir = len > 0.00001 ? (delta / len) : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float t = (a_corner.x + 1.0) * 0.5;
  vec2 world = mix(a_start, a_end, t) + perp * (a_corner.y * max(0.8, a_width) * 0.5);
  vec2 screen = (u_camera * vec3(world, 1.0)).xy;
  gl_Position = vec4(toNdc(screen, u_viewport), 0.0, 1.0);
  v_flags = a_flags;
  v_visible = a_visible;
}
`;

export const edgeFragmentShader = `#version 300 es
precision highp float;

in float v_flags;
in float v_visible;

uniform float u_time;
uniform float u_alpha;
uniform bool u_routePass;

out vec4 outColor;

float hasBit(float flags, float bit) {
  return mod(floor(flags / bit), 2.0);
}

void main() {
  if (v_visible < 0.5) {
    discard;
  }

  float isWitness = hasBit(v_flags, 1.0);
  float isBridge = hasBit(v_flags, 4.0);
  float isFaceBoundary = hasBit(v_flags, 8.0);

  vec3 color = vec3(0.12, 0.17, 0.25);
  float alpha = 0.75 * u_alpha;

  if (isBridge > 0.5) {
    color = vec3(0.85, 0.45, 0.05);
    alpha = 0.95 * u_alpha;
  }

  if (isWitness > 0.5) {
    float pulse = 0.65 + 0.35 * sin(u_time * 0.012);
    color = vec3(0.95, 0.15, 0.15) * pulse;
    alpha = 1.0 * u_alpha;
  }

  if (isFaceBoundary > 0.5) {
    color = vec3(0.22, 0.88, 0.88);
    alpha = 0.55 * u_alpha;
  }

  if (u_routePass) {
    alpha *= 0.9;
  }

  outColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;
