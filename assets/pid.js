// Battery-enclosure PID simulator (illustrative thermal model, not measured data)
(function () {
  'use strict';
  var cv = document.getElementById('pidPlot');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var ctl = { kp: $('kp'), ki: $('ki'), kd: $('kd'), sp: $('sp'), heat: $('heat') };
  var outs = { kp: $('kpOut'), ki: $('kiOut'), kd: $('kdOut'), sp: $('spOut'), heat: $('heatOut') };
  var read = { temp: $('rTemp'), fan: $('rFan'), band: $('rBand'), time: $('rTime') };

  // plant: lumped heat capacity, passive loss + fan-driven convection, sensor lag and transport delay
  var C = 2500, TA = 22, H0 = 1.0, H1 = 9.0, DEAD = 20, LAG = 40, STALL = 0.12, TEND = 2400, NOISE = 0.12;
  var st;
  function reset() {
    st = { t: 0, T: 60, Ts: 60, I: 0, prev: null, fd: 0, buf: [], temps: [], fans: [], spike: 0 };
    for (var i = 0; i < DEAD; i++) st.buf.push(60);
    if (!running) draw();
  }
  function gains() {
    return { kp: +ctl.kp.value / 100, ki: +ctl.ki.value / 100, kd: +ctl.kd.value / 100, sp: +ctl.sp.value, P: +ctl.heat.value };
  }
  function step(g) {
    st.buf.push(st.T); var Td = st.buf.shift();
    st.Ts += (Td - st.Ts) / LAG;
    var meas = st.Ts + (Math.random() * 2 - 1) * NOISE * 1.7;
    var e = meas - g.sp; // reverse acting: hotter than setpoint means more fan
    var d = st.prev === null ? 0 : e - st.prev; st.prev = e;
    st.fd += (d - st.fd) * 0.08;
    var u = g.kp * e + st.I + g.kd * st.fd;
    // anti-windup: only integrate when not pushing further into saturation
    if ((u > 0 && u < 1) || (u <= 0 && e > 0) || (u >= 1 && e < 0)) st.I += g.ki * e;
    st.I = Math.max(-0.2, Math.min(1, st.I));
    u = Math.max(0, Math.min(1, u));
    var ue = u < STALL ? 0 : u; // PC fans stall below ~12% PWM
    var P = g.P + (st.spike > 0 ? 40 : 0); if (st.spike > 0) st.spike--;
    st.T += (P - (H0 + H1 * ue) * (st.T - TA)) / C;
    st.t++;
    st.temps.push(st.T); st.fans.push(ue);
  }

  var running = false, raf = 0;
  function loop() {
    var g = gains();
    for (var i = 0; i < 12 && st.t < TEND; i++) step(g);
    draw();
    if (st.t < TEND && running) raf = requestAnimationFrame(loop); else { running = false; $('pidRun').textContent = 'Run again'; }
  }
  function start() {
    cancelAnimationFrame(raf); reset(); running = true; $('pidRun').textContent = 'Running…';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { var g = gains(); while (st.t < TEND) step(g); running = false; draw(); $('pidRun').textContent = 'Run again'; return; }
    raf = requestAnimationFrame(loop);
  }

  function size() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function draw() {
    if (!st) return;
    var W = cv.clientWidth, H = cv.clientHeight, g = gains();
    var L = 44, R = 12, T = 14, fanH = Math.max(46, H * 0.2), B = 26, gap = 22;
    var ph = H - T - B - fanH - gap, pw = W - L - R;
    var tmin = 20, tmax = 65;
    var X = function (t) { return L + t / TEND * pw; };
    var Y = function (v) { return T + (1 - (v - tmin) / (tmax - tmin)) * ph; };
    var fy0 = T + ph + gap, FY = function (u) { return fy0 + (1 - u) * fanH; };
    ctx.clearRect(0, 0, W, H);
    ctx.font = '11px "IBM Plex Mono", monospace'; ctx.lineWidth = 1;
    // grid + axes
    ctx.strokeStyle = 'rgba(138,152,148,.18)'; ctx.fillStyle = '#8a9894'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var v = 20; v <= 60; v += 10) { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(W - R, Y(v)); ctx.stroke(); ctx.fillText(v + '°', L - 6, Y(v)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var m = 0; m <= 40; m += 10) { var x = X(m * 60); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, fy0 + fanH); ctx.stroke(); ctx.fillText(m + ' min', Math.min(Math.max(x, L + 18), W - R - 22), fy0 + fanH + 8); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('fan', L - 6, fy0 + fanH / 2);
    ctx.strokeStyle = 'rgba(138,152,148,.35)'; ctx.strokeRect(L, fy0, pw, fanH);
    // setpoint band
    ctx.fillStyle = 'rgba(31,138,82,.12)'; ctx.fillRect(L, Y(g.sp + 2), pw, Y(g.sp - 2) - Y(g.sp + 2));
    ctx.strokeStyle = '#2bb071'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(L, Y(g.sp)); ctx.lineTo(W - R, Y(g.sp)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#2bb071'; ctx.textAlign = 'right'; ctx.fillText('setpoint ±2 °C', W - R - 6, Y(g.sp + 2) - 9);
    // fan trace
    if (st.fans.length) {
      ctx.beginPath(); ctx.moveTo(X(0), FY(0));
      for (var i = 0; i < st.fans.length; i += 2) ctx.lineTo(X(i), FY(st.fans[i]));
      ctx.lineTo(X(st.fans.length - 1), FY(0)); ctx.closePath();
      ctx.fillStyle = 'rgba(217,163,91,.35)'; ctx.fill();
    }
    // temperature trace
    if (st.temps.length) {
      ctx.beginPath();
      for (var j = 0; j < st.temps.length; j += 2) { var yy = Y(Math.max(tmin, Math.min(tmax, st.temps[j]))); j ? ctx.lineTo(X(j), yy) : ctx.moveTo(X(j), yy); }
      ctx.strokeStyle = '#ff4f8b'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
      var k = st.temps.length - 1;
      ctx.fillStyle = '#ffd2e3'; ctx.beginPath(); ctx.arc(X(k), Y(Math.max(tmin, Math.min(tmax, st.temps[k]))), 3.5, 0, 7); ctx.fill();
    }
    // readouts
    var n = st.temps.length;
    read.temp.textContent = n ? st.temps[n - 1].toFixed(1) + ' °C' : '–';
    read.fan.textContent = n ? Math.round(st.fans[n - 1] * 100) + ' %' : '–';
    var settle = -1;
    for (var s = 0; s < n; s++) if (Math.abs(st.temps[s] - g.sp) <= 2) { settle = s; break; }
    read.time.textContent = settle >= 0 ? (settle / 60).toFixed(1) + ' min' : '–';
    if (settle >= 0 && n - settle > 120) {
      var dev = 0; for (var q = settle + 60; q < n; q++) dev = Math.max(dev, Math.abs(st.temps[q] - g.sp));
      read.band.textContent = '± ' + dev.toFixed(1) + ' °C';
    } else read.band.textContent = '–';
  }

  function sync() {
    outs.kp.textContent = (+ctl.kp.value).toFixed(0);
    outs.ki.textContent = (+ctl.ki.value).toFixed(2);
    outs.kd.textContent = (+ctl.kd.value).toFixed(0);
    outs.sp.textContent = ctl.sp.value + ' °C';
    outs.heat.textContent = ctl.heat.value + ' W';
  }
  Object.keys(ctl).forEach(function (k) { ctl[k].addEventListener('input', function () { sync(); if (!running) draw(); }); });
  var PRESETS = { trial: [150, 3, 0], tuned: [25, 0.2, 100], ponly: [30, 0, 0] };
  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = PRESETS[b.dataset.preset];
      ctl.kp.value = p[0]; ctl.ki.value = p[1]; ctl.kd.value = p[2];
      document.querySelectorAll('[data-preset]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      sync(); start();
    });
  });
  $('pidRun').addEventListener('click', start);
  $('pidSpike').addEventListener('click', function () { if (st) st.spike = 240; if (!running && st.t >= TEND) start(); });
  window.addEventListener('resize', size);
  sync(); reset(); size();
  // pre-run so the chart is complete at rest
  var g0 = gains(); while (st.t < TEND) step(g0); draw(); $('pidRun').textContent = 'Run again';
})();
