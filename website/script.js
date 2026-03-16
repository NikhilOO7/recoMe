/* ═══════════════════════════════════════════════════════════════════════════════
   RecoMe Landing Page — Script
   ═══════════════════════════════════════════════════════════════════════════════ */

// ── Scroll animations ────────────────────────────────────────────────────────
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const delay = parseInt(entry.target.dataset.delay || '0', 10);
        setTimeout(() => entry.target.classList.add('visible'), delay);
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));

// ── Nav scroll effect ────────────────────────────────────────────────────────
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

// ── Mobile nav toggle ────────────────────────────────────────────────────────
const navToggle = document.getElementById('navToggle');
const navMobile = document.getElementById('navMobile');

navToggle.addEventListener('click', () => {
  navMobile.classList.toggle('open');
});

// Close mobile nav on link click
navMobile.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => navMobile.classList.remove('open'));
});

// ── Feature carousel ─────────────────────────────────────────────────────────
const track = document.getElementById('carouselTrack');
const slides = track.querySelectorAll('.feature-slide');
const dotsContainer = document.getElementById('carouselDots');
const prevBtn = document.getElementById('carouselPrev');
const nextBtn = document.getElementById('carouselNext');

let currentSlide = 0;
const totalSlides = slides.length;
let autoplayTimer = null;

// Create dots
for (let i = 0; i < totalSlides; i++) {
  const dot = document.createElement('div');
  dot.className = `dot${i === 0 ? ' active' : ''}`;
  dot.setAttribute('role', 'button');
  dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
  if (i === 0) dot.setAttribute('aria-current', 'true');
  dot.addEventListener('click', () => goToSlide(i));
  dotsContainer.appendChild(dot);
}

function goToSlide(index) {
  currentSlide = ((index % totalSlides) + totalSlides) % totalSlides;
  track.style.transform = `translateX(-${currentSlide * 100}%)`;
  dotsContainer.querySelectorAll('.dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === currentSlide);
    if (i === currentSlide) {
      dot.setAttribute('aria-current', 'true');
    } else {
      dot.removeAttribute('aria-current');
    }
  });
  resetAutoplay();
}

prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));

// Swipe support
let touchStartX = 0;
let touchEndX = 0;

track.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

track.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) > 50) {
    goToSlide(diff > 0 ? currentSlide + 1 : currentSlide - 1);
  }
}, { passive: true });

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') goToSlide(currentSlide - 1);
  if (e.key === 'ArrowRight') goToSlide(currentSlide + 1);
});

// Autoplay
function startAutoplay() {
  autoplayTimer = setInterval(() => goToSlide(currentSlide + 1), 5000);
}

function resetAutoplay() {
  clearInterval(autoplayTimer);
  startAutoplay();
}

startAutoplay();

// Pause autoplay when carousel is hovered
const carousel = document.querySelector('.feature-carousel');
carousel.addEventListener('mouseenter', () => clearInterval(autoplayTimer));
carousel.addEventListener('mouseleave', () => startAutoplay());

// ── Smooth anchor scrolling (offset for fixed nav) ──────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = nav.offsetHeight + 16;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});
