/* ==========================================================
   embed.js — PMIS HTML Embed (LIVE)
   ----------------------------------------------------------
   Dipakai di website TUJUAN. Skrip ini SELALU mengambil data
   TERBARU langsung dari website PMIS (data.js), jadi setiap
   kali Anda klik "Publish" di aplikasi PMIS, semua website
   yang memasang embed ini otomatis ikut terupdate — tanpa
   perlu menyalin ulang kode embed.

   Cara pakai (cukup sekali tempel):

   1) Muat skrip embed dari website PMIS (tag script lengkap bisa
      disalin dari tab Embed aplikasi PMIS):
      script src="https://andrevelthuzend34-dot.github.io/pmis-website/embed.js"

   2) Tentukan tempat & visual yang tampil:
      <div data-pmis="Contract_History.htm" data-height="600"></div>

      Tanpa elemen data-pmis, semua visual tampil berurutan
      di akhir halaman secara otomatis.

   Catatan: cuplikan lama yang memakai window.PMIS_EMBED
   tetap didukung (mode kompatibilitas).
   ========================================================== */
(function () {
  'use strict';

  var me = document.currentScript ||
    document.querySelector('script[src*="embed.js"]');
  var base = me ? me.src.replace(/embed\.js(\?.*)?$/, '') : '';

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

  function render(data) {
    var defaultHeight = data.height || 520;

    var targets = document.querySelectorAll('[data-pmis]');
    for (var i = 0; i < targets.length; i++) {
      var nm = targets[i].getAttribute('data-pmis');
      if (targets[i].__pmisMounted) continue;
      var h = parseInt(targets[i].getAttribute('data-height'), 10) || defaultHeight;
      var item = null;
      for (var j = 0; j < data.files.length; j++) {
        if (data.files[j].name === nm || data.files[j].title === nm) { item = data.files[j]; break; }
      }
      if (item) { mount(targets[i], item.content, h); targets[i].__pmisMounted = true; }
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
  }

  ready(function () {
    /* Mode kompatibilitas: cuplikan lama dengan data inline */
    if (window.PMIS_EMBED && window.PMIS_EMBED.files && window.PMIS_EMBED.files.length) {
      render(window.PMIS_EMBED);
      return;
    }

    /* Mode live: ambil data terbaru dari website PMIS.
       ?v=timestamp mencegah cache, jadi hasil Publish langsung terlihat. */
    var s = document.createElement('script');
    s.src = base + 'data.js?v=' + Date.now();
    s.onload = function () {
      var files = window.PMIS_FILES || [];
      if (!files.length) { console.error('PMIS embed: data.js kosong / tidak ditemukan di ' + base); return; }
      render({ files: files, height: 520 });
    };
    s.onerror = function () {
      console.error('PMIS embed: gagal memuat data.js dari ' + base + ' — pastikan file data.js ada di folder tersebut.');
    };
    (document.head || document.body).appendChild(s);
  });
})();
