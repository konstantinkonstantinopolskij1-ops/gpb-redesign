/* PAPER SIGNAL — progressive enhancement only.
   No dependencies, no inline execution (CSP friendly). */
(() => {
  const root = document.documentElement;
  root.classList.add('js');

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Marks that settle into place as the paper is turned. */
  if (!reduce && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll('.will-rise, .will-fade, .plate, .entry');
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    targets.forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll('.will-rise, .will-fade').forEach((el) => el.classList.add('is-in'));
  }

  /* Feed ledger: "Latest" is the printed order; "Top" re-sorts by points.
     Both stay ordinary links, so the page works with JavaScript off. */
  const entries = document.querySelector('.entries');
  const tabs = document.querySelectorAll('.tabs a[data-sort]');
  if (entries && tabs.length) {
    const applySort = (mode) => {
      if (mode !== 'top') return;
      const rows = [...entries.querySelectorAll('.entry')];
      rows
        .sort((a, b) => Number(b.dataset.points || 0) - Number(a.dataset.points || 0))
        .forEach((row) => entries.appendChild(row));
    };
    const current = new URLSearchParams(location.search).get('sort') || 'new';
    tabs.forEach((tab) => {
      const isCurrent = tab.dataset.sort === current;
      if (isCurrent) tab.setAttribute('aria-current', 'true');
      else tab.removeAttribute('aria-current');
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        tabs.forEach((t) => t.removeAttribute('aria-current'));
        tab.setAttribute('aria-current', 'true');
        applySort(tab.dataset.sort);
        if (history.replaceState) history.replaceState(null, '', tab.getAttribute('href'));
      });
    });
    applySort(current);
  }

  /* Article controls: the source link is real; report and the guest slip
     acknowledge the click without pretending to reach a backend. */
  const status = document.querySelector('[data-control-status]');
  const say = (text) => { if (status) status.textContent = text; };
  document.querySelectorAll('[data-control]').forEach((el) => {
    el.addEventListener('click', () => {
      const what = el.dataset.control;
      if (what === 'report') say('Report noted locally — this demo does not send anything to the board.');
      if (what === 'comment') say('Comment held locally — this demo does not publish to the board.');
    });
  });
  document.querySelectorAll('form.guest-slip').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      say('Comment held locally — this demo does not publish to the board.');
    });
  });
})();
