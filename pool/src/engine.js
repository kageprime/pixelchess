'use strict';
/* ============================================================
   Mini 3D engine: tiny WebGL1 renderer built for the pixel look.
   Scene is drawn into a low-res target, then dithered + palette
   quantised in a post pass and shown with nearest-neighbour scaling.
   ============================================================ */
const Mat = {
  identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
    }
    return o;
  },
  trans(x, y, z) { const m = Mat.identity(); m[12] = x; m[13] = y; m[14] = z; return m; },
  rotY(a) { const m = Mat.identity(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
  rotZ(a) { const m = Mat.identity(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
  fromQuat(q, x, y, z) {
    const m = Mat.identity();
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const x2 = qx+qx, y2 = qy+qy, z2 = qz+qz;
    const xx = qx*x2, xy = qx*y2, xz = qx*z2, yy = qy*y2, yz = qy*z2, zz = qz*z2, wx = qw*x2, wy = qw*y2, wz = qw*z2;
    m[0] = 1-(yy+zz); m[1] = xy+wz;     m[2] = xz-wy;
    m[4] = xy-wz;     m[5] = 1-(xx+zz); m[6] = yz+wx;
    m[8] = xz+wy;     m[9] = yz-wx;     m[10] = 1-(xx+yy);
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  },
  persp(fovy, aspect, near, far) {
    const f = 1/Math.tan(fovy/2), m = new Float32Array(16);
    m[0] = f/aspect; m[5] = f; m[10] = (far+near)/(near-far); m[11] = -1; m[14] = 2*far*near/(near-far);
    return m;
  },
  lookAt(e, t, up) {
    let zx = e[0]-t[0], zy = e[1]-t[1], zz = e[2]-t[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1]*zz-up[2]*zy, xy = up[2]*zx-up[0]*zz, xz = up[0]*zy-up[1]*zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy*xz-zz*xy, yy = zz*xx-zx*xz, yz = zx*xy-zy*xx;
    const m = Mat.identity();
    m[0] = xx; m[1] = yx; m[2] = zx;
    m[4] = xy; m[5] = yy; m[6] = zy;
    m[8] = xz; m[9] = yz; m[10] = zz;
    m[12] = -(xx*e[0]+xy*e[1]+xz*e[2]);
    m[13] = -(yx*e[0]+yy*e[1]+yz*e[2]);
    m[14] = -(zx*e[0]+zy*e[1]+zz*e[2]);
    return m;
  }
};

/* ---------- geometry builders: interleaved pos(3) nor(3) uv(2) ---------- */
const Geo = {
  _pack(P, N, U, I) {
    const v = new Float32Array(P.length / 3 * 8);
    for (let i = 0; i < P.length / 3; i++) {
      v.set([P[i*3], P[i*3+1], P[i*3+2], N[i*3], N[i*3+1], N[i*3+2], U[i*2], U[i*2+1]], i*8);
    }
    return { v, i: new Uint16Array(I) };
  },
  /* box centred on origin; unit>0 makes uv = world size / unit */
  box(w, h, d, unit) {
    const P = [], N = [], U = [], I = [];
    const hx = w/2, hy = h/2, hz = d/2;
    const faces = [
      [[ 1,0,0], [hx,-hy, hz],[hx,-hy,-hz],[hx, hy,-hz],[hx, hy, hz], d, h],
      [[-1,0,0], [-hx,-hy,-hz],[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz], d, h],
      [[0, 1,0], [-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz],[-hx,hy,-hz], w, d],
      [[0,-1,0], [-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz], w, d],
      [[0,0, 1], [-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz], w, h],
      [[0,0,-1], [hx,-hy,-hz],[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz], w, h]
    ];
    for (const f of faces) {
      const b = P.length / 3;
      const su = unit ? f[5]/unit : 1, sv = unit ? f[6]/unit : 1;
      const uvs = [[0,sv],[su,sv],[su,0],[0,0]];
      for (let k = 0; k < 4; k++) { P.push(...f[1+k]); N.push(...f[0]); U.push(...uvs[k]); }
      I.push(b, b+1, b+2, b, b+2, b+3);
    }
    return Geo._pack(P, N, U, I);
  },
  /* horizontal plane facing +y */
  plane(w, d, unit) {
    const hx = w/2, hz = d/2, su = unit ? w/unit : 1, sv = unit ? d/unit : 1;
    return Geo._pack(
      [-hx,0,hz, hx,0,hz, hx,0,-hz, -hx,0,-hz], [0,1,0, 0,1,0, 0,1,0, 0,1,0],
      [0,sv, su,sv, su,0, 0,0], [0,1,2, 0,2,3]);
  },
  /* vertical quad facing +z */
  wall(w, h) {
    const hx = w/2;
    return Geo._pack([-hx,0,0, hx,0,0, hx,h,0, -hx,h,0], [0,0,1, 0,0,1, 0,0,1, 0,0,1], [0,1, 1,1, 1,0, 0,0], [0,1,2, 0,2,3]);
  },
  disc(r, seg) {
    const P = [0,0,0], N = [0,1,0], U = [0.5,0.5], I = [];
    for (let i = 0; i <= seg; i++) {
      const a = i/seg*Math.PI*2;
      P.push(Math.cos(a)*r, 0, Math.sin(a)*r); N.push(0,1,0); U.push(0.5+Math.cos(a)*0.5, 0.5+Math.sin(a)*0.5);
      if (i > 0) I.push(0, i+1, i);
    }
    return Geo._pack(P, N, U, I);
  },
  sphere(r, ws, hs) {
    const P = [], N = [], U = [], I = [];
    for (let j = 0; j <= hs; j++) {
      const v = j/hs, th = v*Math.PI;
      for (let i = 0; i <= ws; i++) {
        const u = i/ws, ph = u*Math.PI*2;
        const x = Math.cos(ph)*Math.sin(th), y = Math.cos(th), z = Math.sin(ph)*Math.sin(th);
        P.push(x*r, y*r, z*r); N.push(x, y, z); U.push(u, v);
      }
    }
    for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) {
      const a = j*(ws+1)+i, b = a+ws+1;
      I.push(a, a+1, b, a+1, b+1, b);
    }
    return Geo._pack(P, N, U, I);
  },
  /* tapered cylinder along +y from 0..h, radius rb at bottom and rt at top */
  cyl(rb, rt, h, seg) {
    const P = [], N = [], U = [], I = [];
    const slope = (rb-rt)/h;
    for (let i = 0; i <= seg; i++) {
      const a = i/seg*Math.PI*2, c = Math.cos(a), s = Math.sin(a);
      const nl = Math.hypot(1, slope);
      P.push(c*rb, 0, s*rb); N.push(c/nl, slope/nl, s/nl); U.push(i/seg, 1);
      P.push(c*rt, h, s*rt); N.push(c/nl, slope/nl, s/nl); U.push(i/seg, 0);
    }
    for (let i = 0; i < seg; i++) { const a = i*2; I.push(a, a+1, a+2, a+1, a+3, a+2); }
    // caps
    for (const [y, r, ny] of [[0, rb, -1], [h, rt, 1]]) {
      const b = P.length/3; P.push(0, y, 0); N.push(0, ny, 0); U.push(0.5, 0.5);
      for (let i = 0; i <= seg; i++) {
        const a = i/seg*Math.PI*2; P.push(Math.cos(a)*r, y, Math.sin(a)*r); N.push(0, ny, 0); U.push(0.5, 0.5);
        if (i > 0) { if (ny > 0) I.push(b, b+i+1, b+i); else I.push(b, b+i, b+i+1); }
      }
    }
    return Geo._pack(P, N, U, I);
  }
};

/* ---------- shaders ---------- */
const VS_MAIN = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv;
uniform mat4 uModel; uniform mat4 uVP; uniform vec2 uUvScale;
varying vec3 vWorld; varying vec3 vNor; varying vec2 vUv;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz; vNor = mat3(uModel) * aNor; vUv = aUv * uUvScale;
  gl_Position = uVP * w;
}`;
const FS_MAIN = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 uColor; uniform vec3 uEmis; uniform sampler2D uTex;
uniform float uUseTex; uniform float uUnlit; uniform float uSpec; uniform float uShin; uniform float uAlpha;
uniform vec3 uCam; uniform vec3 uAmb; uniform vec3 uLPos; uniform vec3 uLCol; uniform vec3 uHemi;
uniform vec3 uFogCol; uniform vec2 uFog;
varying vec3 vWorld; varying vec3 vNor; varying vec2 vUv;
void main(){
  vec4 base = vec4(uColor, 1.0);
  if (uUseTex > 0.5) base *= texture2D(uTex, vUv);
  vec3 col;
  if (uUnlit > 0.5) { col = base.rgb + uEmis; }
  else {
    vec3 N = normalize(vNor); if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(uCam - vWorld);
    vec3 Lv = uLPos - vWorld; float d = length(Lv); Lv /= d;
    float att = 1.0 / (1.0 + 0.00007 * d * d);
    float nl = dot(N, Lv);
    float diff = max(nl, 0.0) * att;
    vec3 H = normalize(Lv + V);
    float sp = pow(max(dot(N, H), 0.0), uShin) * uSpec * att * step(0.0, nl);
    float up = N.y * 0.5 + 0.5;
    col = base.rgb * (uAmb + uHemi * up + uLCol * diff) + uLCol * sp + uEmis;
  }
  float fd = length(vWorld - uCam);
  float f = clamp((fd - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  col = mix(col, uFogCol, f);
  gl_FragColor = vec4(col, base.a * uAlpha);
}`;
const VS_PTS = `
attribute vec3 aPos; attribute vec4 aCol; uniform mat4 uVP; uniform float uSize; varying vec4 vCol;
void main(){ vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); gl_PointSize = uSize; }`;
const FS_PTS = `precision mediump float; varying vec4 vCol; void main(){ gl_FragColor = vCol; }`;
const VS_POST = `attribute vec2 aP; varying vec2 vUv; void main(){ vUv = aP*0.5+0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;
const FS_POST = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex; uniform float uLevels; uniform vec2 uRes; uniform float uFlash;
varying vec2 vUv;
float bayer2(vec2 a){ a = floor(a); return fract(a.x/2.0 + a.y*a.y*0.75); }
float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }
void main(){
  vec3 c = texture2D(uTex, vUv).rgb;
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.9;
  c = (c - 0.5) * 1.08 + 0.5 + uFlash;
  float t = bayer4(gl_FragCoord.xy) - 0.47;
  float L = uLevels - 1.0;
  c = floor(clamp(c, 0.0, 1.0) * L + 0.5 + t * 0.7) / L;
  gl_FragColor = vec4(c, 1.0);
}`;

function createEngine(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL is not available');
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = (vs, fs, attrs, unis) => {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const U = {}; unis.forEach(u => U[u] = gl.getUniformLocation(p, u));
    return { p, U };
  };
  const main = prog(VS_MAIN, FS_MAIN, ['aPos', 'aNor', 'aUv'],
    ['uModel','uVP','uUvScale','uColor','uEmis','uTex','uUseTex','uUnlit','uSpec','uShin','uAlpha','uCam','uAmb','uLPos','uLCol','uHemi','uFogCol','uFog']);
  const pts = prog(VS_PTS, FS_PTS, ['aPos', 'aCol'], ['uVP', 'uSize']);
  const post = prog(VS_POST, FS_POST, ['aP'], ['uTex', 'uLevels', 'uRes', 'uFlash']);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  let fbo, fboTex, fboDepth, W = 2, H = 2;
  function makeTarget() {
    if (fbo) { gl.deleteFramebuffer(fbo); gl.deleteTexture(fboTex); gl.deleteRenderbuffer(fboDepth); }
    fboTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fboDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, fboDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W, H);
    fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fboDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  const eng = {
    gl, canvas,
    get w() { return W; }, get h() { return H; },
    levels: 8, flash: 0,
    resize(w, h) { W = Math.max(2, w | 0); H = Math.max(2, h | 0); canvas.width = W; canvas.height = H; makeTarget(); },
    geom(g) {
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, g.v, gl.STATIC_DRAW);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.i, gl.STATIC_DRAW);
      return { vb, ib, n: g.i.length };
    },
    texture(cv, repeat) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      return t;
    },
    updateTexture(t, cv) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); },
    /* dynamic point cloud with per-point colour */
    pointSet(max) {
      const buf = gl.createBuffer(); const data = new Float32Array(max * 7);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      return { buf, data, max, n: 0, size: 2, visible: true,
        clear() { this.n = 0; },
        add(x, y, z, r, g, b, a) { if (this.n >= this.max) return; data.set([x, y, z, r, g, b, a === undefined ? 1 : a], this.n * 7); this.n++; } };
    },
    render(scene, cam) {
      const view = Mat.lookAt(cam.eye, cam.target, [0, 1, 0]);
      const proj = Mat.persp(cam.fov, W / H, cam.near || 1, cam.far || 900);
      const vp = Mat.mul(proj, view);
      cam.vp = vp;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, W, H);
      const bg = scene.fog.color;
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.useProgram(main.p);
      const U = main.U;
      gl.uniformMatrix4fv(U.uVP, false, vp);
      gl.uniform3fv(U.uCam, cam.eye);
      gl.uniform3fv(U.uAmb, scene.amb); gl.uniform3fv(U.uHemi, scene.hemi);
      gl.uniform3fv(U.uLPos, scene.light.pos); gl.uniform3fv(U.uLCol, scene.light.col);
      gl.uniform3fv(U.uFogCol, scene.fog.color); gl.uniform2fv(U.uFog, [scene.fog.near, scene.fog.far]);
      gl.uniform1i(U.uTex, 0);
      gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
      gl.disableVertexAttribArray(3);
      const drawList = (transparent) => {
        for (const m of scene.meshes) {
          if (!m.visible) continue;
          const mt = m.mat;
          if (!!mt.transparent !== transparent) continue;
          gl.uniformMatrix4fv(U.uModel, false, m.model);
          gl.uniform3fv(U.uColor, mt.color); gl.uniform3fv(U.uEmis, mt.emis);
          gl.uniform1f(U.uUseTex, mt.tex ? 1 : 0); gl.uniform1f(U.uUnlit, mt.unlit ? 1 : 0);
          gl.uniform1f(U.uSpec, mt.spec); gl.uniform1f(U.uShin, mt.shin); gl.uniform1f(U.uAlpha, mt.alpha);
          gl.uniform2fv(U.uUvScale, mt.uv);
          if (mt.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mt.tex); }
          if (mt.double) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
          if (transparent) {
            gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, mt.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
          } else { gl.disable(gl.BLEND); gl.depthMask(true); }
          const g = m.geom;
          gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
          gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
          gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_SHORT, 0);
        }
      };
      drawList(false); drawList(true);
      // points
      gl.useProgram(pts.p);
      gl.uniformMatrix4fv(pts.U.uVP, false, vp);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.disableVertexAttribArray(2); gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
      for (const ps of scene.points) {
        if (!ps.visible || !ps.n) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, ps.buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, ps.data.subarray(0, ps.n * 7));
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
        gl.uniform1f(pts.U.uSize, ps.size);
        gl.drawArrays(gl.POINTS, 0, ps.n);
      }
      gl.depthMask(true); gl.disable(gl.BLEND);
      // post: dither + palette quantise to canvas
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.useProgram(post.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.uniform1i(post.U.uTex, 0); gl.uniform1f(post.U.uLevels, eng.levels);
      gl.uniform2f(post.U.uRes, W, H); gl.uniform1f(post.U.uFlash, eng.flash);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  };
  return eng;
}
