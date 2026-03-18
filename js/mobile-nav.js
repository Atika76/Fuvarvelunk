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

    let mobileActions = nav.querySelector('.mobile-nav-actions');
    if(!mobileActions){
      mobileActions = document.createElement('div');
      mobileActions.className = 'mobile-nav-actions';
      nav.appendChild(mobileActions);
    }

    function closeMenu(){
      header.classList.remove('nav-open');
      document.body.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
    function openMenu(){
      header.classList.add('nav-open');
      document.body.classList.add('nav-open');
      toggle.setAttribute('aria-expanded', 'true');
    }
    function isMobile(){ return window.innerWidth <= 860; }

    if (!toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', function(){
        if(!isMobile()) return;
        if(header.classList.contains('nav-open')) closeMenu(); else openMenu();
      });
    }

    if (!nav.dataset.bound) {
      nav.dataset.bound = '1';
      nav.addEventListener('click', function(e){
        const target = e.target.closest('a,button');
        if(target && isMobile()) closeMenu();
      });
    }

    window.addEventListener('resize', function(){ if(!isMobile()) closeMenu(); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeMenu(); });
    window.addEventListener('pageshow', function(){ closeMenu(); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMobileNav);
  else initMobileNav();
})();
