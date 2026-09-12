/* First Door redesign — progressive enhancement only.
   No dependencies, no inline execution (CSP friendly). */
(() => {
  document.documentElement.classList.add('js');

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Reveal blocks as they enter the viewport (skipped when motion is reduced). */
  if (!reduce && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll('section.block, .card, .route, .invite, .article header, .prose > *');
    targets.forEach(el => el.classList.add('will-reveal'));
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          io.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach(el => io.observe(el));
  }

  /* Article reading progress — a thin line at the top of the page. */
  const prose = document.querySelector('.prose');
  if (prose && !reduce) {
    const bar = document.createElement('div');
    bar.setAttribute('aria-hidden', 'true');
    bar.style.cssText = 'position:fixed;left:0;top:0;height:2px;width:0;z-index:9;background:linear-gradient(90deg,#c8ff6a,#59f0d0,#8b7dff);transition:width .1s linear';
    document.body.appendChild(bar);
    const update = () => {
      const rect = prose.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      bar.style.width = (progress * 100) + '%';
    };
    update();
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update, { passive: true });
  }
})();
