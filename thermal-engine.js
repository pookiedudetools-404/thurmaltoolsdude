(function (global) {
  'use strict';

  var PALETTES = {
    ironbow: [
      [0.00, [  0,   0,   0]],
      [0.13, [ 24,   4,  56]],
      [0.27, [ 88,   8, 122]],
      [0.40, [168,  20, 138]],
      [0.52, [232,  52,  74]],
      [0.64, [255, 118,  10]],
      [0.78, [255, 194,  24]],
      [0.90, [255, 240, 152]],
      [1.00, [255, 255, 255]]
    ],
    rainbow: [
      [0.00, [  6,   2,  52]],
      [0.18, [ 18,  44, 214]],
      [0.34, [  0, 182, 255]],
      [0.50, [  0, 224, 120]],
      [0.64, [176, 240,  20]],
      [0.78, [255, 204,   0]],
      [0.90, [255,  92,   0]],
      [1.00, [255,  20,  20]]
    ],
    jet: [
      [0.00, [  0,   0, 128]],
      [0.12, [  0,   0, 255]],
      [0.36, [  0, 220, 255]],
      [0.50, [ 96, 255, 160]],
      [0.64, [255, 255,  80]],
      [0.86, [255,  40,   0]],
      [1.00, [128,   0,   0]]
    ],
    whitehot: [
      [0.00, [  0,   0,   0]],
      [0.50, [128, 128, 128]],
      [1.00, [255, 255, 255]]
    ],
    blackhot: [
      [0.00, [255, 255, 255]],
      [0.50, [128, 128, 128]],
      [1.00, [  0,   0,   0]]
    ],
    arctic: [
      [0.00, [  2,   6,  20]],
      [0.22, [  8,  44,  96]],
      [0.46, [ 22, 124, 196]],
      [0.70, [ 96, 204, 238]],
      [0.88, [200, 240, 252]],
      [1.00, [255, 255, 255]]
    ],
    lava: [
      [0.00, [  6,   2,   2]],
      [0.20, [ 74,   6,   8]],
      [0.42, [168,  16,   8]],
      [0.62, [236,  78,   8]],
      [0.80, [255, 170,  24]],
      [0.92, [255, 232, 140]],
      [1.00, [255, 255, 240]]
    ]
  };

  var DEFAULT_PALETTE = 'ironbow';
  var LUT_CACHE = Object.create(null);

  function getLut(name) {
    var key = PALETTES[name] ? name : DEFAULT_PALETTE;
    if (LUT_CACHE[key]) return LUT_CACHE[key];

    var stops = PALETTES[key];
    var lut = new Uint8Array(256 * 3);
    var seg = 0;

    for (var i = 0; i < 256; i++) {
      var t = i / 255;
      while (seg < stops.length - 2 && t > stops[seg + 1][0]) seg++;

      var a = stops[seg];
      var b = stops[seg + 1];
      var span = (b[0] - a[0]) || 1e-6;
      var f = (t - a[0]) / span;
      if (f < 0) f = 0; else if (f > 1) f = 1;

      lut[i * 3 + 0] = Math.round(a[1][0] + (b[1][0] - a[1][0]) * f);
      lut[i * 3 + 1] = Math.round(a[1][1] + (b[1][1] - a[1][1]) * f);
      lut[i * 3 + 2] = Math.round(a[1][2] + (b[1][2] - a[1][2]) * f);
    }

    LUT_CACHE[key] = lut;
    return lut;
  }

  function legendCss(name, steps) {
    steps = steps || 10;
    var lut = getLut(name);
    var parts = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var k = Math.round(t * 255) * 3;
      parts.push('rgb(' + lut[k] + ',' + lut[k + 1] + ',' + lut[k + 2] + ') ' +
                 (t * 100).toFixed(1) + '%');
    }
    return 'linear-gradient(90deg, ' + parts.join(', ') + ')';
  }

  function boxBlur(src, dst, tmp, w, h, r) {
    var win = 2 * r + 1;
    var inv = 1 / win;
    var x, y, k, idx, acc;

    for (y = 0; y < h; y++) {
      var row = y * w;
      acc = 0;
      for (k = -r; k <= r; k++) {
        idx = k < 0 ? 0 : (k > w - 1 ? w - 1 : k);
        acc += src[row + idx];
      }
      for (x = 0; x < w; x++) {
        tmp[row + x] = acc * inv;
        var xo = x - r; if (xo < 0) xo = 0;
        var xi = x + r + 1; if (xi > w - 1) xi = w - 1;
        acc += src[row + xi] - src[row + xo];
      }
    }

    for (x = 0; x < w; x++) {
      acc = 0;
      for (k = -r; k <= r; k++) {
        idx = k < 0 ? 0 : (k > h - 1 ? h - 1 : k);
        acc += tmp[idx * w + x];
      }
      for (y = 0; y < h; y++) {
        dst[y * w + x] = acc * inv;
        var yo = y - r; if (yo < 0) yo = 0;
        var yi = y + r + 1; if (yi > h - 1) yi = h - 1;
        acc += tmp[yi * w + x] - tmp[yo * w + x];
      }
    }
  }

  function Renderer(canvas, opts) {
    if (!canvas) throw new Error('ThermalEngine.Renderer: canvas element required');

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('ThermalEngine.Renderer: 2D context unavailable');

    this.src = document.createElement('canvas');
    this.srcCtx = this.src.getContext('2d', {
      willReadFrequently: true,
      alpha: false
    });

    this.o = {
      colormap:  DEFAULT_PALETTE,
      width:     320,
      height:    240,
      mirror:    false,
      gamma:     1.0,
      blur:      1,
      smoothing: 0.55,
      autoGain:  true,
      black:     0.05,
      white:     0.95,
      tMin:      15,
      tMax:      45
    };

    this.W = 0;
    this.H = 0;
    this.N = 0;

    this.hasFrame = false;
    this.agLo = 0;
    this.agHi = 255;
    this.fps = 0;
    this._lastTime = 0;

    this._pixLut = null;
    this._gammaIdx = null;
    this._lutKey = '';
    this._hist = new Uint32Array(256);

    this.resize(this.o.width, this.o.height);
    this._rebuildLut();

    if (opts) this.setOptions(opts);
  }

  Renderer.prototype.resize = function (w, h) {
    w = Math.max(32, Math.round(w) || 320);
    h = Math.max(32, Math.round(h) || 240);

    this.W = w;
    this.H = h;
    this.N = w * h;

    this.canvas.width = w;
    this.canvas.height = h;
    this.src.width = w;
    this.src.height = h;

    this.lumRaw = new Float32Array(this.N);
    this.lumS = new Float32Array(this.N);
    this.tmp = new Float32Array(this.N);
    this.val = new Uint8Array(this.N);

    this.img = this.ctx.createImageData(w, h);
    this.out32 = new Uint32Array(this.img.data.buffer);

    this.hasFrame = false;
  };

  Renderer.prototype.setOptions = function (patch) {
    if (!patch) return;
    var o = this.o;
    var needResize = false;

    if (patch.width != null && patch.width !== o.width) {
      o.width = Math.round(patch.width);
      needResize = true;
    }
    if (patch.height != null && patch.height !== o.height) {
      o.height = Math.round(patch.height);
      needResize = true;
    }
    if (patch.colormap != null)  o.colormap  = String(patch.colormap);
    if (patch.mirror != null)    o.mirror    = !!patch.mirror;
    if (patch.autoGain != null)  o.autoGain  = !!patch.autoGain;
    if (patch.gamma != null)     o.gamma     = +patch.gamma;
    if (patch.blur != null)      o.blur      = +patch.blur;
    if (patch.smoothing != null) o.smoothing = +patch.smoothing;
    if (patch.black != null)     o.black     = +patch.black;
    if (patch.white != null)     o.white     = +patch.white;
    if (patch.tMin != null)      o.tMin      = +patch.tMin;
    if (patch.tMax != null)      o.tMax      = +patch.tMax;

    if (needResize) this.resize(o.width, o.height);
    this._rebuildLut();
  };

  Renderer.prototype._rebuildLut = function () {
    var key = this.o.colormap + '|' + this.o.gamma;
    if (key === this._lutKey && this._pixLut) return;

    var lut = getLut(this.o.colormap);
    var gamma = Math.max(0.05, this.o.gamma);
    var invGamma = 1 / gamma;

    var gammaIdx = new Uint8Array(256);
    var pixLut = new Uint32Array(256);

    for (var i = 0; i < 256; i++) {
      var v = i / 255;
      var gv = Math.pow(v, invGamma);
      var d = Math.round(gv * 255);
      if (d < 0) d = 0; else if (d > 255) d = 255;
      gammaIdx[i] = d;

      var r = lut[d * 3];
      var g = lut[d * 3 + 1];
      var b = lut[d * 3 + 2];

      pixLut[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }

    this._gammaIdx = gammaIdx;
    this._pixLut = pixLut;
    this._lutKey = key;
  };

  Renderer.prototype._updateAutoGain = function (lum, n) {
    var hist = this._hist;
    hist.fill(0);

    var step = n > 140000 ? 2 : 1;
    var count = 0;
    var i, v;

    for (i = 0; i < n; i += step) {
      v = lum[i] | 0;
      if (v < 0) v = 0; else if (v > 255) v = 255;
      hist[v]++;
      count++;
    }

    var loTarget = count * 0.020;
    var hiTarget = count * 0.985;
    var acc = 0, lo = 0, hi = 255;

    for (i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= loTarget) { lo = i; break; }
    }

    acc = 0;
    for (i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= hiTarget) { hi = i; break; }
    }

    if (hi - lo < 16) {
      var mid = (hi + lo) / 2;
      lo = mid - 8;
      hi = mid + 8;
    }

    if (lo < 0) lo = 0;
    if (hi > 255) hi = 255;

    if (!this.hasFrame) {
      this.agLo = lo;
      this.agHi = hi;
    } else {
      var a = 0.12;
      this.agLo += (lo - this.agLo) * a;
      this.agHi += (hi - this.agHi) * a;
    }
  };

  Renderer.prototype.render = function (video) {
    if (!video) return null;
    var vw = video.videoWidth | 0;
    var vh = video.videoHeight | 0;
    if (!vw || !vh) return null;
    if (video.readyState < 2) return null;

    var W = this.W, H = this.H, N = this.N;
    var o = this.o;

    var srcAspect = vw / vh;
    var dstAspect = W / H;
    var sx = 0, sy = 0, sw = vw, sh = vh;

    if (srcAspect > dstAspect) {
      sw = vh * dstAspect;
      sx = (vw - sw) / 2;
    } else if (srcAspect < dstAspect) {
      sh = vw / dstAspect;
      sy = (vh - sh) / 2;
    }

    var sc = this.srcCtx;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, W, H);

    if (o.mirror) {
      sc.translate(W, 0);
      sc.scale(-1, 1);
    }

    sc.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
    sc.setTransform(1, 0, 0, 1, 0, 0);

    var px = sc.getImageData(0, 0, W, H).data;
    var lumRaw = this.lumRaw;

    for (var i = 0, p = 0; i < N; i++, p += 4) {
      lumRaw[i] = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2];
    }

    var lumS = this.lumS;
    var sm = Math.min(0.95, Math.max(0, o.smoothing));

    if (!this.hasFrame || sm <= 0.001) {
      lumS.set(lumRaw);
    } else {
      var k = 1 - sm;
      for (i = 0; i < N; i++) {
        lumS[i] = lumS[i] * sm + lumRaw[i] * k;
      }
    }

    var r = o.blur | 0;
    if (r > 0) {
      if (r > (W - 1) >> 1) r = (W - 1) >> 1;
      if (r > (H - 1) >> 1) r = (H - 1) >> 1;
      if (r > 0) boxBlur(lumS, lumS, this.tmp, W, H, r);
    }

    var lo, hi;
    if (o.autoGain) {
      this._updateAutoGain(lumS, N);
      lo = this.agLo;
      hi = this.agHi;
    } else {
      lo = Math.min(o.black, o.white) * 255;
      hi = Math.max(o.black, o.white) * 255;
    }

    if (hi - lo < 8) {
      var mid = (hi + lo) / 2;
      lo = mid - 4;
      hi = mid + 4;
    }

    var invSpan = 1 / (hi - lo);
    var gammaIdx = this._gammaIdx;
    var pixLut = this._pixLut;
    var out32 = this.out32;
    var val = this.val;

    var iMin = 255, iMax = 0, iSum = 0;
    var hotX = 0, hotY = 0;

    for (var y = 0; y < H; y++) {
      var row = y * W;
      for (var x = 0; x < W; x++) {
        var idx = row + x;
        var v = (lumS[idx] - lo) * invSpan;
        if (v < 0) v = 0; else if (v > 1) v = 1;

        var q = (v * 255 + 0.5) | 0;
        var d = gammaIdx[q];

        val[idx] = d;
        out32[idx] = pixLut[q];

        if (d < iMin) iMin = d;
        if (d > iMax) { iMax = d; hotX = x; hotY = y; }
        iSum += d;
      }
    }

    this.ctx.putImageData(this.img, 0, 0);

    var now = performance.now();
    if (this._lastTime) {
      var dt = now - this._lastTime;
      if (dt > 0.5) {
        var inst = 1000 / dt;
        if (inst > 240) inst = 240;
        this.fps = this.fps ? this.fps * 0.9 + inst * 0.1 : inst;
      }
    }
    this._lastTime = now;
    this.hasFrame = true;

    var tRange = o.tMax - o.tMin;
    var tMin = o.tMin;

    function toTemp(q) {
      return tMin + (q / 255) * tRange;
    }

    return {
      width: W,
      height: H,
      fps: this.fps,
      tempMin: toTemp(iMin),
      tempMax: toTemp(iMax),
      tempAvg: toTemp(iSum / N),
      centerTemp: toTemp(val[(H >> 1) * W + (W >> 1)]),
      hot: {
        x: (hotX + 0.5) / W,
        y: (hotY + 0.5) / H,
        temp: toTemp(iMax)
      },
      range: { lo: lo, hi: hi }
    };
  };

  Renderer.prototype.sampleAt = function (nx, ny) {
    if (!this.N || !this.hasFrame) return null;
    var x = Math.floor(nx * this.W);
    var y = Math.floor(ny * this.H);

    if (x < 0) x = 0; else if (x > this.W - 1) x = this.W - 1;
    if (y < 0) y = 0; else if (y > this.H - 1) y = this.H - 1;

    var q = this.val[y * this.W + x];

    return {
      x: x,
      y: y,
      value: q / 255,
      temp: this.o.tMin + (q / 255) * (this.o.tMax - this.o.tMin)
    };
  };

  global.ThermalEngine = {
    Renderer: Renderer,
    getLut: getLut,
    legendCss: legendCss,
    colormaps: Object.keys(PALETTES),
    version: '1.0.1'
  };

})(window);
