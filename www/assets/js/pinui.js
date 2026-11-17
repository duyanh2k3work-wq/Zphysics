/**
 * PinUI Theme Switch Engine (Radial Flood + Damped Recoil)
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
    const startAt = performance.now();
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

    const cleanup = () => {
      const remaining = Math.max(0, 760 - (performance.now() - startAt));
      setTimeout(() => {
        if (fxLayer.parentNode) fxLayer.remove();
        isSwitching = false;
      }, remaining);
    };

    // Immediate tactile button recoil & radial ripples
    pressButton(btn, 0.10);
    spawnRipples(fxLayer, cx, cy, isToDark);

    // Radial clip-path reveal across screen
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
              duration: 560,
              easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
              pseudoElement: '::view-transition-new(root)'
            }
          );
        }).catch(() => {});
        vt.finished.finally(cleanup);
      } catch (e) {
        applyTheme(next);
        cleanup();
      }
    } else {
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
    }

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

  function initNumberTicker(root) {
    const scope = root || document;
    const els = scope.querySelectorAll('[data-count-to]');
    if (!els.length) return;

    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animateEl = (el) => {
      if (el.dataset.counted === '1') return;
      el.dataset.counted = '1';
      const target = parseFloat(el.getAttribute('data-count-to') || '0');
      const suffix = el.getAttribute('data-count-suffix') || '';
      const useComma = el.getAttribute('data-count-comma') === '1';
      const duration = 900;

      const formatVal = (n) => {
        const rounded = Math.round(n);
        const str = useComma ? rounded.toLocaleString('en-US') : String(rounded);
        return str + (suffix ? `<span>${suffix}</span>` : '');
      };

      if (reducedMotion || isNaN(target)) {
        el.innerHTML = formatVal(target);
        return;
      }

      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.innerHTML = formatVal(target * eased);
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          el.innerHTML = formatVal(target);
        }
      };
      requestAnimationFrame(tick);
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateEl(entry.target);
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.25 });
      els.forEach((el) => io.observe(el));
    } else {
      els.forEach(animateEl);
    }
  }

  window.PinUI = {
    initTheme: initPinTheme,
    applyTheme: applyTheme,
    toggleTheme: triggerPinThemeSwitch,
    pressButton: pressButton,
    initNumberTicker: initNumberTicker
  };
})();
