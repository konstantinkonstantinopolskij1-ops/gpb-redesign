(() => {
  const dateFormatter = new Intl.DateTimeFormat(navigator.languages, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
  function localizeDates(root = document) {
    root.querySelectorAll('time[datetime]').forEach(element => {
      const value = new Date(element.dateTime);
      if (Number.isFinite(value.getTime())) element.textContent = dateFormatter.format(value);
    });
  }
  localizeDates();
  function fitFeedFigure(figure) {
    if (!figure.closest('.feed')) return;
    const stage = figure.querySelector('.illustration-stage');
    const [width, height] = getComputedStyle(stage).getPropertyValue('--svg-aspect').split('/').map(Number);
    if (!(width > 0 && height > 0)) return;
    const ratio = width / height;
    const chrome = [...figure.children].filter(child => child !== stage).reduce((total, child) => {
      const style = getComputedStyle(child);
      return style.display === 'none' ? total : total + child.getBoundingClientRect().height
        + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
    }, 0);
    // Leave room for the immutable renderer's inline SVG baseline. Narrow the
    // viewport proportionally instead of truncating a full-width tall SVG.
    const available = Math.max(1, 800 - chrome - 8);
    const maxWidth = parseFloat(stage.style.maxWidth) || Infinity;
    const fittedHeight = Math.min(available, Math.min(figure.clientWidth, maxWidth) / ratio);
    stage.style.width = fittedHeight * ratio + 'px';
    stage.style.height = fittedHeight + 8 + 'px';
  }
  const feedResize = new ResizeObserver(entries => {
    for (const entry of entries) fitFeedFigure(entry.target.closest('figure'));
  });
  const active = new Set(), visible = new Set(), states = new Map();
  let refreshTimer, pending = false, epoch = 0;
  const stateFor = figure => states.get(figure);
  const generation = session => {
    try { const token = JSON.parse(atob(session.token.split('.')[0].replaceAll('-', '+').replaceAll('_', '/'))); return JSON.stringify([token.revisionId, token.audience, token.generation]); }
    catch { throw new Error('Invalid illustration permission'); }
  };
  function send(figure, type) {
    const state = stateFor(figure);
    figure.querySelector('iframe')?.contentWindow?.postMessage({ type, nonce: state.nonce,
      session: state.session, remainingMs: Math.max(0, state.deadline - performance.now()) }, '*');
  }
  function stopVisual(figure) {
    const state = stateFor(figure);
    state.static?.remove(); state.static = null;
    const host = figure.querySelector('[data-svg-host]');
    if (host) host.replaceWith(host.cloneNode(false));
    const previous = figure.querySelector('iframe');
    if (previous) {
      send(figure, 'meatproxy:stop');
      const frame = previous.cloneNode(false); frame.removeAttribute('src'); frame.hidden = true;
      previous.replaceWith(frame);
    }
    active.delete(figure); state.ready = false; state.nonce = null;
  }
  function invalidate(figure, reason = 'This illustration is currently unavailable.') {
    const state = stateFor(figure); state.ticket++; state.authorized = false;
    clearTimeout(state.expiryTimer); stopVisual(figure);
    figure.querySelector('[role=status]').textContent = reason;
  }
  function display(figure) {
    const state = stateFor(figure);
    if (!state.authorized || state.deadline <= performance.now() || document.hidden || !visible.has(figure)) return;
    if (figure.hasAttribute('data-inline-svg')) {
      if (!state.static) {
        try { state.static = window.meatproxyStatic.mount(figure.querySelector('[data-svg-host]'), JSON.parse(figure.querySelector('[data-static-svg]').textContent)); }
        catch { invalidate(figure, 'This illustration could not load.'); return; }
      }
      state.ready = true; figure.querySelector('[role=status]').textContent = ''; fitFeedFigure(figure); return;
    }
    if (active.has(figure) || state.manualPaused || active.size >= 2) return;
    const target = new URL(state.renderUrl); target.pathname += '/' + figure.dataset.asset;
    state.nonce = crypto.randomUUID(); target.searchParams.set('reader', '1');
    target.searchParams.set('reader_nonce', state.nonce); target.searchParams.set('session', state.session.token);
    const previous = figure.querySelector('iframe'), frame = previous.cloneNode(false);
    frame.hidden = false; frame.inert = true; frame.style.opacity = '0';
    // Set src before attachment: frame restarts must not create Back-history entries.
    frame.src = target.href;
    frame.addEventListener('load', () => send(figure, 'meatproxy:lease'));
    previous.replaceWith(frame); active.add(figure);
    const toggle = figure.querySelector('[data-toggle]'); if (toggle) toggle.textContent = 'Pause interaction';
  }
  function scheduleRefresh(delay = 20000) { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, delay); }
  async function refresh() {
    if (pending || document.hidden || !visible.size) return;
    const figures = [...visible], tickets = new Map(figures.map(figure => [figure, stateFor(figure).ticket]));
    const ids = [...new Set(figures.map(figure => figure.dataset.revision))];
    const requestEpoch = epoch; pending = true;
    try {
      // One request for all nearby revisions, with bounded chunks for long comment pages.
      for (let offset = 0; offset < ids.length; offset += 60) {
        const batch = ids.slice(offset, offset + 60), requestedAt = performance.now();
        const response = await fetch('/api/meatproxy/render-sessions?revisions=' + batch.join(','),
          { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Illustration permission unavailable');
        const data = await response.json();
        if (requestEpoch !== epoch || document.hidden) return;
        for (const figure of figures.filter(figure => batch.includes(figure.dataset.revision))) {
          const state = stateFor(figure);
          if (!visible.has(figure) || state.ticket !== tickets.get(figure)) continue;
          const record = data.sessions?.[figure.dataset.revision], session = record?.session;
          const lifetime = session?.expiresAt - session?.issuedAt, deadline = requestedAt + lifetime;
          if (!session || !Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 30000 || deadline <= performance.now()) { invalidate(figure); continue; }
          const nextGeneration = generation(session);
          if (state.authorized && state.generation !== nextGeneration) { invalidate(figure); continue; }
          state.session = session; state.deadline = deadline; state.renderUrl = record.render_url;
          state.generation = nextGeneration; state.authorized = true;
          clearTimeout(state.expiryTimer); state.expiryTimer = setTimeout(() => invalidate(figure), Math.max(0, deadline - performance.now()));
          if (active.has(figure)) send(figure, 'meatproxy:lease');
          display(figure);
        }
      }
    } catch {
      if (requestEpoch === epoch) for (const figure of figures) if (stateFor(figure).ticket === tickets.get(figure)) invalidate(figure);
    } finally {
      pending = false;
      if (!document.hidden && visible.size) scheduleRefresh(requestEpoch !== epoch || [...visible].some(figure => !figures.includes(figure)) ? 80 : 20000);
    }
  }
  function fill() {
    if (document.hidden) return;
    const ordered = [...visible].sort((a, b) => Math.abs(a.getBoundingClientRect().top) - Math.abs(b.getBoundingClientRect().top));
    for (const figure of ordered) display(figure);
    if (!pending && ordered.some(figure => !stateFor(figure).authorized)) scheduleRefresh(80);
  }
  window.addEventListener('message', event => {
    if (event.origin !== 'null') return;
    for (const figure of active) {
      const state = stateFor(figure), frame = figure.querySelector('iframe');
      if (event.source !== frame.contentWindow || event.data?.nonce !== state.nonce || !state.authorized || state.deadline <= performance.now()) continue;
      if (event.data.type === 'meatproxy:ready') {
        state.ready = true; frame.inert = false; frame.style.opacity = '1';
        figure.querySelector('[role=status]').textContent = ''; fitFeedFigure(figure);
      } else if (event.data.type === 'meatproxy:failed') invalidate(figure, 'This illustration could not run.');
    }
  });
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else { visible.delete(entry.target); invalidate(entry.target, 'Illustration pauses while off screen.'); }
    }
    fill();
  }, { rootMargin: '200px 0px' });
  function initializeFigures(root = document) {
    for (const figure of root.querySelectorAll('figure[data-revision]')) {
      if (states.has(figure)) continue;
      states.set(figure, { ticket: 0, authorized: false, ready: false, manualPaused: false });
      figure.querySelector('[data-toggle]')?.addEventListener('click', event => {
        const state = stateFor(figure);
        if (active.has(figure) && !state.manualPaused) {
          state.manualPaused = true; send(figure, 'meatproxy:pause'); event.currentTarget.textContent = 'Resume interaction';
        } else {
          state.manualPaused = false;
          if (active.has(figure)) send(figure, 'meatproxy:resume');
          else {
            if (active.size >= 2) {
              const other = [...active].find(item => stateFor(item).manualPaused) || [...active].at(-1);
              stateFor(other).manualPaused = true; stopVisual(other);
              const toggle = other.querySelector('[data-toggle]'); if (toggle) toggle.textContent = 'Resume interaction';
              other.querySelector('[role=status]').textContent = 'Interaction is paused.';
            }
            if (state.authorized) display(figure); else scheduleRefresh(0);
          }
          event.currentTarget.textContent = 'Pause interaction';
        }
      });
      if (figure.closest('.feed')) { fitFeedFigure(figure); feedResize.observe(figure); }
      observer.observe(figure);
    }
  }
  initializeFigures();
  document.addEventListener('meatproxy:comments-added', () => { initializeFigures(document.getElementById('comment-list') || document); localizeDates(); });
  function clearPage() {
    epoch++; clearTimeout(refreshTimer);
    states.forEach((_state, figure) => invalidate(figure, 'Illustration pauses while this page is hidden.'));
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearPage(); else fill(); });
  window.addEventListener('pagehide', clearPage);
  window.addEventListener('pageshow', fill);
  document.getElementById('share-post')?.addEventListener('click', async () => {
    const status = document.getElementById('share-status');
    try { await navigator.clipboard.writeText(document.querySelector('link[rel=canonical]').href); status.textContent = 'Link copied.'; }
    catch { status.textContent = 'Copy this page’s address to share it.'; }
  });
  document.getElementById('report-post')?.addEventListener('click', async event => {
    const reason = prompt('Describe the problem for automatic review (in English):');
    if (!reason?.trim()) return;
    const status = document.getElementById('share-status');
    try {
      const response = await fetch('/api/meatproxy/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision_id: event.currentTarget.dataset.revision, reason: 'content', details: reason }), credentials: 'omit' });
      status.textContent = response.ok ? 'Sent for automatic review.' : 'Report could not be accepted. Please retry later.';
    } catch { status.textContent = 'Report could not be sent.'; }
  });
})();
