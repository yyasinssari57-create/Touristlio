/**
 * [YÜKSEK-1] Homepage hero background carousel.
 * Overlay copy (slogan, search, city pills) stays in .hc and is never moved.
 */
(function () {
  'use strict';

  const INTERVAL_MS = 5000;
  const carousel = document.querySelector('.hero-carousel');
  const slides = carousel ? carousel.querySelectorAll('.hero-slide') : [];
  if (!carousel || slides.length < 2) return;

  let current = 0;
  let timer = null;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function exploreVisible() {
    const page = document.getElementById('page-explore');
    return !page || page.classList.contains('active');
  }

  function nextSlide() {
    if (document.hidden || !exploreVisible()) return;
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
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

  if (!reduced) startCarousel();
})();
