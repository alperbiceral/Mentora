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
