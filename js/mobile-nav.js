(function(){
  function initMobileNav(){
    const header = document.querySelector('.site-header');
    const navWrap = document.querySelector('.site-header .nav');
    const nav = document.querySelector('.site-header nav');
    if(!header || !navWrap || !nav) return;

    let toggle = document.querySelector('.nav-toggle');
    if(!toggle){
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'nav-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Menü megnyitása');
      toggle.innerHTML = '<span></span><span></span><span></span>';
      navWrap.insertBefore(toggle, nav);
    }

    let backdrop = document.querySelector('.nav-backdrop');
    if(!backdrop){
      backdrop = document.createElement('div');
      backdrop.className = 'nav-backdrop';
      document.body.appendChild(backdrop);
    }

    function isMobile(){ return window.innerWidth <= 860; }

    function closeMenu(){
      header.classList.remove('nav-open');
      document.body.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
    function openMenu(){
      if(!isMobile()) return;
      header.classList.add('nav-open');
      document.body.classList.add('nav-open');
      toggle.setAttribute('aria-expanded', 'true');
    }

    if (!toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        if(!isMobile()) return;
        if(header.classList.contains('nav-open')) closeMenu(); else openMenu();
      });
    }

    if (!backdrop.dataset.bound) {
      backdrop.dataset.bound = '1';
      backdrop.addEventListener('click', closeMenu);
    }

    if (!nav.dataset.bound) {
      nav.dataset.bound = '1';
      nav.addEventListener('click', function(e){
        const target = e.target.closest('a,button');
        if(target && isMobile()) closeMenu();
      });
    }

    if (!document.body.dataset.navEscBound) {
      document.body.dataset.navEscBound = '1';
      document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeMenu(); });
      window.addEventListener('pageshow', closeMenu);
      window.addEventListener('resize', function(){ if(!isMobile()) closeMenu(); });
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMobileNav);
  else initMobileNav();
})();
