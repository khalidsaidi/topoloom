import { mat3 } from 'gl-matrix';
import * as twgl from 'twgl.js';

import { edgeFragmentShader, edgeVertexShader } from '@/gl/shaders/edge';
import { nodeFragmentShader, nodePickFragmentShader, nodeVertexShader } from '@/gl/shaders/node';

export type RendererNodeInput = {
  id: number;
  label: string;
  degree: number;
  preview: { x: number; y: number };
  target?: { x: number; y: number };
  flags?: number;
  visible?: boolean;
};

export type RendererEdgeInput = {
  u: number;
  v: number;
  flags?: number;
};

export type RendererSegmentInput = {
  a: { x: number; y: number };
  b: { x: number; y: number };
  flags?: number;
  width?: number;
  visible?: boolean;
};

export type RendererSceneInput = {
  nodes: RendererNodeInput[];
  edges: RendererEdgeInput[];
  routeSegments?: RendererSegmentInput[];
  seed?: number;
  preview?: boolean;
  morphDurationMs?: number;
};

export type CameraTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export type RendererFrameState = {
  morph: number;
  preview: boolean;
  finalDeterministic: boolean;
};

const QUAD = new Float32Array([
  -1, -1,
  1, -1,
  -1, 1,
  -1, 1,
  1, -1,
  1, 1,
]);

const SELECTED_BIT = 16;

function degreeToSize(degree: number) {
  if (degree <= 2) return 4.2;
  if (degree <= 4) return 5.3;
  if (degree <= 8) return 6.4;
  return 7.6;
}

function createMatFromCamera(camera: CameraTransform, out = mat3.create()) {
  out[0] = camera.scale;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = camera.scale;
  out[5] = 0;
  out[6] = camera.translateX;
  out[7] = camera.translateY;
  out[8] = 1;
  return out;
}

function hasBit(flags: number, bit: number) {
  return Math.floor(flags / bit) % 2 === 1;
}

type DrawUniforms = {
  u_camera: mat3;
  u_viewport: [number, number];
  u_time: number;
  u_morph?: number;
  u_alpha?: number;
  u_routePass?: boolean;
  u_preview?: boolean;
  u_glow?: boolean;
  u_glowScale?: number;
};

export class GraphRenderer {
  private readonly canvas: HTMLCanvasElement;

  private readonly gl: WebGL2RenderingContext;

  private readonly nodeProgram: twgl.ProgramInfo;

  private readonly nodePickProgram: twgl.ProgramInfo;

  private readonly edgeProgram: twgl.ProgramInfo;

  private readonly quadBuffer: WebGLBuffer;

  private readonly nodeCurrentBuffer: WebGLBuffer;

  private readonly nodeTargetBuffer: WebGLBuffer;

  private readonly nodeSizeBuffer: WebGLBuffer;

  private readonly nodeFlagBuffer: WebGLBuffer;

  private readonly nodeVisibleBuffer: WebGLBuffer;

  private readonly nodeIdBuffer: WebGLBuffer;

  private readonly edgeStartBuffer: WebGLBuffer;

  private readonly edgeEndBuffer: WebGLBuffer;

  private readonly edgeFlagBuffer: WebGLBuffer;

  private readonly edgeVisibleBuffer: WebGLBuffer;

  private readonly edgeWidthBuffer: WebGLBuffer;

  private readonly routeStartBuffer: WebGLBuffer;

  private readonly routeEndBuffer: WebGLBuffer;

  private readonly routeFlagBuffer: WebGLBuffer;

  private readonly routeVisibleBuffer: WebGLBuffer;

  private readonly routeWidthBuffer: WebGLBuffer;

  private readonly nodeVao: WebGLVertexArrayObject;

  private readonly nodePickVao: WebGLVertexArrayObject;

  private readonly edgeVao: WebGLVertexArrayObject;

  private readonly routeVao: WebGLVertexArrayObject;

  private nodeCurrent = new Float32Array(0);

  private nodeTarget = new Float32Array(0);

  private nodePreviewBase = new Float32Array(0);

  private nodeSize = new Float32Array(0);

  private nodeFlags = new Float32Array(0);

  private nodeVisible = new Float32Array(0);

  private nodeIds = new Float32Array(0);

  private mixedNodePositions = new Float32Array(0);

  private readonly nodeIndexById = new Map<number, number>();

  private edges: RendererEdgeInput[] = [];

  private edgeStart = new Float32Array(0);

  private edgeEnd = new Float32Array(0);

  private edgeFlags = new Float32Array(0);

  private edgeVisible = new Float32Array(0);

  private edgeWidth = new Float32Array(0);

  private routeSegments: RendererSegmentInput[] = [];

  private routeStart = new Float32Array(0);

  private routeEnd = new Float32Array(0);

  private routeFlags = new Float32Array(0);

  private routeVisible = new Float32Array(0);

  private routeWidth = new Float32Array(0);

  private nodeCount = 0;

  private edgeCount = 0;

  private routeCount = 0;

  private readonly camera = mat3.create();

  private cameraTransform: CameraTransform = { scale: 1, translateX: 0, translateY: 0 };

  private width = 1;

  private height = 1;

  private dpr = 1;

  private morph = 0;

  private morphing = false;

  private morphStart = 0;

  private morphDurationMs = 1200;

  private previewEnabled = true;

  private finalDeterministic = false;

  private previewSeed = 1;

  private animationFrameId: number | null = null;

  private onFrameState?: (state: RendererFrameState) => void;

  private selectedNodeId: number | null = null;

  private pickingFramebuffer: WebGLFramebuffer | null = null;

  private pickingTexture: WebGLTexture | null = null;

  constructor(canvas: HTMLCanvasElement, options?: { onFrameState?: (state: RendererFrameState) => void }) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      throw new Error('WebGL2 is not supported in this browser.');
    }
    this.canvas = canvas;
    this.gl = gl;
    this.onFrameState = options?.onFrameState;

    this.nodeProgram = twgl.createProgramInfo(gl, [nodeVertexShader, nodeFragmentShader]);
    this.nodePickProgram = twgl.createProgramInfo(gl, [nodeVertexShader, nodePickFragmentShader]);
    this.edgeProgram = twgl.createProgramInfo(gl, [edgeVertexShader, edgeFragmentShader]);

    this.quadBuffer = this.createBuffer(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    this.nodeCurrentBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.nodeTargetBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.nodeSizeBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.nodeFlagBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.nodeVisibleBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.nodeIdBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);

    this.edgeStartBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.edgeEndBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.edgeFlagBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.edgeVisibleBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.edgeWidthBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);

    this.routeStartBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.routeEndBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.routeFlagBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.routeVisibleBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    this.routeWidthBuffer = this.createBuffer(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);

    const nodeVao = gl.createVertexArray();
    const nodePickVao = gl.createVertexArray();
    const edgeVao = gl.createVertexArray();
    const routeVao = gl.createVertexArray();
    if (!nodeVao || !nodePickVao || !edgeVao || !routeVao) {
      throw new Error('Failed to create WebGL vertex arrays.');
    }
    this.nodeVao = nodeVao;
    this.nodePickVao = nodePickVao;
    this.edgeVao = edgeVao;
    this.routeVao = routeVao;

    this.configureNodeVao(this.nodeProgram.program, this.nodeVao);
    this.configureNodeVao(this.nodePickProgram.program, this.nodePickVao);
    this.configureEdgeVao(this.edgeProgram.program, this.edgeVao, false);
    this.configureEdgeVao(this.edgeProgram.program, this.routeVao, true);

    this.setCameraTransform(this.cameraTransform);
    this.start();
  }

  private createBuffer(target: number, data: BufferSource, usage: number) {
    const buffer = this.gl.createBuffer();
    if (!buffer) {
      throw new Error('Failed to create WebGL buffer.');
    }
    this.gl.bindBuffer(target, buffer);
    this.gl.bufferData(target, data, usage);
    this.gl.bindBuffer(target, null);
    return buffer;
  }

  private bindAttrib(
    program: WebGLProgram,
    name: string,
    buffer: WebGLBuffer,
    size: number,
    divisor: number,
  ) {
    const gl = this.gl;
    const location = gl.getAttribLocation(program, name);
    if (location < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(location, divisor);
  }

  private configureNodeVao(program: WebGLProgram, vao: WebGLVertexArrayObject) {
    const gl = this.gl;
    gl.bindVertexArray(vao);
    this.bindAttrib(program, 'a_corner', this.quadBuffer, 2, 0);
    this.bindAttrib(program, 'a_currentPos', this.nodeCurrentBuffer, 2, 1);
    this.bindAttrib(program, 'a_targetPos', this.nodeTargetBuffer, 2, 1);
    this.bindAttrib(program, 'a_size', this.nodeSizeBuffer, 1, 1);
    this.bindAttrib(program, 'a_flags', this.nodeFlagBuffer, 1, 1);
    this.bindAttrib(program, 'a_visible', this.nodeVisibleBuffer, 1, 1);
    this.bindAttrib(program, 'a_nodeId', this.nodeIdBuffer, 1, 1);
    gl.bindVertexArray(null);
  }

  private configureEdgeVao(program: WebGLProgram, vao: WebGLVertexArrayObject, routePass: boolean) {
    const gl = this.gl;
    gl.bindVertexArray(vao);
    this.bindAttrib(program, 'a_corner', this.quadBuffer, 2, 0);
    this.bindAttrib(program, 'a_start', routePass ? this.routeStartBuffer : this.edgeStartBuffer, 2, 1);
    this.bindAttrib(program, 'a_end', routePass ? this.routeEndBuffer : this.edgeEndBuffer, 2, 1);
    this.bindAttrib(program, 'a_width', routePass ? this.routeWidthBuffer : this.edgeWidthBuffer, 1, 1);
    this.bindAttrib(program, 'a_flags', routePass ? this.routeFlagBuffer : this.edgeFlagBuffer, 1, 1);
    this.bindAttrib(program, 'a_visible', routePass ? this.routeVisibleBuffer : this.edgeVisibleBuffer, 1, 1);
    gl.bindVertexArray(null);
  }

  setCameraTransform(camera: CameraTransform) {
    this.cameraTransform = { ...camera };
    createMatFromCamera(this.cameraTransform, this.camera);
  }

  getCameraTransform() {
    return { ...this.cameraTransform };
  }

  resize(width: number, height: number, dpr = window.devicePixelRatio || 1) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.dpr = Math.max(1, dpr);
    const pixelWidth = Math.floor(this.width * this.dpr);
    const pixelHeight = Math.floor(this.height * this.dpr);

    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.resizePickingTargets(pixelWidth, pixelHeight);
    }
  }

  setScene(scene: RendererSceneInput) {
    this.nodeIndexById.clear();
    this.nodeCount = scene.nodes.length;
    this.edgeCount = scene.edges.length;
    this.routeSegments = scene.routeSegments ?? [];
    this.routeCount = this.routeSegments.length;
    this.previewSeed = Math.trunc(scene.seed ?? 1);
    this.morphDurationMs = Math.max(420, Math.min(2000, Math.floor(scene.morphDurationMs ?? 1100)));

    this.nodeCurrent = new Float32Array(this.nodeCount * 2);
    this.nodeTarget = new Float32Array(this.nodeCount * 2);
    this.nodePreviewBase = new Float32Array(this.nodeCount * 2);
    this.nodeSize = new Float32Array(this.nodeCount);
    this.nodeFlags = new Float32Array(this.nodeCount);
    this.nodeVisible = new Float32Array(this.nodeCount);
    this.nodeIds = new Float32Array(this.nodeCount);
    this.mixedNodePositions = new Float32Array(this.nodeCount * 2);

    let hasAnyTarget = false;

    scene.nodes.forEach((node, index) => {
      this.nodeIndexById.set(node.id, index);
      this.nodeCurrent[index * 2] = node.preview.x;
      this.nodeCurrent[index * 2 + 1] = node.preview.y;
      this.nodePreviewBase[index * 2] = node.preview.x;
      this.nodePreviewBase[index * 2 + 1] = node.preview.y;
      this.nodeTarget[index * 2] = node.target?.x ?? node.preview.x;
      this.nodeTarget[index * 2 + 1] = node.target?.y ?? node.preview.y;
      this.nodeSize[index] = degreeToSize(node.degree);
      this.nodeFlags[index] = node.flags ?? 0;
      this.nodeVisible[index] = node.visible === false ? 0 : 1;
      this.nodeIds[index] = node.id;
      if (node.target) hasAnyTarget = true;
    });

    this.edges = scene.edges;
    this.edgeStart = new Float32Array(this.edgeCount * 2);
    this.edgeEnd = new Float32Array(this.edgeCount * 2);
    this.edgeFlags = new Float32Array(this.edgeCount);
    this.edgeVisible = new Float32Array(this.edgeCount);
    this.edgeWidth = new Float32Array(this.edgeCount);
    scene.edges.forEach((edge, index) => {
      this.edgeFlags[index] = edge.flags ?? 0;
      this.edgeWidth[index] = hasBit(this.edgeFlags[index] ?? 0, 1) ? 3.6 : 1.55;
      this.edgeVisible[index] = 1;
    });

    this.routeStart = new Float32Array(this.routeCount * 2);
    this.routeEnd = new Float32Array(this.routeCount * 2);
    this.routeFlags = new Float32Array(this.routeCount);
    this.routeVisible = new Float32Array(this.routeCount);
    this.routeWidth = new Float32Array(this.routeCount);
    this.routeSegments.forEach((segment, index) => {
      this.routeStart[index * 2] = segment.a.x;
      this.routeStart[index * 2 + 1] = segment.a.y;
      this.routeEnd[index * 2] = segment.b.x;
      this.routeEnd[index * 2 + 1] = segment.b.y;
      this.routeFlags[index] = segment.flags ?? 0;
      this.routeVisible[index] = 1;
      this.routeWidth[index] = segment.width ?? 1.9;
    });

    this.uploadNodeBuffers();
    this.uploadRouteBuffers();

    if (hasAnyTarget) {
      this.startMorph();
    } else {
      this.morph = 0;
      this.morphing = false;
      this.previewEnabled = scene.preview ?? true;
      this.finalDeterministic = false;
    }
  }

  private startMorph() {
    this.morph = 0;
    this.morphStart = performance.now();
    this.morphing = true;
    this.previewEnabled = true;
    this.finalDeterministic = false;
  }

  setSamplingVisible(nodeIds: number[]) {
    const visibleSet = new Set(nodeIds);
    for (let i = 0; i < this.nodeCount; i += 1) {
      const id = this.nodeIds[i];
      this.nodeVisible[i] = visibleSet.has(id) ? 1 : 0;
    }
    this.uploadNodeVisibleBuffer();
  }

  setNodeFlags(flagsById: Map<number, number>) {
    for (let i = 0; i < this.nodeCount; i += 1) {
      const id = this.nodeIds[i];
      const selectedBit = hasBit(this.nodeFlags[i] ?? 0, SELECTED_BIT) ? SELECTED_BIT : 0;
      this.nodeFlags[i] = (flagsById.get(id) ?? 0) + selectedBit;
    }
    this.uploadNodeFlagBuffer();
  }

  setSelectedNode(nodeId: number | null) {
    this.selectedNodeId = nodeId;
    for (let i = 0; i < this.nodeCount; i += 1) {
      const base = this.nodeFlags[i] - (hasBit(this.nodeFlags[i], SELECTED_BIT) ? SELECTED_BIT : 0);
      this.nodeFlags[i] = base + (this.nodeIds[i] === nodeId ? SELECTED_BIT : 0);
    }
    this.uploadNodeFlagBuffer();
  }

  getSelectedNode() {
    return this.selectedNodeId;
  }

  setFinalTargets(positions: Array<[number, { x: number; y: number }]>, routeSegments: RendererSegmentInput[] = []) {
    for (const [id, point] of positions) {
      const index = this.nodeIndexById.get(id);
      if (index === undefined) continue;
      this.nodeTarget[index * 2] = point.x;
      this.nodeTarget[index * 2 + 1] = point.y;
    }
    this.routeSegments = routeSegments;
    this.routeCount = routeSegments.length;
    this.routeStart = new Float32Array(this.routeCount * 2);
    this.routeEnd = new Float32Array(this.routeCount * 2);
    this.routeFlags = new Float32Array(this.routeCount);
    this.routeVisible = new Float32Array(this.routeCount);
    this.routeWidth = new Float32Array(this.routeCount);
    routeSegments.forEach((segment, index) => {
      this.routeStart[index * 2] = segment.a.x;
      this.routeStart[index * 2 + 1] = segment.a.y;
      this.routeEnd[index * 2] = segment.b.x;
      this.routeEnd[index * 2 + 1] = segment.b.y;
      this.routeFlags[index] = segment.flags ?? 0;
      this.routeVisible[index] = segment.visible === false ? 0 : 1;
      this.routeWidth[index] = segment.width ?? 1.9;
    });
    this.uploadTargetBuffer();
    this.uploadRouteBuffers();
    this.startMorph();
  }

  private uploadBuffer(buffer: WebGLBuffer, data: Float32Array, usage = this.gl.DYNAMIC_DRAW) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  }

  private uploadNodeBuffers() {
    this.uploadBuffer(this.nodeCurrentBuffer, this.nodeCurrent);
    this.uploadBuffer(this.nodeTargetBuffer, this.nodeTarget);
    this.uploadBuffer(this.nodeSizeBuffer, this.nodeSize);
    this.uploadBuffer(this.nodeFlagBuffer, this.nodeFlags);
    this.uploadBuffer(this.nodeVisibleBuffer, this.nodeVisible);
    this.uploadBuffer(this.nodeIdBuffer, this.nodeIds);
  }

  private uploadTargetBuffer() {
    this.uploadBuffer(this.nodeTargetBuffer, this.nodeTarget);
  }

  private uploadNodeCurrentBuffer() {
    this.uploadBuffer(this.nodeCurrentBuffer, this.nodeCurrent);
  }

  private uploadNodeFlagBuffer() {
    this.uploadBuffer(this.nodeFlagBuffer, this.nodeFlags);
  }

  private uploadNodeVisibleBuffer() {
    this.uploadBuffer(this.nodeVisibleBuffer, this.nodeVisible);
  }

  private uploadEdgeBuffers() {
    this.uploadBuffer(this.edgeStartBuffer, this.edgeStart);
    this.uploadBuffer(this.edgeEndBuffer, this.edgeEnd);
    this.uploadBuffer(this.edgeFlagBuffer, this.edgeFlags);
    this.uploadBuffer(this.edgeVisibleBuffer, this.edgeVisible);
    this.uploadBuffer(this.edgeWidthBuffer, this.edgeWidth);
  }

  private uploadRouteBuffers() {
    this.uploadBuffer(this.routeStartBuffer, this.routeStart);
    this.uploadBuffer(this.routeEndBuffer, this.routeEnd);
    this.uploadBuffer(this.routeFlagBuffer, this.routeFlags);
    this.uploadBuffer(this.routeVisibleBuffer, this.routeVisible);
    this.uploadBuffer(this.routeWidthBuffer, this.routeWidth);
  }

  private updatePreviewPositions(timeMs: number) {
    if (!this.previewEnabled || this.finalDeterministic || this.morphing) return;

    const t = timeMs * 0.001;
    const seedFactor = (Math.abs(this.previewSeed) % 997) / 997;

    for (let i = 0; i < this.nodeCount; i += 1) {
      const baseX = this.nodePreviewBase[i * 2];
      const baseY = this.nodePreviewBase[i * 2 + 1];
      const phaseA = t * (0.8 + (i % 7) * 0.07 + seedFactor * 0.2) + i * 0.53 + seedFactor;
      const phaseB = t * (0.65 + (i % 5) * 0.05 + seedFactor * 0.25) + i * 0.31;
      const ampX = 5 + (i % 6) * 0.8;
      const ampY = 4 + ((i + 3) % 7) * 0.7;
      this.nodeCurrent[i * 2] = baseX + Math.cos(phaseA) * ampX;
      this.nodeCurrent[i * 2 + 1] = baseY + Math.sin(phaseB) * ampY;
    }
    this.uploadNodeCurrentBuffer();
  }

  private updateMorphState(timeMs: number) {
    if (!this.morphing) return;
    const elapsed = Math.max(0, timeMs - this.morphStart);
    const t = Math.min(1, elapsed / this.morphDurationMs);
    this.morph = t < 1 ? (t * t * (3 - 2 * t)) : 1;

    if (this.morph >= 1) {
      this.morphing = false;
      this.previewEnabled = false;
      this.finalDeterministic = true;
      this.nodeCurrent.set(this.nodeTarget);
      this.uploadNodeCurrentBuffer();
    }
  }

  private updateMixedPositions() {
    const m = this.morph;
    const inv = 1 - m;
    for (let i = 0; i < this.nodeCount; i += 1) {
      this.mixedNodePositions[i * 2] = this.nodeCurrent[i * 2] * inv + this.nodeTarget[i * 2] * m;
      this.mixedNodePositions[i * 2 + 1] = this.nodeCurrent[i * 2 + 1] * inv + this.nodeTarget[i * 2 + 1] * m;
    }
  }

  private updateEdgeInstances() {
    for (let i = 0; i < this.edgeCount; i += 1) {
      const edge = this.edges[i];
      if (!edge) continue;
      const a = this.nodeIndexById.get(edge.u);
      const b = this.nodeIndexById.get(edge.v);
      if (a === undefined || b === undefined) continue;
      this.edgeStart[i * 2] = this.mixedNodePositions[a * 2];
      this.edgeStart[i * 2 + 1] = this.mixedNodePositions[a * 2 + 1];
      this.edgeEnd[i * 2] = this.mixedNodePositions[b * 2];
      this.edgeEnd[i * 2 + 1] = this.mixedNodePositions[b * 2 + 1];
      this.edgeVisible[i] = this.nodeVisible[a] > 0.5 && this.nodeVisible[b] > 0.5 ? 1 : 0;
    }
    this.uploadEdgeBuffers();
  }

  private setCommonGlState() {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  private drawPass(programInfo: twgl.ProgramInfo, vao: WebGLVertexArrayObject, count: number, uniforms: DrawUniforms) {
    if (count <= 0) return;
    const gl = this.gl;
    gl.useProgram(programInfo.program);
    twgl.setUniforms(programInfo, uniforms as Record<string, unknown>);
    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    gl.bindVertexArray(null);
  }

  private drawScene(timeMs: number, width: number, height: number, camera: mat3) {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.02, 0.03, 0.07, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.setCommonGlState();

    const common = {
      u_camera: camera,
      u_viewport: [width, height] as [number, number],
      u_time: timeMs,
    };

    this.drawPass(this.edgeProgram, this.edgeVao, this.edgeCount, {
      ...common,
      u_alpha: this.finalDeterministic ? 1 : 0.96,
      u_routePass: false,
    });

    if (this.routeCount > 0) {
      this.drawPass(this.edgeProgram, this.routeVao, this.routeCount, {
        ...common,
        u_alpha: this.morphing ? Math.max(0.46, this.morph) : 0.98,
        u_routePass: true,
      });
    }

    this.drawPass(this.nodeProgram, this.nodeVao, this.nodeCount, {
      ...common,
      u_morph: this.morph,
      u_preview: !this.finalDeterministic,
      u_glow: true,
      u_glowScale: 2.5,
    });

    this.drawPass(this.nodeProgram, this.nodeVao, this.nodeCount, {
      ...common,
      u_morph: this.morph,
      u_preview: !this.finalDeterministic,
      u_glow: false,
      u_glowScale: 1,
    });
  }

  private render = (timeMs: number) => {
    this.updateMorphState(timeMs);
    this.updatePreviewPositions(timeMs);
    this.updateMixedPositions();
    this.updateEdgeInstances();
    this.drawScene(timeMs, this.canvas.width, this.canvas.height, this.camera);

    this.onFrameState?.({
      morph: this.morph,
      preview: this.previewEnabled,
      finalDeterministic: this.finalDeterministic,
    });

    this.animationFrameId = window.requestAnimationFrame(this.render);
  };

  start() {
    if (this.animationFrameId !== null) return;
    this.animationFrameId = window.requestAnimationFrame(this.render);
  }

  stop() {
    if (this.animationFrameId === null) return;
    window.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  private resizePickingTargets(width: number, height: number) {
    const gl = this.gl;
    if (!this.pickingFramebuffer) {
      this.pickingFramebuffer = gl.createFramebuffer();
      this.pickingTexture = gl.createTexture();
    }
    if (!this.pickingFramebuffer || !this.pickingTexture) return;

    gl.bindTexture(gl.TEXTURE_2D, this.pickingTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      Math.max(1, width),
      Math.max(1, height),
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pickingTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  pickNode(localX: number, localY: number): number | null {
    const gl = this.gl;
    if (!this.pickingFramebuffer) return null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.drawPass(this.nodePickProgram, this.nodePickVao, this.nodeCount, {
      u_camera: this.camera,
      u_viewport: [this.canvas.width, this.canvas.height],
      u_time: 0,
      u_morph: this.morph,
      u_glow: false,
      u_glowScale: 1,
    });

    const x = Math.max(0, Math.min(this.canvas.width - 1, Math.floor(localX * this.dpr)));
    const y = Math.max(0, Math.min(this.canvas.height - 1, Math.floor((this.height - localY) * this.dpr)));
    const pixel = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const id = pixel[0] + pixel[1] * 256 + pixel[2] * 65536 - 1;
    return id >= 0 ? id : null;
  }

  captureImageData(scale = 2): { width: number; height: number; pixels: Uint8ClampedArray } | null {
    const gl = this.gl;
    const width = Math.max(1, Math.floor(this.width * scale));
    const height = Math.max(1, Math.floor(this.height * scale));

    const framebuffer = gl.createFramebuffer();
    const texture = gl.createTexture();
    if (!framebuffer || !texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const scaledCamera = mat3.clone(this.camera);
    scaledCamera[0] *= scale;
    scaledCamera[4] *= scale;
    scaledCamera[6] *= scale;
    scaledCamera[7] *= scale;

    this.drawScene(performance.now(), width, height, scaledCamera);

    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);

    const flipped = new Uint8ClampedArray(width * height * 4);
    const rowSize = width * 4;
    for (let y = 0; y < height; y += 1) {
      const src = (height - y - 1) * rowSize;
      const dst = y * rowSize;
      flipped.set(pixels.subarray(src, src + rowSize), dst);
    }

    return { width, height, pixels: flipped };
  }

  getState(): RendererFrameState {
    return {
      morph: this.morph,
      preview: this.previewEnabled,
      finalDeterministic: this.finalDeterministic,
    };
  }

  dispose() {
    this.stop();
    const gl = this.gl;
    gl.deleteVertexArray(this.nodeVao);
    gl.deleteVertexArray(this.nodePickVao);
    gl.deleteVertexArray(this.edgeVao);
    gl.deleteVertexArray(this.routeVao);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.nodeCurrentBuffer);
    gl.deleteBuffer(this.nodeTargetBuffer);
    gl.deleteBuffer(this.nodeSizeBuffer);
    gl.deleteBuffer(this.nodeFlagBuffer);
    gl.deleteBuffer(this.nodeVisibleBuffer);
    gl.deleteBuffer(this.nodeIdBuffer);
    gl.deleteBuffer(this.edgeStartBuffer);
    gl.deleteBuffer(this.edgeEndBuffer);
    gl.deleteBuffer(this.edgeFlagBuffer);
    gl.deleteBuffer(this.edgeVisibleBuffer);
    gl.deleteBuffer(this.edgeWidthBuffer);
    gl.deleteBuffer(this.routeStartBuffer);
    gl.deleteBuffer(this.routeEndBuffer);
    gl.deleteBuffer(this.routeFlagBuffer);
    gl.deleteBuffer(this.routeVisibleBuffer);
    gl.deleteBuffer(this.routeWidthBuffer);
    if (this.pickingFramebuffer) gl.deleteFramebuffer(this.pickingFramebuffer);
    if (this.pickingTexture) gl.deleteTexture(this.pickingTexture);
  }
}
