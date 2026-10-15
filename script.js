/* ==============================================================================
   DCE MODS LOADER [VERSUS] — INTERACTIVE WEB JAVASCRIPT
   Desarrollado por DCE STUDIOS | https://dcegaming.studio/
   ============================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initBackgroundSlideshow();
  initParticles();
  initTiltEffect();
  initSpotlightEffect();
  initShowcaseTabs();
  initGuideTabs();
  initFaqAccordion();
  initCopyButtons();
});

/* ==============================================================================
   0. BACKGROUND SLIDESHOW (dcegaming.studio style)
   ============================================================================== */
function initBackgroundSlideshow() {
  if (document.getElementById('bg-slideshow')) return;

  const slideshowImages = [
    'fondos/1.jpg',
    'fondos/2.jpg',
    'fondos/3.jpg',
    'fondos/4.jpg',
    'fondos/5.jpg'
  ];

  const slideshowContainer = document.createElement('div');
  slideshowContainer.id = 'bg-slideshow';

  slideshowImages.forEach((src, index) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'DCE Fondo ' + (index + 1);
    img.classList.add('bg-slide');
    if (index === 0) img.classList.add('active');
    img.loading = index === 0 ? 'eager' : 'lazy';
    slideshowContainer.appendChild(img);
  });

  const overlay = document.createElement('div');
  overlay.className = 'bg-slideshow-overlay';
  slideshowContainer.appendChild(overlay);

  document.body.prepend(slideshowContainer);

  let currentSlide = 0;
  const slides = slideshowContainer.querySelectorAll('.bg-slide');

  if (slides.length > 1) {
    setInterval(() => {
      slides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % slides.length;
      slides[currentSlide].classList.add('active');
    }, 6000);
  }
}

/* ==============================================================================
   1. NAVBAR & MOBILE MENU
   ============================================================================== */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  const links = document.querySelectorAll('.nav-link');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
    highlightCurrentSection();
  });

  if (navToggle && navLinks) {
    const updateMenuState = (isOpen) => {
      navLinks.classList.toggle('open', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
      const icon = navToggle.querySelector('i');
      if (icon) {
        icon.className = isOpen ? 'fas fa-times' : 'fas fa-bars';
      }
    };

    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !navLinks.classList.contains('open');
      updateMenuState(willOpen);
    });

    // Close when clicking ANY link inside drawer
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        updateMenuState(false);
      });
    });

    // Close when clicking outside navbar
    document.addEventListener('click', (e) => {
      if (navLinks.classList.contains('open') && !navbar.contains(e.target)) {
        updateMenuState(false);
      }
    });
  }

  function highlightCurrentSection() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    // If on a dedicated page (not index.html), highlight that page's nav link
    if (currentPath !== 'index.html' && currentPath !== '') {
      links.forEach(l => {
        const href = l.getAttribute('href');
        if (href && href.includes(currentPath)) {
          l.classList.add('active');
        } else if (!href || !href.startsWith('#')) {
          l.classList.remove('active');
        }
      });
      return;
    }

    // If on index.html, highlight hero if at top
    const scrollY = window.pageYOffset;
    const heroLink = document.querySelector('.nav-link[href="index.html"]');
    if (heroLink && scrollY < 300) {
      heroLink.classList.add('active');
    }
  }

  // Dropdown "Más"
  const dropdowns = document.querySelectorAll('.nav-dropdown');
  dropdowns.forEach(dropdown => {
    const btn = dropdown.querySelector('.nav-dropdown-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      // Close all other dropdowns
      dropdowns.forEach(d => d.classList.remove('open'));
      if (!isOpen) dropdown.classList.add('open');
      btn.setAttribute('aria-expanded', !isOpen);
    });
    // Close when a menu link is clicked
    dropdown.querySelectorAll('.nav-dropdown-menu a').forEach(a => {
      a.addEventListener('click', () => {
        dropdown.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    });
  });
  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    dropdowns.forEach(d => {
      d.classList.remove('open');
      const b = d.querySelector('.nav-dropdown-btn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ==============================================================================
   2. CANVAS ANIMATED FLAME PARTICLES
   ============================================================================== */
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const colors = [
    'rgba(255, 59, 0, ',    // Fiery red
    'rgba(255, 106, 0, ',   // Classic flame orange
    'rgba(255, 157, 0, ',   // Warm amber
    'rgba(255, 196, 0, '    // Golden yellow
  ];

  const particleCount = Math.min(Math.floor(window.innerWidth / 18), 70);
  const particles = [];

  class Particle {
    constructor() {
      this.reset(true);
    }

    reset(initial = false) {
      this.x = Math.random() * width;
      this.y = initial ? Math.random() * height : height + Math.random() * 20;
      this.size = Math.random() * 2.8 + 1;
      this.speedY = Math.random() * 0.9 + 0.3;
      this.speedX = (Math.random() - 0.5) * 0.5;
      this.opacity = Math.random() * 0.6 + 0.2;
      this.colorPrefix = colors[Math.floor(Math.random() * colors.length)];
      this.fadeSpeed = Math.random() * 0.003 + 0.001;
      this.wobble = Math.random() * Math.PI * 2;
      this.wobbleSpeed = Math.random() * 0.02 + 0.01;
    }

    update() {
      this.y -= this.speedY;
      this.wobble += this.wobbleSpeed;
      this.x += Math.sin(this.wobble) * 0.6 + this.speedX;
      this.opacity -= this.fadeSpeed;

      if (this.y < -20 || this.opacity <= 0 || this.x < -20 || this.x > width + 20) {
        this.reset();
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `${this.colorPrefix}${Math.max(0, this.opacity)})`;
      ctx.shadowBlur = this.size * 3;
      ctx.shadowColor = 'rgba(255, 106, 0, 0.8)';
      ctx.fill();
    }
  }

  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  let animationFrameId;
  let isVisible = true;

  document.addEventListener('visibilitychange', () => {
    isVisible = !document.hidden;
    if (isVisible) animate();
  });

  function animate() {
    if (!isVisible) return;
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  animate();
}

/* ==============================================================================
   3. 3D PERSPECTIVE TILT ON SHOWCASE WINDOW (MEDAL.TV 3D EFFECT)
   ============================================================================== */
function initTiltEffect() {
  const card = document.getElementById('showcase-window');
  if (!card) return;

  // Disable 3D tilt on mobile or touch-only screens for maximum performance & cleanliness
  if (window.innerWidth <= 768 || !window.matchMedia('(hover: hover)').matches) {
    return;
  }

  const wrapper = document.querySelector('.showcase-wrapper');
  if (!wrapper) return;

  wrapper.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;

    card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015, 1.015, 1.015)`;
  });

  wrapper.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
}

/* ==============================================================================
   3B. RAYCAST MOUSE SPOTLIGHT (INTERACTIVE GLOW)
   ============================================================================== */
function initSpotlightEffect() {
  const cards = document.querySelectorAll('.bento-card, .download-card, .donate-card, .dev-card, .page-card, .req-card, .changelog-card');
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

/* ==============================================================================
   3C. MEDAL.TV INTERACTIVE FEATURE SWITCHER TABS
   ============================================================================== */
function initShowcaseTabs() {
  const tabs = document.querySelectorAll('.showcase-tab');
  const descEl = document.getElementById('dynamic-desc-text');
  const banner = document.getElementById('showcase-dynamic-desc');
  if (!tabs.length || !descEl) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const desc = tab.getAttribute('data-desc');
      if (desc && descEl) {
        if (banner) {
          banner.style.opacity = '0.35';
          banner.style.transform = 'translateY(3px)';
        }
        setTimeout(() => {
          descEl.innerHTML = desc;
          if (banner) {
            banner.style.opacity = '1';
            banner.style.transform = 'translateY(0)';
          }
        }, 140);
      }
    });
  });
}


/* ==============================================================================
   4. GUIDE TABS SYSTEM
   ============================================================================== */
function initGuideTabs() {
  const tabButtons = document.querySelectorAll('.guide-tab-btn');
  const panels = document.querySelectorAll('.guide-content-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');

      tabButtons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

/* ==============================================================================
   5. FAQ ACCORDION
   ============================================================================== */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');

    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      // Close all other FAQs
      faqItems.forEach(otherItem => {
        otherItem.classList.remove('active');
        const otherAnswer = otherItem.querySelector('.faq-answer');
        if (otherAnswer) otherAnswer.style.maxHeight = null;
      });

      // Toggle clicked FAQ
      if (!isActive) {
        item.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });
}

/* ==============================================================================
   6. COPY TO CLIPBOARD BUTTONS WITH TOAST NOTIFICATION
   ============================================================================== */
function initCopyButtons() {
  const copyButtons = document.querySelectorAll('.copy-btn');
  const toast = document.getElementById('toast');

  copyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const textToCopy = btn.getAttribute('data-clipboard');
      if (!textToCopy) return;

      navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> ¡Copiado!';
        btn.style.background = '#27c93f';
        btn.style.color = '#000';

        showToast("Comando copiado al portapapeles con éxito");

        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = '';
          btn.style.color = '';
        }, 2200);
      }).catch(err => {
        console.error('Error al copiar:', err);
      });
    });
  });

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }
}
