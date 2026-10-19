(function () {
  'use strict';

  var btnFreeze   = document.getElementById('btn-freeze');
  var btnSnapshot = document.getElementById('btn-snapshot');
  var btnHide     = document.getElementById('btn-hide');
  var btnStart    = document.getElementById('btn-start');
  var btnReset    = document.getElementById('btn-reset');

  var canvas      = document.getElementById('canvas');
  var viewport    = document.getElementById('viewport');
  var stage       = document.getElementById('stage');
  var crosshair   = document.getElementById('crosshair');
  var hotspot     = document.getElementById('hotspot');
  var readout     = document.getElementById('readout');
  var freezeBadge = document.getElementById('freeze-badge');

  var hudFps = document.getElementById('hud-fps');
  var hudMin = document.getElementById('hud-min');
  var hudMax = document.getElementById('hud-max');
  var hudAvg = document.getElementById('hud-avg');

  var gate      = document.getElementById('gate');
  var gateError = document.getElementById('gate-error');

  var selCamera     = document.getElementById('sel-camera');
  var selColormap   = document.getElementById('sel-colormap');
  var selResolution = document.getElementById('sel-resolution');
  var chkMirror     = document.getElementById('chk-mirror');

  var rngTmin = document.getElementById('rng-tmin');
  var outTmin = document.getElementById('out-tmin');
  var rngTmax = document.getElementById('rng-tmax');
  var outTmax = document.getElementById('out-tmax');

  var rngGamma  = document.getElementById('rng-gamma');
  var outGamma  = document.getElementById('out-gamma');
  var rngBlur   = document.getElementById('rng-blur');
  var outBlur   = document.getElementById('out-blur');
  var rngSmooth = document.getElementById('rng-smooth');
  var outSmooth = document.getElementById('out-smooth');

  var chkAutogain = document.getElementById('chk-autogain');
  var rngBlack    = document.getElementById('rng-black');
  var outBlack    = document.getElementById('out-black');
  var rngWhite    = document.getElementById('rng-white');
  var outWhite    = document.getElementById('out-white');

  var legendBar = document.getElementById('legend-bar');
  var legendMin = document.getElementById('legend-min');
  var legendMax = document.getElementById('legend-max');

  var video = document.getElementById('video');

  var state = {
    streaming:        false,
    frozen:           false,
    stream:           null,
    deviceId:         '',
    rafId:            0,
    crosshairVisible: false,
    crosshairX:       0.5,
    crosshairY:       0.5,
    crosshairHideTimer: 0
  };

  var unhideBtn = null;
  var lastHudUpdate = 0;
  var lastHotspotUpdate = 0;

  var engine = new ThermalEngine.Renderer(canvas, {
    width: 320,
    height: 240
  });

  function layoutViewport() {
    if (!engine.W || !engine.H) return;

    var cs = getComputedStyle(stage);
    var padL = parseFloat(cs.paddingLeft)   || 0;
    var padR = parseFloat(cs.paddingRight)  || 0;
    var padT = parseFloat(cs.paddingTop)    || 0;
    var padB = parseFloat(cs.paddingBottom) || 0;

    var availW = stage.clientWidth  - padL - padR;
    var availH = stage.clientHeight - padT - padB;

    if (availW < 40 || availH < 40) return;

    var aspect = engine.W / engine.H;
    var w = availW;
    var h = w / aspect;

    if (h > availH) {
      h = availH;
      w = h * aspect;
    }

    viewport.style.width  = Math.floor(w) + 'px';
    viewport.style.height = Math.floor(h) + 'px';
  }

  function updateLegend() {
    legendBar.style.background = ThermalEngine.legendCss(engine.o.colormap);
    legendMin.textContent = engine.o.tMin.toFixed(0) + ' °C';
    legendMax.textContent = engine.o.tMax.toFixed(0) + ' °C';
  }

  function applyEngineOptions(patch, needsLayout) {
    engine.setOptions(patch);
    if (needsLayout) layoutViewport();
    updateLegend();
  }

  function bindControls() {
    selColormap.addEventListener('change', function () {
      applyEngineOptions({ colormap: selColormap.value }, false);
    });

    selResolution.addEventListener('change', function () {
      var parts = selResolution.value.split('x');
      var w = parseInt(parts[0], 10);
      var h = parseInt(parts[1], 10);
      applyEngineOptions({ width: w, height: h }, true);
    });

    chkMirror.addEventListener('change', function () {
      applyEngineOptions({ mirror: chkMirror.checked }, false);
    });

    function updateTempRange() {
      var tmin = parseFloat(rngTmin.value);
      var tmax = parseFloat(rngTmax.value);

      if (tmax <= tmin + 1) {
        tmax = tmin + 2;
        if (tmax > 200) { tmax = 200; tmin = 198; rngTmin.value = tmin; }
        rngTmax.value = tmax;
      }

      outTmin.textContent = tmin;
      outTmax.textContent = tmax;

      applyEngineOptions({ tMin: tmin, tMax: tmax }, false);
    }
    rngTmin.addEventListener('input', updateTempRange);
    rngTmax.addEventListener('input', updateTempRange);

    rngGamma.addEventListener('input', function () {
      var v = parseFloat(rngGamma.value);
      outGamma.textContent = v.toFixed(2);
      applyEngineOptions({ gamma: v }, false);
    });

    rngBlur.addEventListener('input', function () {
      var v = parseInt(rngBlur.value, 10);
      outBlur.textContent = v;
      applyEngineOptions({ blur: v }, false);
    });

    rngSmooth.addEventListener('input', function () {
      var v = parseFloat(rngSmooth.value);
      outSmooth.textContent = v.toFixed(2);
      applyEngineOptions({ smoothing: v }, false);
    });

    chkAutogain.addEventListener('change', function () {
      applyEngineOptions({ autoGain: chkAutogain.checked }, false);
    });

    rngBlack.addEventListener('input', function () {
      var v = parseFloat(rngBlack.value);
      outBlack.textContent = v.toFixed(2);
      applyEngineOptions({ black: v }, false);
    });

    rngWhite.addEventListener('input', function () {
      var v = parseFloat(rngWhite.value);
      outWhite.textContent = v.toFixed(2);
      applyEngineOptions({ white: v }, false);
    });

    btnReset.addEventListener('click', function () {
      selColormap.value = 'ironbow';
      selResolution.value = '320x240';
      chkMirror.checked = false;

      rngTmin.value = 15;  outTmin.textContent = '15';
      rngTmax.value = 45;  outTmax.textContent = '45';

      rngGamma.value  = 1;    outGamma.textContent  = '1.00';
      rngBlur.value   = 1;    outBlur.textContent   = '1';
      rngSmooth.value = 0.55; outSmooth.textContent = '0.55';

      chkAutogain.checked = true;
      rngBlack.value = 0.05; outBlack.textContent = '0.05';
      rngWhite.value = 0.95; outWhite.textContent = '0.95';

      applyEngineOptions({
        colormap: 'ironbow',
        width: 320, height: 240,
        mirror: false,
        tMin: 15, tMax: 45,
        gamma: 1, blur: 1, smoothing: 0.55,
        autoGain: true,
        black: 0.05, white: 0.95
      }, true);
    });

    btnFreeze.addEventListener('click', toggleFreeze);
    btnSnapshot.addEventListener('click', takeSnapshot);
    btnHide.addEventListener('click', toggleUI);
    btnStart.addEventListener('click', startCamera);

    selCamera.addEventListener('change', function () {
      if (!state.streaming) return;
      var id = selCamera.value || '';
      startStream(id).then(function () {
        state.deviceId = id;
      }).catch(function (err) {
        showGateError(err);
        selCamera.value = state.deviceId;
      });
    });
  }

  function friendlyError(err) {
    if (!err) return 'Unknown error';
    var name = err.name || '';
    var msg  = err.message || String(err);

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
      return 'Camera permission was denied. Allow access in your browser settings and try again.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
      return 'No camera was found on this device.';
    if (name === 'NotReadableError' || name === 'TrackStartError')
      return 'The camera is already in use by another application.';
    if (name === 'OverconstrainedError')
      return 'This camera does not support the requested settings.';
    if (name === 'SecurityError')
      return 'Camera access requires HTTPS or localhost.';
    if (name === 'TypeError')
      return 'Camera API unavailable — make sure the page is served over HTTPS.';
    return msg;
  }

  function showGateError(err) {
    gateError.textContent = friendlyError(err);
    gateError.hidden = false;
  }

  function stopStream() {
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      state.stream = null;
    }
    try { video.pause(); } catch (e) {}
    video.srcObject = null;
  }

  function startStream(deviceId) {
    stopStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject({ name: 'TypeError', message: 'mediaDevices unavailable' });
    }

    var videoConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };

    return navigator.mediaDevices
      .getUserMedia({ audio: false, video: videoConstraints })
      .then(function (stream) {
        state.stream = stream;
        video.srcObject = stream;
        
        return video.play().catch(function() {});
      })
      .then(function () {
        return new Promise(function (resolve) {
          if (video.videoWidth > 0 && video.readyState >= 2) return resolve();
          var checkInterval = setInterval(function() {
            if (video.videoWidth > 0 && video.readyState >= 2) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 50);
        });
      });
  }

  function startCamera() {
    btnStart.disabled = true;
    gateError.hidden = true;

    startStream(state.deviceId || '')
      .then(function () {
        state.streaming = true;
        return populateCameras();
      })
      .then(function () {
        syncEngineFromUI();
        layoutViewport();

        gate.classList.add('fade');
        setTimeout(function () { gate.hidden = true; }, 320);

        btnFreeze.disabled   = false;
        btnSnapshot.disabled = false;

        startLoop();
      })
      .catch(function (err) {
        btnStart.disabled = false;
        showGateError(err);
      });
  }

  function populateCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return Promise.resolve();
    }

    return navigator.mediaDevices.enumerateDevices().then(function (devices) {
      var cams = devices.filter(function (d) { return d.kind === 'videoinput'; });
      while (selCamera.options.length > 1) selCamera.remove(1);

      var current = state.deviceId;
      cams.forEach(function (cam, i) {
        var opt = document.createElement('option');
        opt.value = cam.deviceId;
        opt.textContent = cam.label || ('Camera ' + (i + 1));
        selCamera.appendChild(opt);
      });

      if (current) {
        var exists = false;
        for (var i = 0; i < selCamera.options.length; i++) {
          if (selCamera.options[i].value === current) { exists = true; break; }
        }
        selCamera.value = exists ? current : '';
      }
    }).catch(function () {});
  }

  function syncEngineFromUI() {
    var parts = selResolution.value.split('x');
    var w = parseInt(parts[0], 10);
    var h = parseInt(parts[1], 10);

    engine.setOptions({
      width:     w,
      height:    h,
      colormap:  selColormap.value,
      mirror:    chkMirror.checked,
      gamma:     parseFloat(rngGamma.value),
      blur:      parseInt(rngBlur.value, 10),
      smoothing: parseFloat(rngSmooth.value),
      autoGain:  chkAutogain.checked,
      black:     parseFloat(rngBlack.value),
      white:     parseFloat(rngWhite.value),
      tMin:      parseFloat(rngTmin.value),
      tMax:      parseFloat(rngTmax.value)
    });

    updateLegend();
  }

  function startLoop() {
    if (state.rafId) return;
    state.rafId = requestAnimationFrame(loop);
  }

  function loop() {
    state.rafId = requestAnimationFrame(loop);

    if (document.hidden) return;
    if (state.frozen) return;
    if (!state.streaming) return;

    var stats = engine.render(video);
    if (!stats) return;

    updateHud(stats);
    updateHotspot(stats);
    updateCrosshairReading();
  }

  function updateHud(stats) {
    var now = performance.now();
    if (now - lastHudUpdate < 100) return;
    lastHudUpdate = now;

    hudFps.textContent = Math.round(stats.fps);
    hudMin.textContent = stats.tempMin.toFixed(1) + '°';
    hudMax.textContent = stats.tempMax.toFixed(1) + '°';
    hudAvg.textContent = stats.tempAvg.toFixed(1) + '°';
  }

  function updateHotspot(stats) {
    var now = performance.now();
    if (now - lastHotspotUpdate < 80) return;
    lastHotspotUpdate = now;

    hotspot.style.left = (stats.hot.x * 100) + '%';
    hotspot.style.top  = (stats.hot.y * 100) + '%';
    hotspot.hidden = false;
  }

  function updateCrosshairReading() {
    if (!state.crosshairVisible) return;
    var s = engine.sampleAt(state.crosshairX, state.crosshairY);
    if (!s) return;
    readout.textContent = s.temp.toFixed(1) + ' °C';
  }

  function showCrosshairAt(clientX, clientY) {
    var r = viewport.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;

    var nx = (clientX - r.left) / r.width;
    var ny = (clientY - r.top)  / r.height;

    if (nx < 0) nx = 0; else if (nx > 1) nx = 1;
    if (ny < 0) ny = 0; else if (ny > 1) ny = 1;

    state.crosshairX = nx;
    state.crosshairY = ny;
    state.crosshairVisible = true;

    crosshair.hidden = false;
    readout.hidden = false;

    crosshair.style.left = (nx * 100) + '%';
    crosshair.style.top  = (ny * 100) + '%';

    readout.style.left = (nx * 100) + '%';
    readout.style.top  = (ny * 100) + '%';

    updateCrosshairReading();
  }

  function hideCrosshair() {
    state.crosshairVisible = false;
    crosshair.hidden = true;
    readout.hidden = true;
  }

  function scheduleCrosshairHide() {
    clearTimeout(state.crosshairHideTimer);
    state.crosshairHideTimer = setTimeout(hideCrosshair, 1400);
  }

  function bindPointer() {
    viewport.style.touchAction = 'none';

    viewport.addEventListener('pointerdown', function (e) {
      clearTimeout(state.crosshairHideTimer);
      showCrosshairAt(e.clientX, e.clientY);
    });

    viewport.addEventListener('pointermove', function (e) {
      showCrosshairAt(e.clientX, e.clientY);
      if (e.pointerType !== 'mouse') clearTimeout(state.crosshairHideTimer);
    });

    viewport.addEventListener('pointerup', function (e) {
      if (e.pointerType !== 'mouse') scheduleCrosshairHide();
    });

    viewport.addEventListener('pointercancel', function () {
      scheduleCrosshairHide();
    });

    viewport.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse') hideCrosshair();
      else scheduleCrosshairHide();
    });
  }

  function toggleFreeze() {
    if (!state.streaming) return;
    state.frozen = !state.frozen;

    if (state.frozen) {
      try { video.pause(); } catch (e) {}
      freezeBadge.hidden = false;
      btnFreeze.classList.add('on');
      btnFreeze.textContent = 'Unfreeze';
      hudFps.textContent = '—';
    } else {
      try {
        video.play().catch(function () {});
      } catch (e) {}
      freezeBadge.hidden = true;
      btnFreeze.classList.remove('on');
      btnFreeze.textContent = 'Freeze';
    }
  }

  function takeSnapshot() {
    if (!state.streaming) return;

    canvas.toBlob(function (blob) {
      if (!blob) return;

      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;

      var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = 'thermal-' + stamp + '.png';

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }, 'image/png');
  }

  function toggleUI() {
    var hidden = document.body.classList.toggle('ui-hidden');
    if (hidden) {
      showUnhideButton();
      setTimeout(layoutViewport, 50);
    } else {
      hideUnhideButton();
      setTimeout(layoutViewport, 50);
    }
  }

  function showUnhideButton() {
    if (unhideBtn) return;

    unhideBtn = document.createElement('button');
    unhideBtn.type = 'button';
    unhideBtn.textContent = '☰';
    unhideBtn.title = 'Show UI (H)';
    unhideBtn.style.cssText =
      'position:fixed;top:10px;right:10px;z-index:100;' +
      'width:36px;height:36px;border-radius:50%;' +
      'border:1px solid rgba(255,255,255,0.18);' +
      'background:rgba(10,16,22,0.72);color:#e8f3fb;' +
      'font-size:15px;cursor:pointer;' +
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
      'display:grid;place-items:center;';

    unhideBtn.addEventListener('click', toggleUI);
    document.body.appendChild(unhideBtn);
  }

  function hideUnhideButton() {
    if (unhideBtn) {
      unhideBtn.remove();
      unhideBtn = null;
    }
  }

  function bindKeyboard() {
    window.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' ||
                t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }

      var k = e.key ? e.key.toLowerCase() : '';
      if (k === 'f') { e.preventDefault(); toggleFreeze(); }
      else if (k === 's') { e.preventDefault(); takeSnapshot(); }
      else if (k === 'h') { e.preventDefault(); toggleUI(); }
    });
  }

  function bindResize() {
    window.addEventListener('resize', layoutViewport);
    window.addEventListener('orientationchange', function () {
      setTimeout(layoutViewport, 120);
      setTimeout(layoutViewport, 400);
    });

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { layoutViewport(); });
      ro.observe(stage);
    }
  }

  function bindVisibility() {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.streaming && !state.frozen) {
        if (video.paused) {
          video.play().catch(function () {});
        }
      }
    });
  }

  function boot() {
    btnFreeze.disabled   = true;
    btnSnapshot.disabled = true;

    bindControls();
    bindPointer();
    bindKeyboard();
    bindResize();
    bindVisibility();

    syncEngineFromUI();
    layoutViewport();
    populateCameras();
    updateLegend();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
