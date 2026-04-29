const navLinks = document.querySelectorAll('.site-nav a');
const sections = document.querySelectorAll('main section[id]');
const introHero = document.querySelector('#introduction');
const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const sectionMap = new Map();
sections.forEach((section) => {
  sectionMap.set(`#${section.id}`, section);
});

function setIntroHeroProgress() {
  if (!introHero || reduceMotionQuery.matches) {
    return;
  }

  const heroHeight = Math.max(introHero.offsetHeight, window.innerHeight);
  const progress = Math.min(Math.max(window.scrollY / heroHeight, 0), 1);
  const translateY = -progress * heroHeight * 0.3;
  const blur = progress * 10;

  introHero.style.setProperty('--intro-shift', `${translateY.toFixed(2)}px`);
  introHero.style.setProperty('--intro-blur', `${blur.toFixed(2)}px`);
}

function setActiveNavLink() {
  const scrollPosition = window.scrollY + 140;
  let currentId = '';

  navLinks.forEach((link) => {
    const target = sectionMap.get(link.getAttribute('href'));
    if (target && scrollPosition >= target.offsetTop) {
      currentId = target.id;
    }
  });

  navLinks.forEach((link) => {
    const isActive = link.getAttribute('href') === `#${currentId}`;
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function onScroll() {
  setIntroHeroProgress();
  setActiveNavLink();
}

function onLoad() {
  setIntroHeroProgress();
  setActiveNavLink();
}

window.addEventListener('scroll', onScroll);
window.addEventListener('resize', setIntroHeroProgress);
window.addEventListener('load', onLoad);

// If the promo video can't be loaded, hide the broken player and show a clean placeholder.
window.addEventListener('DOMContentLoaded', () => {
  const video = document.querySelector('.promo-video');
  const placeholder = document.querySelector('.video-placeholder');
  const videoFrame = document.querySelector('.video-frame');

  if (!video || !placeholder) return;

  const showVideo = () => {
    placeholder.style.display = 'none';
    video.style.display = 'block';
    // Ensure autoplay starts after we reveal the player.
    video.play().catch(() => {});
  };

  const showPlaceholder = () => {
    video.style.display = 'none';
    placeholder.style.display = 'flex';
  };

  // Default state: keep the placeholder visible until the video is ready.
  showPlaceholder();

  // Successful load paths:
  video.addEventListener('loadeddata', showVideo, { once: true });
  video.addEventListener('canplay', showVideo, { once: true });

  // Failure path:
  video.addEventListener('error', showPlaceholder, { once: true });

  // Keep autoplay browser-friendly.
  video.muted = true;

  // Controls behavior:
  // - Desktop: reveal controls on hover/focus for a cleaner look.
  // - Touch devices: keep controls visible since hover is unavailable.
  const prefersTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  const showControls = () => {
    video.setAttribute('controls', '');
  };

  const hideControls = () => {
    video.removeAttribute('controls');
  };

  if (prefersTouch) {
    showControls();
  } else if (videoFrame) {
    hideControls();
    videoFrame.addEventListener('mouseenter', showControls);
    videoFrame.addEventListener('mouseleave', hideControls);
    video.addEventListener('focus', showControls);
    video.addEventListener('blur', hideControls);
  }
});
