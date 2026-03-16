/* ═══════════════════════════════════════════════════════════════════════════════
   RecoMe Manual — Script
   ═══════════════════════════════════════════════════════════════════════════════ */

// ── Nav scroll effect ────────────────────────────────────────────────────────
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

// ── Mobile nav toggle ────────────────────────────────────────────────────────
const navToggle = document.getElementById('navToggle');
const navMobile = document.getElementById('navMobile');

if (navToggle && navMobile) {
  navToggle.addEventListener('click', () => navMobile.classList.toggle('open'));
  navMobile.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => navMobile.classList.remove('open'));
  });
}

// ── Sidebar active link tracking ─────────────────────────────────────────────
const sidebarLinks = document.querySelectorAll('.sidebar-link');
const sections = document.querySelectorAll('.manual-section');

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        sidebarLinks.forEach((link) => {
          link.classList.toggle('active', link.dataset.section === id);
        });
      }
    });
  },
  { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
);

sections.forEach((section) => sectionObserver.observe(section));

// Smooth scroll for sidebar links
sidebarLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById(link.dataset.section);
    if (target) {
      const offset = (nav ? nav.offsetHeight : 64) + 16;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ── Search ───────────────────────────────────────────────────────────────────
const searchInput = document.getElementById('manualSearch');
const searchResults = document.getElementById('searchResults');

if (searchInput && searchResults) {
  // Build search index from sections
  const searchIndex = [];
  sections.forEach((section) => {
    const id = section.id;
    const title = section.querySelector('h2')?.textContent || '';
    const keywords = section.dataset.searchKeywords || '';
    const text = section.textContent.toLowerCase();
    searchIndex.push({ id, title, keywords: keywords.toLowerCase(), text });
  });

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    if (query.length < 2) {
      searchResults.classList.remove('active');
      searchResults.innerHTML = '';
      return;
    }

    const matches = searchIndex.filter((item) => {
      return item.title.toLowerCase().includes(query) ||
             item.keywords.includes(query) ||
             item.text.includes(query);
    });

    if (matches.length === 0) {
      searchResults.innerHTML = '<div class="search-no-results">No results found</div>';
      searchResults.classList.add('active');
      return;
    }

    searchResults.innerHTML = matches.slice(0, 8).map((item) => {
      // Find the group this section belongs to
      const sidebarLink = document.querySelector(`.sidebar-link[data-section="${item.id}"]`);
      const group = sidebarLink?.closest('.sidebar-group')?.querySelector('.sidebar-heading')?.textContent || '';
      return `<a href="#${item.id}" class="search-result-item" data-section="${item.id}">
        ${item.title}
        ${group ? `<span class="search-badge">${group}</span>` : ''}
      </a>`;
    }).join('');

    searchResults.classList.add('active');

    // Add click handlers to results
    searchResults.querySelectorAll('.search-result-item').forEach((result) => {
      result.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(result.dataset.section);
        if (target) {
          const offset = (nav ? nav.offsetHeight : 64) + 16;
          const top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
        searchResults.classList.remove('active');
        searchInput.value = '';
      });
    });
  });

  // Close search results when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.classList.remove('active');
    }
  });

  // Close on Escape
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchResults.classList.remove('active');
      searchInput.blur();
    }
  });
}

// ── Interactive Onboarding Demo ──────────────────────────────────────────────
const onboardingNext = document.getElementById('onboardingNext');
const onboardingSlides = document.getElementById('onboardingSlides');

if (onboardingNext && onboardingSlides) {
  let currentStep = 0;
  const slides = onboardingSlides.querySelectorAll('.demo-slide');
  const dots = document.querySelectorAll('.demo-dot');
  const totalSteps = slides.length;

  function goToStep(step) {
    currentStep = step;
    slides.forEach((s, i) => s.classList.toggle('active', i === step));
    dots.forEach((d, i) => d.classList.toggle('active', i === step));
    onboardingNext.textContent = step === totalSteps - 1 ? 'Restart' : 'Next';
  }

  onboardingNext.addEventListener('click', () => {
    if (currentStep >= totalSteps - 1) {
      // Reset all chips
      document.querySelectorAll('.demo-chip').forEach((c) => c.classList.remove('selected'));
      goToStep(0);
    } else {
      goToStep(currentStep + 1);
    }
  });

  // Toggle chips on click
  document.querySelectorAll('.demo-chip[data-toggle]').forEach((chip) => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
    });
  });
}

// ── Smooth anchor scrolling for in-page links ────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      const offset = (nav ? nav.offsetHeight : 64) + 16;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});
