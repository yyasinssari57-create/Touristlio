/**
 * [YÜKSEK-1] Homepage hero background carousel.
 * Overlay copy (slogan, search, city pills) stays in .hc and is never moved.
 * The first slide (.hbg) is painted by CSS and downloads immediately.
 * Later slides keep their URL in data-bg and download only after window load,
 * just before they fade in. The fade timing stays 5s / 1.5s.
 */
(function () {
  'use strict';

  const INTERVAL_MS = 5000;
  const PRELOAD_AFTER_LOAD_MS = 1200;
  const carousel = document.querySelector('.hero-carousel');
  const slides = carousel ? Array.from(carousel.querySelectorAll('.hero-slide')) : [];
  if (!carousel || slides.length < 2) return;

  let current = 0;
  let timer = null;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function exploreVisible() {
    const page = document.getElementById('page-explore');
    return !page || page.classList.contains('active');
  }

  function slideUrl(slide) {
    const raw = slide.getAttribute('data-bg') || '';
    if (!raw || /[\s"'()]/.test(raw) || !/^https:\/\//i.test(raw)) return '';
    return raw;
  }

  function applyBg(slide) {
    const url = slideUrl(slide);
    if (!url || slide.dataset.bgOn === '1') return;
    slide.style.backgroundImage = `url("${url}")`;
    slide.dataset.bgOn = '1';
  }

  function preloadSlide(index) {
    const slide = slides[index];
    if (!slide) return;
    const url = slideUrl(slide);
    if (!url || slide.dataset.bgOn === '1' || slide.dataset.bgBusy === '1') return;
    slide.dataset.bgBusy = '1';
    const img = new Image();
    const done = () => {
      applyBg(slide);
      slide.dataset.bgBusy = '0';
    };
    img.onload = done;
    img.onerror = done;
    img.src = url;
  }

  function nextSlide() {
    if (document.hidden || !exploreVisible()) return;
    const upcoming = (current + 1) % slides.length;
    applyBg(slides[upcoming]);
    slides[current].classList.remove('active');
    current = upcoming;
    slides[current].classList.add('active');
    preloadSlide((current + 1) % slides.length);
  }

  function startCarousel() {
    stopCarousel();
    if (reduced || slides.length < 2) return;
    timer = setInterval(nextSlide, INTERVAL_MS);
  }

  function stopCarousel() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCarousel();
    else startCarousel();
  });

  function armDeferredSlides() {
    if (reduced) return;
    window.setTimeout(() => preloadSlide(1), PRELOAD_AFTER_LOAD_MS);
  }

  if (document.readyState === 'complete') armDeferredSlides();
  else window.addEventListener('load', armDeferredSlides, { once: true });

  if (!reduced) startCarousel();
})();
