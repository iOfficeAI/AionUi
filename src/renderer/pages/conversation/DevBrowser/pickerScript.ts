/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Injected JS that runs inside the <webview>.
 *
 * Communicates with host via console.log markers:
 *   __DEVBROWSER_PICK__{json}   — user clicked an element while picking
 *   __DEVBROWSER_EXIT__         — user pressed Esc to leave picker mode
 *
 * Host calls back into the page via executeJavaScript:
 *   window.__devbrowserHighlight(selector)   — flash a selector (hover-back)
 *   window.__devbrowserSetMode(true|false)   — enable/disable picker
 */

const PICK_MARKER = '__DEVBROWSER_PICK__';
const EXIT_MARKER = '__DEVBROWSER_EXIT__';

export const PICK_MARKER_NAME = PICK_MARKER;
export const EXIT_MARKER_NAME = EXIT_MARKER;

export function buildPickerScript(maxOuterHTML: number, maxText: number): string {
  return `
    (function() {
      if (window.__devbrowserInstalled) {
        if (typeof window.__devbrowserSetMode === 'function') {
          window.__devbrowserSetMode(true);
        }
        return;
      }
      window.__devbrowserInstalled = true;

      var MAX_HTML = ${maxOuterHTML};
      var MAX_TEXT = ${maxText};
      var enabled = false;
      var currentEl = null;

      var style = document.createElement('style');
      style.id = '__devbrowser_style';
      style.textContent = [
        '.__db_overlay{position:fixed;pointer-events:none;background:rgba(59,130,246,0.12);border:2px solid #3b82f6;z-index:2147483646;transition:all 80ms ease;display:none;border-radius:2px;}',
        '.__db_flash{position:fixed;pointer-events:none;background:rgba(16,185,129,0.25);border:2px solid #10b981;z-index:2147483647;border-radius:2px;animation:__db_pop 380ms ease-out forwards;}',
        '@keyframes __db_pop{0%{transform:scale(1);opacity:1}100%{transform:scale(1.08);opacity:0}}',
        '.__db_toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:rgba(16,185,129,0.95);color:#fff;padding:8px 14px;border-radius:6px;font:12px/1.4 system-ui,sans-serif;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,0.18);}',
        'html.__db_picking, html.__db_picking *{cursor:crosshair !important;}'
      ].join('');
      document.documentElement.appendChild(style);

      var overlay = document.createElement('div');
      overlay.className = '__db_overlay';
      overlay.id = '__devbrowser_overlay';
      document.documentElement.appendChild(overlay);

      function cssEscape(s){
        try { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'); }
        catch(e){ return s; }
      }

      function buildSelector(el){
        if (!el || el.nodeType !== 1) return '';
        if (el.id) return '#' + cssEscape(el.id);
        var parts = [];
        var node = el;
        while (node && node.nodeType === 1 && parts.length < 6 && node !== document.body) {
          var seg = node.tagName.toLowerCase();
          if (node.classList && node.classList.length){
            var cls = Array.prototype.slice.call(node.classList).slice(0,2).map(cssEscape).join('.');
            if (cls) seg += '.' + cls;
          }
          var parent = node.parentElement;
          if (parent){
            var sibs = Array.prototype.filter.call(parent.children, function(c){ return c.tagName === node.tagName; });
            if (sibs.length > 1){
              var idx = sibs.indexOf(node) + 1;
              seg += ':nth-of-type(' + idx + ')';
            }
          }
          parts.unshift(seg);
          node = node.parentElement;
        }
        return parts.join(' > ');
      }

      var ATTR_WHITELIST = ['id','class','role','href','src','alt','title','type','name','value','placeholder'];
      function pickAttrs(el){
        var out = {};
        if (!el.attributes) return out;
        for (var i = 0; i < el.attributes.length; i++){
          var a = el.attributes[i];
          var n = a.name;
          if (ATTR_WHITELIST.indexOf(n) !== -1 || n.indexOf('aria-') === 0 || n.indexOf('data-') === 0){
            var v = a.value || '';
            if (v.length > 120) v = v.slice(0, 120) + '…';
            out[n] = v;
          }
        }
        return out;
      }

      function truncate(s, max){
        if (!s) return '';
        if (s.length <= max) return s;
        var head = Math.floor(max * 0.7);
        var tail = max - head - 1;
        return s.slice(0, head) + '…' + s.slice(s.length - tail);
      }

      function serialize(el){
        var rect = el.getBoundingClientRect();
        return {
          url: location.href,
          title: document.title,
          selector: buildSelector(el),
          tagName: el.tagName.toLowerCase(),
          textContent: truncate((el.textContent || '').replace(/\\s+/g,' ').trim(), MAX_TEXT),
          outerHTML: truncate(el.outerHTML || '', MAX_HTML),
          attrs: pickAttrs(el),
          rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) }
        };
      }

      function showOverlay(el){
        var r = el.getBoundingClientRect();
        overlay.style.display = 'block';
        overlay.style.left = r.left + 'px';
        overlay.style.top = r.top + 'px';
        overlay.style.width = r.width + 'px';
        overlay.style.height = r.height + 'px';
      }
      function hideOverlay(){ overlay.style.display = 'none'; currentEl = null; }

      function flash(el){
        var r = el.getBoundingClientRect();
        var f = document.createElement('div');
        f.className = '__db_flash';
        f.style.left = r.left + 'px';
        f.style.top = r.top + 'px';
        f.style.width = r.width + 'px';
        f.style.height = r.height + 'px';
        document.documentElement.appendChild(f);
        setTimeout(function(){ if (f.parentNode) f.parentNode.removeChild(f); }, 400);
      }

      function isUI(el){
        if (!el) return true;
        return el === overlay || el.classList && (el.classList.contains('__db_flash') || el.classList.contains('__db_toast'));
      }

      function onMove(e){
        if (!enabled) return;
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || isUI(el)) return;
        if (el !== currentEl){
          currentEl = el;
          showOverlay(el);
        }
      }

      function onClick(e){
        if (!enabled) return;
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || isUI(el)) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          var payload = serialize(el);
          console.log('${PICK_MARKER}' + JSON.stringify(payload));
          flash(el);
        } catch(err){
          console.warn('[devbrowser] serialize failed', err);
        }
      }

      function onKey(e){
        if (!enabled) return;
        if (e.key === 'Escape'){
          console.log('${EXIT_MARKER}');
        }
      }

      // Capture-phase so we beat page handlers.
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);

      window.__devbrowserSetMode = function(on){
        enabled = !!on;
        if (enabled){
          document.documentElement.classList.add('__db_picking');
        } else {
          document.documentElement.classList.remove('__db_picking');
          hideOverlay();
        }
      };

      window.__devbrowserHighlight = function(selector){
        try {
          var el = document.querySelector(selector);
          if (el) flash(el);
        } catch(e) {}
      };

      window.__devbrowserSetMode(true);
    })();
    true;
  `;
}
