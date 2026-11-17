/**
 * PinUI Theme Switch Engine (Droplet + Radial Flood + Damped Recoil)
 * Adapted for Zphysics Light (Warm Paper) & Dark (Technical Ink) themes.
 */
(function () {
  const THEME_STORAGE_KEY = 'zphysics_theme';
  const PREMIUM_MODE_KEY = 'zphysics_premium_mode';
  let isSwitching = false;

  // 49-point damped harmonic oscillator curve (bounce = 0.3) from PinUI
  function buildSpringLinear(bounce = 0.3, steps = 48) {
    const zeta = Math.max(0.05, 1 - bounce * 0.72);
    const omega = 13.5;
    const wd = omega * Math.sqrt(Math.max(0.01, 1 - zeta * zeta));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const env = Math.exp(-zeta * omega * t);
      const val = 1 - env * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
      pts.push((t === 1 ? 1 : val).toFixed(4));
    }
    return `linear(${pts.join(', ')})`;
  }

  const SPRING_EASE = buildSpringLinear(0.3);

  function pressButton(el, depth = 0.1) {
    if (!el || typeof el.animate !== 'function') return;
    const minScale = 1 - depth;
    const down = el.animate(
      [{ transform: 'scale(1)' }, { transform: `scale(${minScale})` }],
      { duration: 85, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }
    );
    down.finished.then(() => {
      el.animate(
        [{ transform: `scale(${minScale})` }, { transform: 'scale(1)' }],
        { duration: 480, easing: SPRING_EASE }
      );
      down.cancel();
    }).catch(() => {});
  }

  function resolveInitialTheme(defaultTheme) {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
      }
      const premMode = localStorage.getItem(PREMIUM_MODE_KEY);
      if (premMode === 'light' || premMode === 'dark') {
        return premMode;
      }
    } catch (e) {}
    return defaultTheme || 'light';
  }

  function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);

    if (document.body) {
      if (document.body.classList.contains('premium-theme') || next === 'dark') {
        document.body.classList.toggle('premium-light', next === 'light');
      }
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
      localStorage.setItem(PREMIUM_MODE_KEY, next);
    } catch (e) {}

    document.querySelectorAll('.pts-toggle').forEach((btn) => {
      btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
      btn.title = next === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối';
    });

    if (typeof window.updateThemeToggleLabel === 'function') {
      window.updateThemeToggleLabel(next === 'light');
    }
  }

  function createDropletSVG(isToDark) {
    const uid = 'ptsDrop_' + Math.random().toString(36).slice(2, 7);
    const cTop = isToDark ? '#5eead4' : '#2dd4bf';
    const cBot = isToDark ? '#0f766e' : '#0d9488';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 22 30');
    svg.classList.add('pts-drop');

    const defs = document.createElementNS(ns, 'defs');
    const grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', uid);
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%');
    grad.setAttribute('y2', '100%');

    const s1 = document.createElementNS(ns, 'stop');
    s1.setAttribute('offset', '0%');
    s1.setAttribute('stop-color', cTop);
    const s2 = document.createElementNS(ns, 'stop');
    s2.setAttribute('offset', '100%');
    s2.setAttribute('stop-color', cBot);
    grad.appendChild(s1);
    grad.appendChild(s2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M11 1.5C11 1.5 2 12.2 2 19a9 9 0 0 0 18 0C20 12.2 11 1.5 11 1.5Z');
    path.setAttribute('fill', `url(#${uid})`);
    svg.appendChild(path);

    const hl = document.createElementNS(ns, 'ellipse');
    hl.setAttribute('cx', '7.6');
    hl.setAttribute('cy', '16.5');
    hl.setAttribute('rx', '1.8');
    hl.setAttribute('ry', '3.8');
    hl.setAttribute('transform', 'rotate(-16 7.6 16.5)');
    hl.setAttribute('fill', 'rgba(255,255,255,0.45)');
    svg.appendChild(hl);

    return svg;
  }

  function spawnRipples(fxLayer, cx, cy, isToDark) {
    const color = isToDark ? '#2dd4bf' : '#0d9488';
    [0, 110].forEach((delay) => {
      const ring = document.createElement('div');
      ring.className = 'pts-ripple';
      ring.style.left = cx + 'px';
      ring.style.top = cy + 'px';
      ring.style.borderColor = color;
      fxLayer.appendChild(ring);

      ring.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.5)', opacity: delay === 0 ? 0.6 : 0.4 },
          { transform: 'translate(-50%, -50%) scale(3.8)', opacity: 0 }
        ],
        {
          duration: 640,
          delay,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards'
        }
      );
    });
  }

  function triggerPinThemeSwitch(btn) {
    if (isSwitching) return;

    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    const isToDark = next === 'dark';

    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !btn || typeof btn.getBoundingClientRect !== 'function') {
      applyTheme(next);
      return;
    }

    isSwitching = true;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.hypot(
      Math.max(cx, window.innerWidth - cx),
      Math.max(cy, window.innerHeight - cy)
    );

    const fxLayer = document.createElement('div');
    fxLayer.className = 'pts-fx';
    document.body.appendChild(fxLayer);

    // Phase 1: Falling water droplet from above button
    const startY = Math.max(6, cy - 132);
    const drop = createDropletSVG(isToDark);
    drop.style.left = cx + 'px';
    drop.style.top = '0px';
    fxLayer.appendChild(drop);

    const fallDuration = 185;
    const fallAnim = drop.animate(
      [
        { transform: `translate(-50%, ${startY - 26}px) scale(0.86, 1.16)`, opacity: 0 },
        { transform: `translate(-50%, ${startY}px) scale(0.88, 1.15)`, opacity: 1, offset: 0.18 },
        { transform: `translate(-50%, ${cy - 4}px) scale(0.86, 1.18)`, opacity: 1 }
      ],
      {
        duration: fallDuration,
        easing: 'cubic-bezier(0.55, 0.05, 0.85, 0.25)',
        fill: 'forwards'
      }
    );

    const cleanup = () => {
      setTimeout(() => {
        if (fxLayer.parentNode) fxLayer.remove();
        isSwitching = false;
      }, 720);
    };

    fallAnim.finished.then(() => {
      // Impact squash & fade
      drop.animate(
        [
          { transform: `translate(-50%, ${cy - 4}px) scale(1.26, 0.72)`, opacity: 1 },
          { transform: `translate(-50%, ${cy}px) scale(1.45, 0.45)`, opacity: 0 }
        ],
        { duration: 90, easing: 'ease-out', fill: 'forwards' }
      );

      // Tactile button recoil & ripples
      pressButton(btn, 0.10);
      spawnRipples(fxLayer, cx, cy, isToDark);

      // Phase 2: Radial clip-path reveal across screen
      if (typeof document.startViewTransition === 'function') {
        try {
          const vt = document.startViewTransition(() => {
            applyTheme(next);
          });
          vt.ready.then(() => {
            document.documentElement.animate(
              {
                clipPath: [
                  `circle(0px at ${cx}px ${cy}px)`,
                  `circle(${maxR}px at ${cx}px ${cy}px)`
                ]
              },
              {
                duration: 620,
                easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
                pseudoElement: '::view-transition-new(root)'
              }
            );
          }).catch(() => {});
          vt.finished.finally(cleanup);
          return;
        } catch (e) {}
      }

      // Fallback flood element
      const flood = document.createElement('div');
      flood.className = 'pts-flood';
      flood.style.backgroundColor = isToDark ? '#0b0d14' : '#f7f4ee';
      fxLayer.insertBefore(flood, fxLayer.firstChild);

      const floodAnim = flood.animate(
        [
          { clipPath: `circle(0px at ${cx}px ${cy}px)` },
          { clipPath: `circle(${maxR}px at ${cx}px ${cy}px)` }
        ],
        {
          duration: 540,
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
          fill: 'forwards'
        }
      );

      floodAnim.finished.then(() => {
        applyTheme(next);
        cleanup();
      }).catch(() => {
        applyTheme(next);
        cleanup();
      });
    }).catch(() => {
      applyTheme(next);
      cleanup();
    });

    // Safety watchdog
    setTimeout(() => {
      if (isSwitching) {
        if (fxLayer.parentNode) fxLayer.remove();
        isSwitching = false;
      }
    }, 3000);
  }

  function initPinTheme(defaultTheme) {
    const initial = resolveInitialTheme(defaultTheme);
    applyTheme(initial);
  }

  window.PinUI = {
    initTheme: initPinTheme,
    applyTheme: applyTheme,
    toggleTheme: triggerPinThemeSwitch,
    pressButton: pressButton
  };
})();
