/* ==========================================================
   embed.js — PMIS HTML Embed
   ----------------------------------------------------------
   Dipakai di website TUJUAN bersama variabel window.PMIS_EMBED.

   1) Sisipkan data visual (salin dari tab Embed website PMIS):
      window.PMIS_EMBED = { height: 520, files: [ ... ] };

   2) Muat file embed.js (upload ke folder website tujuan):
      script src="embed.js"

   3) Tentukan tempat tampilnya visual:
      div data-pmis="Peta Kordinat BM.htm" data-height="600"
      Tanpa elemen data-pmis, semua visual tampil berurutan
      di akhir halaman secara otomatis.
   ========================================================== */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function mount(el, code, height) {
    var f = document.createElement('iframe');
    f.setAttribute('style', 'width:100%;height:' + height + 'px;border:0;border-radius:8px;background:#fff');
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
    f.setAttribute('loading', 'lazy');
    f.srcdoc = code;
    el.appendChild(f);
  }

  ready(function () {
    var data = window.PMIS_EMBED;
    if (!data || !data.files || !data.files.length) return;
    var defaultHeight = data.height || 520;

    var targets = document.querySelectorAll('[data-pmis]');
    for (var i = 0; i < targets.length; i++) {
      var nm = targets[i].getAttribute('data-pmis');
      var h = parseInt(targets[i].getAttribute('data-height'), 10) || defaultHeight;
      var item = null;
      for (var j = 0; j < data.files.length; j++) {
        if (data.files[j].name === nm || data.files[j].title === nm) { item = data.files[j]; break; }
      }
      if (item) mount(targets[i], item.content, h);
    }

    if (!targets.length) {
      var wrap = document.createElement('div');
      wrap.setAttribute('style', 'max-width:960px;margin:0 auto;padding:16px');
      for (var k = 0; k < data.files.length; k++) {
        var it = data.files[k];
        var h3 = document.createElement('h3');
        h3.textContent = it.title || it.name;
        var box = document.createElement('div');
        mount(box, it.content, defaultHeight);
        wrap.appendChild(h3);
        wrap.appendChild(box);
      }
      document.body.appendChild(wrap);
    }
  });
})();
