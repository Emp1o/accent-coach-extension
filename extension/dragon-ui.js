async function applyTextScale() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    const raw = Number(state?.settings?.textScale ?? 1);
    const scale = Math.min(1.35, Math.max(0.75, raw));
    document.documentElement.style.setProperty('--accent-text-scale', String(scale));
    document.documentElement.style.fontSize = `${16 * scale}px`;
    // В Chrome расширениях CSS zoom работает надёжнее, чем font-size,
    // потому что часть старого интерфейса задана в px, а не rem.
    document.body.style.zoom = String(scale);
    document.body.dataset.textScaleApplied = String(scale);
  } catch (error) {}
}
applyTextScale();
// Visual-only dragon tail effect. Wing animation removed.
(function(){
  const ACTIVE_TAILS_LIMIT = 3;

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, value));
  }

  function center(el){
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function viewport(){
    return {
      w: Math.max(280, window.innerWidth || document.documentElement.clientWidth || 360),
      h: Math.max(220, window.innerHeight || document.documentElement.clientHeight || 520),
    };
  }

  function cleanupOldTails(){
    const tails = Array.from(document.querySelectorAll('.dragon-tail-swipe'));
    const extra = Math.max(0, tails.length - ACTIVE_TAILS_LIMIT + 1);
    tails.slice(0, extra).forEach(node => node.remove());
  }

  function animateTail(node, direction){
    // Web Animations API is used intentionally: it is not affected by old CSS
    // animation rules or global reduced-motion overrides that could make the
    // tail snap in/out instead of moving smoothly.
    const easing = 'cubic-bezier(.18,.82,.2,1)';
    const sway = direction * 18;
    const main = node.animate([
      { opacity: 0, transform: 'translate3d(' + (-sway) + 'px, 14px, 0) rotate(' + (direction * -16) + 'deg) scale(.74) skewX(' + (direction * -7) + 'deg)', filter: 'blur(.15px) drop-shadow(0 10px 16px rgba(87,18,10,.18))', offset: 0 },
      { opacity: .96, transform: 'translate3d(' + (-sway * .55) + 'px, 9px, 0) rotate(' + (direction * -11) + 'deg) scale(.88) skewX(' + (direction * -5) + 'deg)', offset: .12 },
      { opacity: 1, transform: 'translate3d(' + (-sway * .22) + 'px, 1px, 0) rotate(' + (direction * -4) + 'deg) scale(1) skewX(' + (direction * -2) + 'deg)', offset: .30 },
      { opacity: 1, transform: 'translate3d(' + (sway * .16) + 'px, -4px, 0) rotate(' + (direction * 5) + 'deg) scale(1.025) skewX(' + (direction * 2) + 'deg)', offset: .50 },
      { opacity: .82, transform: 'translate3d(' + (sway * .55) + 'px, -8px, 0) rotate(' + (direction * 12) + 'deg) scale(.96) skewX(' + (direction * 5) + 'deg)', offset: .76 },
      { opacity: 0, transform: 'translate3d(' + sway + 'px, -12px, 0) rotate(' + (direction * 18) + 'deg) scale(.80) skewX(' + (direction * 8) + 'deg)', filter: 'blur(.15px) drop-shadow(0 10px 16px rgba(87,18,10,.14))', offset: 1 }
    ], { duration: 1780, easing, fill: 'forwards' });

    const wave = node.querySelector('.dragon-tail-wave');
    if(wave){
      wave.animate([
        { opacity: .18, transform: 'translateX(' + (direction * -10) + 'px) rotate(' + (direction * -5) + 'deg) scaleX(.90)' },
        { opacity: .78, transform: 'translateX(' + (direction * -3) + 'px) rotate(' + (direction * -2) + 'deg) scaleX(1.02)', offset: .38 },
        { opacity: .68, transform: 'translateX(' + (direction * 8) + 'px) rotate(' + (direction * 7) + 'deg) scaleX(.96)', offset: .72 },
        { opacity: 0, transform: 'translateX(' + (direction * 14) + 'px) rotate(' + (direction * 10) + 'deg) scaleX(.88)' }
      ], { duration: 1780, easing, fill: 'forwards' });
    }

    const tip = node.querySelector('.dragon-tail-tip-flick');
    if(tip){
      tip.animate([
        { opacity: .25, transform: 'rotate(' + (direction * -20) + 'deg) translateY(5%)' },
        { opacity: .95, transform: 'rotate(' + (direction * -10) + 'deg) translateY(1%)', offset: .22 },
        { opacity: 1, transform: 'rotate(' + (direction * 9) + 'deg) translateY(-2%)', offset: .52 },
        { opacity: 0, transform: 'rotate(' + (direction * 28) + 'deg) translateY(-8%)' }
      ], { duration: 1780, easing, fill: 'forwards' });
    }

    main.finished.catch(() => {}).finally(() => node.remove());
    window.setTimeout(() => node.remove(), 2300);
  }

  function tailSwipe(el){
    if(!el || !el.getBoundingClientRect) return;

    const p = center(el);
    const { w: vw, h: vh } = viewport();
    const margin = 12;
    const tailWidth = Math.round(clamp(vw * .92, 260, 520));
    const tailHeight = Math.round(tailWidth * .326);
    const direction = p.x > vw / 2 ? -1 : 1;
    const left = clamp(p.x - tailWidth * .52, margin, Math.max(margin, vw - tailWidth - margin));
    const top = clamp(p.y - tailHeight * .54, margin, Math.max(margin, vh - tailHeight - margin));

    cleanupOldTails();

    const s = document.createElement('span');
    s.className = 'dragon-tail-swipe';
    s.setAttribute('aria-hidden', 'true');
    s.style.setProperty('--tail-w', tailWidth + 'px');
    s.style.setProperty('--tail-h', tailHeight + 'px');
    s.style.left = left + 'px';
    s.style.top = top + 'px';
    if(direction < 0) s.classList.add('dragon-tail-swipe--reverse');

    const wave = document.createElement('span');
    wave.className = 'dragon-tail-wave';
    const tip = document.createElement('span');
    tip.className = 'dragon-tail-tip-flick';
    s.append(wave, tip);

    document.body.appendChild(s);
    animateTail(s, direction);
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('#showAnswerBtn,.training-card,.flip-card');
    if (t) tailSwipe(t);
  }, { capture:true });
})();
