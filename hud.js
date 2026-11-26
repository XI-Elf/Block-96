// Owner: movement/combat thread (HUD). Adds the stamina / hotbar look on top of the built-in HUD.
// WL_HUD.update returns false, so the built-in HUD keeps updating everything else (goal, needs, panels).
'use strict';
(function () {
  const css = document.createElement('style');
  css.textContent = `
  #stBar { grid-template-columns: 22px 1fr; } #stT { display: none; }
  #stBar b { color: #d9d6c6; font-size: 16px; text-shadow: 0 0 6px rgba(0,0,0,.8); transition: color .2s; }
  #stBar .bar { height: 12px; background: rgba(10,10,12,.72); border: 1px solid rgba(233,230,216,.28); }
  #stBar .bar i { background: #e9e6d8; transition: background .15s; }
  #stBar.low .bar i { background: #c9b98a; }
  #stBar.tired .bar i { background: #ff8a1f; animation: stPulse .55s infinite alternate; } #stBar.tired b { color: #ff8a1f; }
  #stBar.run b { color: #fff; }
  @keyframes stPulse { to { opacity: .45; } }
  #slots { gap: 8px; flex-wrap: nowrap; }
  .slot { position: relative; width: 62px; height: 62px; min-width: 62px !important; min-height: 62px !important; padding: 4px; display: grid; place-items: center; text-align: center; font-size: 10px; line-height: 1.1; overflow: hidden; border: 2px solid rgba(233,230,216,.35); background: rgba(8,9,12,.82); }
  .slot b { position: absolute; left: 4px; top: 2px; margin: 0; font-size: 11px; }
  .slot.on { border-color: #e9e6d8; box-shadow: 0 0 0 1px rgba(0,0,0,.6) inset; }
  .touch .slot { width: 52px; height: 52px; min-width: 52px !important; min-height: 52px !important; }
  `;
  document.head.appendChild(css);
  let el = null;
  function update(s, p, ctx) {
    if (!el) el = document.getElementById('stBar');
    if (!el || !p) return false;
    const d = ctx.S.derived(p), f = p.stam / d.stamMax;
    el.classList.toggle('tired', !!p.tired);
    el.classList.toggle('low', !p.tired && f < 0.3);
    el.classList.toggle('run', !!p.sprinting);
    return false;
  }
  window.WL_HUD = { update };
})();
