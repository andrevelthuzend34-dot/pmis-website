/* ============================================================
   forms.js — Form editor terstruktur untuk tiap visual PMIS
   ------------------------------------------------------------
   Setiap definisi punya:
     parse(content)          -> model (data mentah dari HTML)
     render(host, model)     -> menggambar form; RETURN fungsi read()
                                yang membaca ulang isi form -> model
     serialize(orig, model)  -> HTML baru
   Dipakai oleh index.html pada tab "Form".
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- util DOM ---------------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function inp(type, value, attrs) {
    var i = document.createElement('input');
    i.type = type || 'text';
    i.value = value == null ? '' : value;
    if (attrs) for (var k in attrs) i.setAttribute(k, attrs[k]);
    return i;
  }
  function ta(lines, minH) {
    var t = document.createElement('textarea');
    t.className = 'fta';
    t.value = (lines || []).join('\n');
    t.style.minHeight = (minH || 90) + 'px';
    return t;
  }

  /* ---------------- util string ---------------- */
  function extractArray(content, marker) {
    var i = content.indexOf(marker);
    if (i < 0) throw new Error('Penanda tidak ditemukan: ' + marker);
    var open = content.indexOf('[', i + marker.length);
    if (open < 0) throw new Error('Kurung [ tidak ditemukan setelah ' + marker);
    var depth = 0, inStr = false, q = '';
    for (var j = open; j < content.length; j++) {
      var c = content[j];
      if (inStr) {
        if (c === '\\') { j++; continue; }
        if (c === q) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; q = c; continue; }
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') {
        depth--;
        if (depth === 0) return { inner: content.slice(open + 1, j), start: open, end: j };
      }
    }
    throw new Error('Kurung tutup tidak ditemukan untuk ' + marker);
  }
  function splitItems(inner) {
    var items = [], depth = 0, inStr = false, q = '', cur = '';
    for (var j = 0; j < inner.length; j++) {
      var c = inner[j];
      if (inStr) {
        cur += c;
        if (c === '\\') { cur += inner[++j] || ''; continue; }
        if (c === q) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; q = c; cur += c; continue; }
      if (c === '{' || c === '[') depth++;
      if (c === '}' || c === ']') depth--;
      if (c === ',' && depth === 0) { items.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) items.push(cur);
    return items.map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function replaceArray(content, marker, itemsText) {
    var a = extractArray(content, marker);
    return content.slice(0, a.start + 1) + '\n' + itemsText + '\n  ' + content.slice(a.end);
  }
  function unescapeJs(s) {
    return s.replace(/\\u([0-9a-fA-F]{4})/g, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    }).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  /* ============ 1. CONTRACT HISTORY ============ */
  function parseContract(content) {
    var a = extractArray(content, 'var data =');
    var cats = [], m;
    var reCat = /"category":\s*"([^"]*)",\s*"start":\s*new Date\("([^"]*)"\)\.getTime\(\),\s*"end":\s*new Date\("([^"]*)"\)\.getTime\(\),\s*"color":\s*colorSet\.getIndex\((\d+)\),\s*"task":\s*"([^"]*)"/g;
    while ((m = reCat.exec(a.inner))) {
      cats.push({ name: m[1], start: m[2], end: m[3], colorIdx: +m[4], task: m[5] });
    }
    var b = extractArray(content, 'lineSeries.data.setAll');
    var miles = [];
    var reMs = /category:\s*"([^"]*)",\s*date:\s*new Date\("([^"]*)"\)\.getTime\(\),\s*letter:\s*"([^"]*)",\s*description:\s*"([^"]*)"/g;
    while ((m = reMs.exec(b.inner))) {
      miles.push({ category: m[1], date: m[2], letter: m[3], description: m[4] });
    }
    if (!cats.length) throw new Error('Data kategori kontrak tidak ditemukan');
    return { cats: cats, miles: miles };
  }

  function tableSkeleton(titleText, cols) {
    var sec = el('div', 'fsection');
    sec.appendChild(el('h4', null, titleText));
    var t = el('table', 'ftable');
    var tr = el('tr');
    cols.forEach(function (c) { tr.appendChild(el('th', null, c.label)); });
    tr.appendChild(el('th', null, ''));
    var thead = el('thead'); thead.appendChild(tr); t.appendChild(thead);
    var tbody = el('tbody'); t.appendChild(tbody);
    sec.appendChild(t);
    return { sec: sec, tbody: tbody, cols: cols };
  }
  function addContractRow(tbody, cols, values, onCatChange) {
    var tr = el('tr');
    cols.forEach(function (c) {
      var td = el('td');
      var i = inp(c.type, values[c.key]);
      i.setAttribute('data-col', c.key);
      if (c.type === 'number') i.setAttribute('step', '1');
      if (c.list) i.setAttribute('list', c.list);
      if (c.oninput) i.addEventListener('input', c.oninput);
      td.appendChild(i); tr.appendChild(td);
    });
    var tdX = el('td');
    var bx = el('button', 'btn small', '✕');
    bx.type = 'button'; bx.title = 'Hapus baris';
    bx.onclick = function () { tr.remove(); };
    tdX.appendChild(bx); tr.appendChild(tdX);
    tbody.appendChild(tr);
  }

  function renderContract(host, model) {
    var dl = el('datalist'); dl.id = 'dl-pmis-cats';
    model.cats.forEach(function (c) {
      var o = el('option'); o.value = c.name; dl.appendChild(o);
    });
    host.appendChild(dl);
    function refreshDl() {
      dl.innerHTML = '';
      Array.prototype.forEach.call(host.querySelectorAll('[data-col="name"]'), function (i) {
        if (i.value) { var o = el('option'); o.value = i.value; dl.appendChild(o); }
      });
    }

    var t1 = tableSkeleton('Kategori Kontrak (garis utama)', [
      { key: 'name', label: 'Nama kategori', type: 'text', oninput: refreshDl },
      { key: 'start', label: 'Tanggal mulai', type: 'date' },
      { key: 'end', label: 'Tanggal selesai', type: 'date' },
      { key: 'colorIdx', label: 'Warna (indeks)', type: 'number' }
    ]);
    model.cats.forEach(function (c) {
      addContractRow(t1.tbody, t1.cols, { name: c.name, start: c.start, end: c.end, colorIdx: c.colorIdx });
    });
    var bAdd1 = el('button', 'btn', '+ Tambah kategori kontrak');
    bAdd1.type = 'button';
    bAdd1.onclick = function () {
      addContractRow(t1.tbody, t1.cols, {
        name: 'Kategori Baru',
        start: model.cats.length ? model.cats[model.cats.length - 1].start : '2025-01-01',
        end: model.cats.length ? model.cats[model.cats.length - 1].end : '2026-12-31',
        colorIdx: model.cats.length
      });
      refreshDl();
    };
    t1.sec.appendChild(bAdd1);
    host.appendChild(t1.sec);

    var t2 = tableSkeleton('Tanggal Kontrak / Addendum / Milestone (bendera)', [
      { key: 'category', label: 'Kategori', type: 'text', list: 'dl-pmis-cats' },
      { key: 'date', label: 'Tanggal', type: 'date' },
      { key: 'letter', label: 'Keterangan (bendera)', type: 'text' }
    ]);
    model.miles.forEach(function (x) {
      addContractRow(t2.tbody, t2.cols, { category: x.category, date: x.date, letter: x.letter });
    });
    var bAdd2 = el('button', 'btn', '+ Tanggal addendum baru');
    bAdd2.type = 'button';
    bAdd2.onclick = function () {
      addContractRow(t2.tbody, t2.cols, {
        category: model.cats.length ? model.cats[0].name : '',
        date: new Date().toISOString().slice(0, 10),
        letter: 'Addendum'
      });
    };
    t2.sec.appendChild(bAdd2);
    host.appendChild(t2.sec);

    return function read() {
      function rowsOf(tbody) {
        return Array.prototype.map.call(tbody.querySelectorAll('tr'), function (tr) {
          var o = {};
          tr.querySelectorAll('[data-col]').forEach(function (i) { o[i.getAttribute('data-col')] = i.value; });
          return o;
        });
      }
      var cats = rowsOf(t1.tbody).map(function (r, i) {
        return { name: r.name || 'Kategori', start: r.start, end: r.end, colorIdx: parseInt(r.colorIdx, 10) || i, task: 'Pekerjaan' };
      });
      var miles = rowsOf(t2.tbody).map(function (r) {
        return { category: r.category || '', date: r.date, letter: r.letter || '', description: 'Something happened here' };
      });
      return { cats: cats, miles: miles };
    };
  }

  function serializeContract(content, model) {
    var catItems = model.cats.map(function (c) {
      return '{\n' +
        '  "category": "' + c.name + '",\n' +
        '  "start": new Date("' + c.start + '").getTime(),\n' +
        '  "end": new Date("' + c.end + '").getTime(),\n' +
        '  "color": colorSet.getIndex(' + c.colorIdx + '),\n' +
        '  "task": "' + (c.task || 'Pekerjaan') + '"\n' +
        '}';
    });
    var out = replaceArray(content, 'var data =', catItems.join(',\n'));

    var msItems = model.miles.map(function (x) {
      return '  { category: "' + x.category + '", date: new Date("' + x.date +
        '").getTime(), letter: "' + x.letter + '", description: "' + (x.description || '') + '" }';
    });
    out = replaceArray(out, 'lineSeries.data.setAll', msItems.join(',\n'));

    var yItems = model.cats.map(function (c) { return '  { category: "' + c.name + '" }'; });
    out = replaceArray(out, 'yAxis.data.setAll', yItems.join(',\n'));
    return out;
  }

  /* ============ 2. TABEL NUMERIK (Kurva S, Mon Ren, Ra-Ri) ============ */
  function parseNumeric(content, marker, keyField) {
    var a = extractArray(content, marker);
    var rows = [], fieldOrder = [];
    splitItems(a.inner).forEach(function (it) {
      var km = it.match(new RegExp(keyField + ':\\s*"([^"]*)"'));
      var fields = {}, extras = [];
      var re = /([A-Za-z][A-Za-z0-9_]*)\s*:\s*(-?\d+(?:\.\d+)?)/g, m;
      while ((m = re.exec(it))) {
        if (m[1] === keyField) continue;
        fields[m[1]] = parseFloat(m[2]);
        if (fieldOrder.indexOf(m[1]) < 0) fieldOrder.push(m[1]);
      }
      var cs = it.match(/columnSettings\s*:\s*\{[^}]*\}/);
      if (cs) extras.push(cs[0]);
      var info = it.match(/info\s*:\s*"[^"]*"/);
      if (info) extras.push(info[0]);
      rows.push({ key: km ? km[1] : '', fields: fields, extras: extras.join(', ') });
    });
    if (!rows.length) throw new Error('Tidak ada baris data ditemukan');
    return { marker: marker, keyField: keyField, keyLabel: keyField === 'year' ? 'Periode' : 'Bulan', rows: rows, fieldOrder: fieldOrder };
  }

  function renderNumeric(host, model) {
    var cols = [{ key: '__key', label: model.keyLabel, type: 'text' }];
    model.fieldOrder.forEach(function (f) { cols.push({ key: f, label: f, type: 'number' }); });
    var sk = tableSkeleton('Data ' + model.keyLabel.toLowerCase() + ' (kosongkan sel = tidak digambar)', cols);
    model.rows.forEach(function (r) {
      var vals = { __key: r.key };
      model.fieldOrder.forEach(function (f) { vals[f] = (r.fields[f] == null ? '' : r.fields[f]); });
      var tr = el('tr');
      if (r.extras) tr.setAttribute('data-extras', r.extras);
      cols.forEach(function (c) {
        var td = el('td');
        var i = inp(c.type, vals[c.key]);
        i.setAttribute('data-col', c.key);
        if (c.type === 'number') i.setAttribute('step', 'any');
        td.appendChild(i); tr.appendChild(td);
      });
      var tdX = el('td');
      var bx = el('button', 'btn small', '✕');
      bx.type = 'button'; bx.title = 'Hapus baris';
      bx.onclick = function () { tr.remove(); };
      tdX.appendChild(bx); tr.appendChild(tdX);
      sk.tbody.appendChild(tr);
    });
    var bAdd = el('button', 'btn', '+ Tambah baris');
    bAdd.type = 'button';
    bAdd.onclick = function () {
      var tr = el('tr');
      cols.forEach(function (c) {
        var td = el('td');
        var i = inp(c.type, '');
        i.setAttribute('data-col', c.key);
        if (c.type === 'number') i.setAttribute('step', 'any');
        td.appendChild(i); tr.appendChild(td);
      });
      var tdX = el('td'); tr.appendChild(tdX);
      sk.tbody.appendChild(tr);
    };
    sk.sec.appendChild(bAdd);
    host.appendChild(sk.sec);
    host.appendChild(el('div', 'fhint', 'Baris dengan catatan khusus (proyeksi) tetap dipertahankan otomatis.'));

    return function read() {
      var rows = Array.prototype.map.call(sk.tbody.querySelectorAll('tr'), function (tr) {
        var key = '', fields = {};
        tr.querySelectorAll('[data-col]').forEach(function (i) {
          var k = i.getAttribute('data-col');
          if (k === '__key') key = i.value;
          else fields[k] = i.value;
        });
        return { key: key, fields: fields, extras: tr.getAttribute('data-extras') || '' };
      }).filter(function (r) { return r.key !== ''; });
      return { marker: model.marker, keyField: model.keyField, keyLabel: model.keyLabel, fieldOrder: model.fieldOrder, rows: rows };
    };
  }

  function serializeNumeric(content, model) {
    var items = model.rows.map(function (r) {
      var parts = [model.keyField + ': "' + r.key + '"'];
      model.fieldOrder.forEach(function (f) {
        var v = r.fields[f];
        if (v === '' || v == null) return;
        var n = parseFloat(v);
        if (!isNaN(n)) parts.push(f + ': ' + n);
      });
      if (r.extras) parts.push(r.extras);
      return '  { ' + parts.join(', ') + ' }';
    });
    return replaceArray(content, model.marker, items.join(',\n'));
  }

  /* ============ 2b. KURVA S (addendum dinamis, angka Romawi) ============ */
  function toRoman(n) {
    var map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    var s = '';
    map.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } });
    return s;
  }
  function romanToInt(s) {
    var m = { I: 1, V: 5, X: 10 };
    var t = 0;
    for (var i = 0; i < s.length; i++) {
      var v = m[s[i]], nx = m[s[i + 1]] || 0;
      t += nx > v ? -v : v;
    }
    return t;
  }

  function parseKurvaS(content) {
    var a = extractArray(content, 'var data =');
    var rows = [];
    splitItems(a.inner).forEach(function (it) {
      var km = it.match(/year:\s*"([^"]*)"/);
      var fields = {}, order = [];
      var re = /([A-Za-z][A-Za-z0-9_]*)\s*:\s*(-?\d+(?:\.\d+)?)/g, m;
      while ((m = re.exec(it))) {
        var k = m[1];
        if (k === 'year') continue;
        if (order.indexOf(k) < 0) order.push(k);
        fields[k] = m[2];
      }
      rows.push({ key: km ? km[1] : '', fields: fields, order: order });
    });
    if (!rows.length) throw new Error('Data bulanan Kurva S tidak ditemukan');

    var fieldOrder = [];
    rows.forEach(function (r) {
      r.order.forEach(function (k) { if (fieldOrder.indexOf(k) < 0) fieldOrder.push(k); });
    });

    var series = [], sm;
    var reS = /createSeries\("([^"]*)",\s*"([A-Za-z][A-Za-z0-9_]*)"/g;
    while ((sm = reS.exec(content))) {
      series.push({ label: sm[1], field: sm[2] });
    }
    return { rows: rows, fieldOrder: fieldOrder, series: series, added: [], removed: [] };
  }

  function kurvaFullName(field) {
    var m = field.match(/^Rencana_Add([IVX]+)$/);
    if (m) return 'Rencana Addendum ' + m[1];
    if (field === 'Rencana') return 'Rencana Kontrak Awal';
    if (field === 'Realisasi') return 'Realisasi (garis hitam)';
    return field;
  }

  function stripKurvaInjected(content) {
    var marker = content.indexOf('// Seri Addendum otomatis (Kurva S)');
    if (marker < 0) return content;
    var anchor = content.indexOf('// Add scrollbar', marker);
    if (anchor < 0) return content;
    return content.slice(0, marker) + content.slice(anchor);
  }
  function injectKurvaBuilders(content, romans) {
    content = stripKurvaInjected(content);
    if (!romans.length) return content;
    var code =
      '// Seri Addendum otomatis (Kurva S) — dibuat oleh Form\n' +
      'function buildKurvaAddendum(r) {\n' +
      '  createSeries("Rencana Add " + r, "Rencana_Add" + r);\n' +
      '}\n' +
      romans.map(function (r) { return 'buildKurvaAddendum("' + r + '");'; }).join('\n') + '\n\n';
    var anchor = content.indexOf('// Add scrollbar');
    if (anchor < 0) throw new Error('Penanda // Add scrollbar tidak ditemukan');
    return content.slice(0, anchor) + code + content.slice(anchor);
  }

  function renderKurvaS(host, model) {
    /* — seksi A: seri & addendum — */
    var secA = el('div', 'fsection');
    secA.appendChild(el('h4', null, 'Seri / Addendum (garis di chart)'));
    secA.appendChild(el('div', 'fhint',
      '<b>Keterangan:</b> <b>Rencana</b> = Rencana Kontrak Awal · <b>Rencana_AddI</b> = Rencana Addendum I, dan seterusnya (I, II, III, IV, V, VI, VII…) · <b>Realisasi</b> = garis realisasi.'));
    var listWrap = el('div');
    var legendDyn = el('div', 'fhint');
    secA.appendChild(listWrap);
    secA.appendChild(legendDyn);

    function addendaFields() { return model.fieldOrder.filter(function (k) { return /^Rencana_Add/.test(k); }); }
    function nextAddNum() {
      var mx = 0;
      addendaFields().forEach(function (f) {
        var mm = f.match(/^Rencana_Add([IVX]+)$/);
        if (mm) mx = Math.max(mx, romanToInt(mm[1]));
      });
      return mx + 1;
    }

    function drawLegend() {
      var lines = ['<b>Kode kolom:</b>'];
      model.fieldOrder.forEach(function (f) {
        if (f === 'year') return;
        lines.push('• <b>' + f + '</b> = ' + kurvaFullName(f));
      });
      legendDyn.innerHTML = lines.join('<br>');
    }

    function drawAddenda() {
      listWrap.innerHTML = '';
      addendaFields().forEach(function (f) {
        var row = el('div', 'flrow');
        row.appendChild(el('span', null, f));
        var nm = el('span', null, kurvaFullName(f));
        nm.style.flex = '1';
        row.appendChild(nm);
        var used = model.rows.some(function (r) { return r.fields[f] != null && r.fields[f] !== ''; });
        var bx = el('button', 'btn small', '✕');
        bx.type = 'button';
        bx.title = used ? 'Hapus seri addendum ini BESERTA datanya' : 'Hapus seri addendum ini';
        bx.onclick = function () {
          if (used && !window.confirm('Seri ' + f + ' masih memiliki data.\nHapus seri ini beserta seluruh datanya?')) return;
          var idx = model.fieldOrder.indexOf(f);
          if (idx >= 0) model.fieldOrder.splice(idx, 1);
          model.rows.forEach(function (r) {
            delete r.fields[f];
            var oi = (r.order || []).indexOf(f);
            if (oi >= 0) r.order.splice(oi, 1);
          });
          if (model.added.indexOf(f) >= 0) {
            model.added.splice(model.added.indexOf(f), 1);
          } else {
            model.removed.push(f);
          }
          drawAddenda();
          drawTable();
        };
        row.appendChild(bx);
        listWrap.appendChild(row);
      });
      drawLegend();
    }

    var addWrap = el('div', 'flrow');
    var numInp = inp('number', nextAddNum(), { min: '1', style: 'width:80px' });
    var bAdd = el('button', 'btn', '+ Tambah Rencana Addendum');
    bAdd.type = 'button';
    bAdd.onclick = function () {
      var n = parseInt(numInp.value, 10);
      if (!n || n < 1) return;
      var f = 'Rencana_Add' + toRoman(n);
      if (model.fieldOrder.indexOf(f) >= 0) return;
      var rIdx = model.removed.indexOf(f);
      if (rIdx >= 0) model.removed.splice(rIdx, 1);
      var insertAt = model.fieldOrder.length;
      for (var i = model.fieldOrder.length - 1; i >= 0; i--) {
        if (/^Realisasi$/.test(model.fieldOrder[i])) { insertAt = i; break; }
        if (/^Rencana_Add/.test(model.fieldOrder[i])) { insertAt = i + 1; break; }
      }
      model.fieldOrder.splice(insertAt, 0, f);
      model.added.push(f);
      numInp.value = nextAddNum();
      drawAddenda();
      drawTable();
    };
    addWrap.appendChild(el('span', null, 'Nomor addendum baru:'));
    addWrap.appendChild(numInp);
    addWrap.appendChild(bAdd);
    secA.appendChild(addWrap);
    host.appendChild(secA);

    /* — seksi B: tabel data — */
    var secB = el('div', 'fsection');
    secB.appendChild(el('h4', null, 'Data per bulan (%)'));
    secB.appendChild(el('div', 'fhint', 'Kosongkan sel = garis tidak digambar di bulan itu. Arahkan kursor ke judul kolom untuk nama lengkapnya.'));
    var tbl = el('table', 'ftable');
    var thead = el('thead');
    var tbody = el('tbody');
    tbl.appendChild(thead); tbl.appendChild(tbody);
    secB.appendChild(tbl);
    host.appendChild(secB);

    function drawTable() {
      var trh = el('tr');
      trh.appendChild(el('th', null, 'Bulan'));
      model.fieldOrder.forEach(function (f) {
        var th = el('th', null, f);
        th.title = kurvaFullName(f);
        trh.appendChild(th);
      });
      trh.appendChild(el('th', null, ''));
      thead.innerHTML = '';
      thead.appendChild(trh);
      tbody.innerHTML = '';
      model.rows.forEach(function (r, ri) {
        var tr = el('tr');
        var tdK = el('td');
        var iK = inp('text', r.key);
        iK.oninput = function () { r.key = iK.value; };
        tdK.appendChild(iK); tr.appendChild(tdK);
        model.fieldOrder.forEach(function (f) {
          var td = el('td');
          var i = inp('text', r.fields[f] == null ? '' : String(r.fields[f]));
          i.oninput = (function (ff) { return function () { r.fields[ff] = i.value; }; })(f);
          td.appendChild(i); tr.appendChild(td);
        });
        var tdX = el('td');
        var bx = el('button', 'btn small', '✕');
        bx.type = 'button'; bx.title = 'Hapus bulan ini';
        bx.onclick = function () { model.rows.splice(ri, 1); drawTable(); };
        tdX.appendChild(bx); tr.appendChild(tdX);
        tbody.appendChild(tr);
      });
    }
    var mRow = el('div', 'flrow');
    var newMonth = inp('text', '', { placeholder: 'mis. Sep 26' });
    var bAddM = el('button', 'btn', '+ Tambah bulan');
    bAddM.type = 'button';
    bAddM.onclick = function () {
      var k = newMonth.value.trim();
      if (!k) return;
      if (model.rows.some(function (r) { return r.key === k; })) return;
      model.rows.push({ key: k, fields: {}, order: [] });
      newMonth.value = '';
      drawTable();
    };
    mRow.appendChild(el('span', null, 'Bulan baru:'));
    mRow.appendChild(newMonth);
    mRow.appendChild(bAddM);
    secB.appendChild(mRow);

    drawAddenda();
    drawTable();

    return function read() {
      return {
        rows: model.rows.map(function (r) { return { key: r.key, fields: r.fields, order: r.order || [] }; }),
        fieldOrder: model.fieldOrder,
        added: model.added,
        removed: model.removed
      };
    };
  }

  function serializeKurvaS(content, m) {
    var out = content;
    var removedAll = (m.removed || []).slice();
    removedAll.forEach(function (f) {
      out = out.replace(new RegExp('[ \\t]*createSeries\\("[^"]*",\\s*"' + f + '"[^;]*;\\r?\\n?'), '');
    });

    var items = m.rows.map(function (r) {
      function fieldRaw(f) {
        if (removedAll.indexOf(f) >= 0) return null;
        var raw = r.fields[f];
        if (raw == null || raw === '') return null;
        raw = String(raw).trim();
        return raw || null;
      }
      var written = {}, parts = [];
      (r.order || []).concat(m.fieldOrder).forEach(function (f) {
        if (f === 'year' || written[f]) return;
        written[f] = 1;
        if (m.fieldOrder.indexOf(f) < 0) return;   // seri dihapus — datanya ikut dibuang
        var raw = fieldRaw(f);
        if (raw) parts.push(f + ': ' + raw);
      });
      return '{ year: "' + r.key + '"' + (parts.length ? ', ' + parts.join(', ') : '') + ' }';
    });

    /* tulis ulang array dengan indentasi persis seperti aslinya */
    var a = extractArray(out, 'var data =');
    var sp = '';
    for (var j = a.start + 1; j < out.length; j++) {
      if (out[j] === '\n') {
        for (var k = j + 1; k < out.length && out[k] === ' '; k++) sp += ' ';
        break;
      }
      if (!/\s/.test(out[j])) break;
    }
    var itemInd = sp || '  ';
    var closeInd = itemInd.length >= 2 ? itemInd.slice(0, itemInd.length - 2) : '';
    out = out.slice(0, a.start + 1) + '\n' +
      items.map(function (s) { return itemInd + s; }).join(',\n') + '\n' +
      closeInd + out.slice(a.end);

    var romans = [];
    (m.added || []).forEach(function (x) {
      var rr = String(x).replace(/^Rencana_Add/, '');
      if (romans.indexOf(rr) < 0 && removedAll.indexOf('Rencana_Add' + rr) < 0) romans.push(rr);
    });
    out = injectKurvaBuilders(out, romans);
    return out;
  }

  /* ============ 3. CURAH HUJAN ============ */
  function parseRain(content) {
    var t = content.match(/<h3>([^<]*)<\/h3>/);
    var d = content.match(/const rainDays = \[([^\]]*)\]/);
    var days = d && d[1].trim() ? d[1].split(',').map(function (x) { return parseInt(x.trim(), 10); }).filter(function (x) { return !isNaN(x); }) : [];
    return { title: t ? t[1] : 'Curah Hujan', days: days };
  }
  function renderRain(host, model) {
    var sec = el('div', 'fsection');
    sec.appendChild(el('h4', null, 'Judul grafik'));
    var ti = inp('text', model.title);
    ti.setAttribute('data-col', 'title');
    ti.style.width = '100%';
    sec.appendChild(ti);
    host.appendChild(sec);

    var sec2 = el('div', 'fsection');
    sec2.appendChild(el('h4', null, 'Centang tanggal yang HUJAN (yang tidak dicentang = cerah)'));
    var grid = el('div', 'raingrid');
    for (var d = 1; d <= 31; d++) {
      var lab = el('label', 'raincell');
      var cb = inp('checkbox', '');
      cb.setAttribute('data-day', d);
      if (model.days.indexOf(d) >= 0) cb.checked = true;
      lab.appendChild(cb);
      lab.appendChild(el('span', null, String(d)));
      grid.appendChild(lab);
    }
    sec2.appendChild(grid);
    var bNone = el('button', 'btn', 'Tidak ada hujan');
    bNone.type = 'button';
    bNone.onclick = function () { grid.querySelectorAll('[data-day]').forEach(function (c) { c.checked = false; }); };
    var bAll = el('button', 'btn', 'Hujan sepanjang bulan');
    bAll.type = 'button';
    bAll.onclick = function () { grid.querySelectorAll('[data-day]').forEach(function (c) { c.checked = true; }); };
    sec2.appendChild(bNone);
    sec2.appendChild(bAll);
    host.appendChild(sec2);

    return function read() {
      var days = [];
      grid.querySelectorAll('[data-day]').forEach(function (c) { if (c.checked) days.push(parseInt(c.getAttribute('data-day'), 10)); });
      return { title: ti.value, days: days };
    };
  }
  function serializeRain(content, model) {
    var out = content.replace(/<h3>[^<]*<\/h3>/, '<h3>' + model.title + '</h3>');
    out = out.replace(/const rainDays = \[[^\]]*\]/, 'const rainDays = [' + model.days.join(',') + ']');
    out = out.replace(/Hujan \d+ Hari/, 'Hujan ' + model.days.length + ' Hari');
    out = out.replace(/Cerah \d+ Hari/, 'Cerah ' + (31 - model.days.length) + ' Hari');
    return out;
  }

  /* ============ 4. PETA KOORDINAT BM ============ */
  function parseMarkers(content) {
    var a = extractArray(content, 'var markers');
    var rows = [];
    splitItems(a.inner).forEach(function (it) {
      var lat = it.match(/"lat":\s*(-?[\d.]+)/);
      var lon = it.match(/"lon":\s*(-?[\d.]+)/);
      var pm = it.match(/"popup":\s*"((?:[^"\\]|\\.)*)"/);
      var name = '', note = '';
      if (pm) {
        var html = unescapeJs(pm[1]);
        var nb = html.match(/<b>([\s\S]*?)<\/b>/);
        var nt = html.match(/Note:\s*([\s\S]*)$/);
        name = nb ? nb[1] : '';
        note = nt ? nt[1] : '';
      }
      rows.push({ name: name, lat: lat ? parseFloat(lat[1]) : 0, lon: lon ? parseFloat(lon[1]) : 0, note: note });
    });
    if (!rows.length) throw new Error('Marker tidak ditemukan');
    return { rows: rows };
  }
  function renderMarkers(host, model) {
    var cols = [
      { key: 'name', label: 'Nama titik', type: 'text' },
      { key: 'lat', label: 'Latitude', type: 'number' },
      { key: 'lon', label: 'Longitude', type: 'number' },
      { key: 'note', label: 'Catatan (Turunan dll)', type: 'text' }
    ];
    var sk = tableSkeleton('Titik koordinat BM & GCP', cols);
    model.rows.forEach(function (r) {
      var tr = el('tr');
      cols.forEach(function (c) {
        var td = el('td');
        var i = inp(c.type, r[c.key]);
        i.setAttribute('data-col', c.key);
        if (c.type === 'number') { i.setAttribute('step', 'any'); }
        td.appendChild(i); tr.appendChild(td);
      });
      var tdX = el('td');
      var bx = el('button', 'btn small', '✕');
      bx.type = 'button'; bx.title = 'Hapus titik';
      bx.onclick = function () { tr.remove(); };
      tdX.appendChild(bx); tr.appendChild(tdX);
      sk.tbody.appendChild(tr);
    });
    var bAdd = el('button', 'btn', '+ Tambah titik');
    bAdd.type = 'button';
    bAdd.onclick = function () {
      var tr = el('tr');
      cols.forEach(function (c) {
        var td = el('td');
        var i = inp(c.type, '');
        i.setAttribute('data-col', c.key);
        if (c.type === 'number') i.setAttribute('step', 'any');
        td.appendChild(i); tr.appendChild(td);
      });
      var tdX = el('td'); tr.appendChild(tdX);
      sk.tbody.appendChild(tr);
    };
    sk.sec.appendChild(bAdd);
    host.appendChild(sk.sec);
    host.appendChild(el('div', 'fhint', 'Popup otomatis dibuat dari nama, lat/lon (6 desimal), elevasi, dan catatan. Elevasi & popup detail diambil dari data asli.'));

    return function read() {
      var rows = Array.prototype.map.call(sk.tbody.querySelectorAll('tr'), function (tr) {
        var o = {};
        tr.querySelectorAll('[data-col]').forEach(function (i) { o[i.getAttribute('data-col')] = i.value; });
        return o;
      }).filter(function (r) { return r.name !== ''; });
      return { rows: rows, _elevs: model._elevs || null };
    };
  }
  function serializeMarkers(content, model) {
    var items = model.rows.map(function (r) {
      var lat = parseFloat(r.lat) || 0, lon = parseFloat(r.lon) || 0;
      var popup = '<b>' + r.name + '</b><br>Lat: ' + lat.toFixed(6) + '<br>Lon: ' + lon.toFixed(6) +
        '<br>Elev: ' + (r._elev != null ? r._elev : '0') + ' m<br>Note: ' + (r.note || 'nan');
      return '{"lat": ' + lat + ', "lon": ' + lon + ', "popup": ' + JSON.stringify(popup) + '}';
    });
    return replaceArray(content, 'var markers', items.join(', '));
  }

  /* ============ 5. CATATAN EVALUASI (viewer 23) ============ */
  function parseNotes(content) {
    var cards = [], m;
    var re = /<div class="card">\s*<div class="header">([\s\S]*?)<\/div>\s*<div class="content">\s*<ul>([\s\S]*?)<\/ul>/g;
    while ((m = re.exec(content))) {
      var items = [], li;
      var reLi = /<li>([\s\S]*?)<\/li>/g;
      while ((li = reLi.exec(m[2]))) items.push(li[1].replace(/\s+/g, ' ').trim());
      cards.push({ header: m[1].trim(), items: items });
    }
    if (!cards.length) throw new Error('Kartu catatan tidak ditemukan');
    return { cards: cards };
  }
  function renderNotes(host, model) {
    var reads = [];
    model.cards.forEach(function (c, idx) {
      var sec = el('div', 'fsection');
      sec.appendChild(el('h4', null, 'Kartu ' + (idx + 1)));
      var hInp = inp('text', c.header);
      hInp.style.width = '100%';
      sec.appendChild(hInp);
      sec.appendChild(el('div', 'fhint', 'Satu poin per baris:'));
      var t = ta(c.items, 140);
      sec.appendChild(t);
      host.appendChild(sec);
      reads.push(function () { return { header: hInp.value, items: t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) }; });
    });
    return function read() {
      return { cards: reads.map(function (f) { return f(); }) };
    };
  }
  function serializeNotes(content, model) {
    var idx = 0;
    return content.replace(/<div class="card">\s*<div class="header">[\s\S]*?<\/ul>\s*<\/div>\s*<\/div>/g, function () {
      var c = model.cards[idx++] || { header: '', items: [] };
      return '    <div class="card">\n' +
        '        <div class="header">' + c.header + '</div>\n' +
        '        <div class="content">\n' +
        '            <ul>\n' +
        c.items.map(function (l) { return '                <li>' + l + '</li>'; }).join('\n') + '\n' +
        '            </ul>\n' +
        '        </div>\n' +
        '    </div>';
    });
  }

  /* ============ 6. DASHBOARD SEGMEN (viewer 24/25) ============ */
  var SEG_SECTIONS = ['Pekerjaan', 'Issue / Kendala', 'Tindak Lanjut'];
  function parseSegments(content) {
    var cards = [], m;
    var re = /<div class="card segmen-(\d+)">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
    while ((m = re.exec(content))) {
      var chunk = m[0];
      var img = chunk.match(/<img src="([^"]*)"(?:\s+alt="([^"]*)")?/);
      var h2 = chunk.match(/<h2>([\s\S]*?)<\/h2>/);
      var card = {
        seg: parseInt(m[1], 10),
        img: img ? img[1] : '',
        alt: img && img[2] ? img[2] : '',
        title: h2 ? h2[1].trim() : '',
        sections: {}
      };
      SEG_SECTIONS.forEach(function (label) {
        var items = [];
        var reSec = new RegExp('<span class="section-title">' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':<\\/span>\\s*<ul>([\\s\\S]*?)<\\/ul>');
        var sm = chunk.match(reSec);
        if (sm) {
          var li, reLi = /<li>([\s\S]*?)<\/li>/g;
          while ((li = reLi.exec(sm[1]))) items.push(li[1].replace(/\s+/g, ' ').trim());
        }
        card.sections[label] = items;
      });
      cards.push(card);
    }
    if (!cards.length) throw new Error('Kartu segmen tidak ditemukan');
    return { cards: cards };
  }
  function renderSegments(host, model) {
    var reads = [];
    model.cards.forEach(function (c) {
      var sec = el('div', 'fsection');
      sec.appendChild(el('h4', null, 'Segmen ' + c.seg));
      var rImg = labeledRow('URL foto:', c.img, 'text');
      var rAlt = labeledRow('Alt foto:', c.alt, 'text');
      var rTitle = labeledRow('Judul (boleh pakai <br>):', c.title, 'text');
      sec.appendChild(rImg.wrap); sec.appendChild(rAlt.wrap); sec.appendChild(rTitle.wrap);
      var secReads = [];
      SEG_SECTIONS.forEach(function (label) {
        sec.appendChild(el('div', 'fhint', label + ' — satu poin per baris:'));
        var t = ta(c.sections[label] || [], 90);
        sec.appendChild(t);
        secReads.push(function () { return t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); });
      });
      host.appendChild(sec);
      reads.push(function () {
        var sections = {};
        SEG_SECTIONS.forEach(function (label, i) { sections[label] = secReads[i](); });
        return { seg: c.seg, img: rImg.input.value, alt: rAlt.input.value, title: rTitle.input.value, sections: sections };
      });
    });
    return function read() { return { cards: reads.map(function (f) { return f(); }) }; };

    function labeledRow(label, value, type) {
      var wrap = el('div', 'flrow');
      var lab = el('span', null, label);
      var input = inp(type, value);
      input.style.flex = '1';
      wrap.appendChild(lab); wrap.appendChild(input);
      return { wrap: wrap, input: input };
    }
  }
  function serializeSegments(content, model) {
    var blocks = model.cards.map(function (c) {
      var s = '        <div class="card segmen-' + c.seg + '">\n';
      s += '            <div class="image-container">\n';
      s += '                <span class="badge-number">' + c.seg + '</span>\n';
      s += '                <img src="' + c.img + '"' + (c.alt ? ' alt="' + c.alt + '"' : '') + '>\n';
      s += '            </div>\n';
      s += '            <div class="content">\n';
      s += '                <h2>' + c.title + '</h2>\n';
      SEG_SECTIONS.forEach(function (label) {
        s += '                <div>\n';
        s += '                    <span class="section-title">' + label + ':</span>\n';
        s += '                    <ul>\n';
        (c.sections[label] || []).forEach(function (l) { s += '                        <li>' + l + '</li>\n'; });
        s += '                    </ul>\n';
        s += '                </div>\n';
      });
      s += '            </div>\n';
      s += '        </div>';
      return s;
    });
    var first = content.search(/<div class="card segmen-\d+">/);
    if (first < 0) throw new Error('Kartu segmen tidak ditemukan');
    var reLast = /<div class="card segmen-\d+">[\s\S]*?<\/ul>\s*<\/div>\s*<\/div>\s*<\/div>/g;
    var lastEnd = -1, m2;
    while ((m2 = reLast.exec(content)) !== null) {
      lastEnd = m2.index + m2[0].length;
    }
    if (lastEnd < 0) throw new Error('Akhir kartu segmen tidak ditemukan');
    return content.slice(0, first) + blocks.join('\n\n') + content.slice(lastEnd);
  }

  /* ============ 7. RA-RI PROGRES KONTRAKTOR (addendum dinamis) ============ */
  var RA_RI_FULL = {
    MSA: 'Master Schedule (Rencana MS Kontrak Awal)',
    Ri1: 'Realisasi Bulanan',
    MSAK: 'Master Schedule Komulatif (garis)',
    RiK: 'Realisasi Komulatif (garis)'
  };
  function msFullName(code) {
    if (RA_RI_FULL[code]) return RA_RI_FULL[code];
    var m = code.match(/^MSA(\d+)$/);
    if (m) return 'Master Schedule Addendum ' + m[1];
    var k = code.match(/^MSA(\d+)K$/);
    if (k) return 'Master Schedule Addendum ' + k[1] + ' Komulatif (garis)';
    return code;
  }

  function parseRaRi(content) {
    var a = extractArray(content, 'var data =');
    var rows = [];
    splitItems(a.inner).forEach(function (it) {
      var km = it.match(/month:\s*"([^"]*)"/);
      var fields = {}, order = [];
      var re = /([A-Za-z][A-Za-z0-9_]*)\s*:\s*("[^"]*"|\{[^{}]*\}|[^,{}]+)/g, m;
      while ((m = re.exec(it))) {
        var k = m[1], raw = m[2].trim();
        if (k === 'month') continue;
        if (order.indexOf(k) < 0) order.push(k);
        fields[k] = raw;
      }
      rows.push({ key: km ? km[1] : '', fields: fields, order: order });
    });
    var fieldOrder = [];
    var seed = rows.find(function (r) { return r.order.length > 1; }) || rows[0];
    if (seed) seed.order.forEach(function (k) { fieldOrder.push(k); });
    rows.forEach(function (r) {
      r.order.forEach(function (k) { if (fieldOrder.indexOf(k) < 0) fieldOrder.push(k); });
    });
    if (!rows.length) throw new Error('Data bulanan tidak ditemukan');

    /* seri addendum yang variabelnya dirujuk bagian lain chart -> tidak boleh dihapus */
    var locked = [];
    rows.forEach(function (r) {
      r.order.forEach(function (k) {
        if (/^MSA\d+$/.test(k) && locked.indexOf(k) < 0 && varReferencedOutside(content, k)) locked.push(k);
      });
    });

    var reS = /name:\s*"([^"]*)",[\s\S]{0,400}?valueYField:\s*"([A-Za-z][A-Za-z0-9_]*)"/g, m2, seen = {};
    var series = [];
    while ((m2 = reS.exec(content))) {
      if (seen[m2[2]]) continue;
      seen[m2[2]] = 1;
      series.push({ label: m2[1], field: m2[2], type: /K$/.test(m2[2]) ? 'line' : 'column' });
    }
    var injected = [], reInj = /buildAddendum\((\d+)\)/g, m3;
    while ((m3 = reInj.exec(content))) {
      if (injected.indexOf(+m3[1]) < 0) injected.push(+m3[1]);
    }
    return { rows: rows, fieldOrder: fieldOrder, series: series, injected: injected, locked: locked, added: [], removed: [] };
  }

  function varNameForField(content, field) {
    var re = new RegExp('var (series\\\\d+) = chart\\\\.series\\\\.push\\([\\s\\S]{0,300}?valueYField:\\s*"' + field + '"');
    var m = content.match(re);
    return m ? m[1] : null;
  }
  function varReferencedOutside(content, field) {
    var v = varNameForField(content, field);
    if (!v) return false;   // seri tidak ada di kode -> aman dihapus
    var start = content.indexOf('var series1');
    var end = content.indexOf('// Cursor');
    if (start < 0 || end < 0) return true;
    var chunks = content.slice(start, end).split(/(?=var series\d+ =)/);
    return chunks.some(function (ch) {
      return ch.indexOf('valueYField: "' + field + '"') < 0 && new RegExp('\\b' + v + '\\b').test(ch);
    });
  }
  function stripSeries(content, fieldsToRemove) {
    var start = content.indexOf('var series1');
    var end = content.indexOf('// Cursor');
    if (start < 0 || end < 0) return content;
    var chunks = content.slice(start, end).split(/(?=var series\d+ =)/);
    chunks = chunks.filter(function (ch) {
      return !fieldsToRemove.some(function (f) { return ch.indexOf('valueYField: "' + f + '"') >= 0; });
    });
    return content.slice(0, start) + chunks.join('') + content.slice(end);
  }
  function stripInjected(content) {
    var marker = content.indexOf('      // Seri Addendum otomatis (dibuat oleh Form)');
    if (marker < 0) return content;
    var anchor = content.indexOf('      // Cursor', marker);
    if (anchor < 0) return content;
    return content.slice(0, marker) + content.slice(anchor);
  }
  function injectAddendumBuilders(content, nums) {
    content = stripInjected(content);   // hapus blok lama sebelum injeksi ulang
    if (!nums.length) return content;
    var code =
      '      // Seri Addendum otomatis (dibuat oleh Form)\n' +
      '      function buildAddendum(n) {\n' +
      '        var col = chart.series.push(\n' +
      '          am5xy.ColumnSeries.new(root, {\n' +
      '            name: "Rencana MS Add" + n,\n' +
      '            xAxis: xAxis, yAxis: yAxis,\n' +
      '            valueYField: "MSA" + n, categoryXField: "month",\n' +
      '            tooltip: am5.Tooltip.new(root, {\n' +
      '              pointerOrientation: "horizontal",\n' +
      '              labelText: "{name} in {categoryX}: {valueY} {info}"\n' +
      '            })\n' +
      '          })\n' +
      '        );\n' +
      '        col.columns.template.setAll({ tooltipY: am5.percent(10), templateField: "columnSettings" });\n' +
      '        col.data.setAll(data);\n' +
      '\n' +
      '        var lin = chart.series.push(\n' +
      '          am5xy.LineSeries.new(root, {\n' +
      '            name: "Rencana MS Addendum" + n + " Komulatif",\n' +
      '            xAxis: xAxis, yAxis: yAxis,\n' +
      '            valueYField: "MSA" + n + "K", categoryXField: "month",\n' +
      '            tooltip: am5.Tooltip.new(root, {\n' +
      '              pointerOrientation: "horizontal",\n' +
      '              labelText: "{name} in {categoryX}: {valueY} {info}"\n' +
      '            })\n' +
      '          })\n' +
      '        );\n' +
      '        lin.strokes.template.setAll({ strokeWidth: 2, templateField: "strokeSettings" });\n' +
      '        lin.data.setAll(data);\n' +
      '        lin.bullets.push(function () {\n' +
      '          return am5.Bullet.new(root, {\n' +
      '            sprite: am5.Circle.new(root, {\n' +
      '              strokeWidth: 1,\n' +
      '              stroke: series2.get("stroke"),\n' +
      '              radius: 5,\n' +
      '              fill: root.interfaceColors.get("background")\n' +
      '            })\n' +
      '          });\n' +
      '        });\n' +
      '      }\n' +
      nums.map(function (n) { return '      buildAddendum(' + n + ');'; }).join('\n') + '\n\n';
    var anchor = content.indexOf('      // Cursor');
    if (anchor < 0) throw new Error('Penanda // Cursor tidak ditemukan');
    return content.slice(0, anchor) + code + content.slice(anchor);
  }

  function renderRaRi(host, model) {
    /* — seksi 1: kamus & manajer addendum — */
    var secA = el('div', 'fsection');
    secA.appendChild(el('h4', null, 'Seri / Addendum (dipakai di chart)'));
    var kamus = el('div', 'fhint');
    kamus.innerHTML =
      '<b>Keterangan nama seri:</b><br>' +
      '• <b>MSA</b> = Master Schedule (Rencana MS Kontrak Awal)<br>' +
      '• <b>MSA1</b> = Master Schedule Addendum 1, <b>MSA2</b> = Addendum 2, dan seterusnya<br>' +
      '• <b>MSAK</b> = Master Schedule Komulatif · <b>MSA1K</b> = Master Schedule Addendum 1 Komulatif, dst. (garis komulatif)<br>' +
      '• <b>Ri1</b> = Realisasi bulanan · <b>RiK</b> = Realisasi Komulatif (garis)';
    secA.appendChild(kamus);

    var listWrap = el('div');
    var legendDyn = el('div', 'fhint');
    secA.appendChild(listWrap);
    secA.appendChild(legendDyn);

    function addendaFields() { return model.fieldOrder.filter(function (k) { return /^MSA\d+$/.test(k); }); }
    function nextAddendumNumber() {
      var mx = 0;
      addendaFields().forEach(function (f) { mx = Math.max(mx, parseInt(f.replace('MSA', ''), 10) || 0); });
      return mx + 1;
    }
    function drawLegend() {
      var lines = ['<b>Keterangan kode kolom:</b>'];
      model.fieldOrder.forEach(function (f) {
        if (f === 'month' || f === 'columnSettings' || f === 'info') return;
        lines.push('• <b>' + f + '</b> = ' + msFullName(f));
      });
      legendDyn.innerHTML = lines.join('<br>');
    }
    function drawAddenda() {
      listWrap.innerHTML = '';
      addendaFields().forEach(function (f) {
        var row = el('div', 'flrow');
        row.appendChild(el('span', null, f));
        var nm = el('span', null, msFullName(f));
        nm.style.flex = '1';
        row.appendChild(nm);
        var used = model.rows.some(function (r) {
          return (r.fields[f] != null && r.fields[f] !== '') ||
                 (r.fields[f + 'K'] != null && r.fields[f + 'K'] !== '');
        });
        var isLocked = (model.locked || []).indexOf(f) >= 0;
        var bx = el('button', 'btn small', '✕');
        bx.type = 'button';
        bx.disabled = f === 'MSA' || isLocked;
        bx.title = f === 'MSA' ? 'Seri dasar tidak dapat dihapus'
          : (isLocked ? 'Seri ini dirujuk oleh bagian lain chart, tidak bisa dihapus'
          : (used ? 'Hapus seri addendum ini BESERTA datanya'
          : 'Hapus seri addendum ini'));
        bx.onclick = function () {
          if (used && !window.confirm('Seri ' + f + ' masih memiliki data di tabel bulanan.\nHapus seri ini beserta seluruh datanya?')) return;
          var n = parseInt(f.replace('MSA', ''), 10) || 0;
          [f, f + 'K'].forEach(function (ff) {
            var idx = model.fieldOrder.indexOf(ff);
            if (idx >= 0) model.fieldOrder.splice(idx, 1);
            model.rows.forEach(function (r) {
              delete r.fields[ff];
              var oi = (r.order || []).indexOf(ff);
              if (oi >= 0) r.order.splice(oi, 1);
            });
          });
          if (n > 0 && model.added.indexOf(n) >= 0) {
            model.added.splice(model.added.indexOf(n), 1);   // dibatalkan sebelum disimpan
          } else {
            model.removed.push(f);
          }
          drawAddenda();
          drawTable();
        };
        row.appendChild(bx);
        listWrap.appendChild(row);
      });
      drawLegend();
    }
    var addWrap = el('div', 'flrow');
    var numInp = inp('number', nextAddendumNumber(), { min: '1', style: 'width:80px' });
    var bAdd = el('button', 'btn', '+ Tambah Addendum');
    bAdd.type = 'button';
    bAdd.onclick = function () {
      var n = parseInt(numInp.value, 10);
      if (!n || n < 1) return;
      var f = 'MSA' + n;
      if (model.fieldOrder.indexOf(f) >= 0) return;
      var rIdx = model.removed.indexOf(f);
      if (rIdx >= 0) model.removed.splice(rIdx, 1);   // re-add membatalkan penghapusan
      var insertAt = 0;
      for (var i = 0; i < model.fieldOrder.length; i++) {
        if (/^MSA\d*$/.test(model.fieldOrder[i])) insertAt = i + 1;
      }
      model.fieldOrder.splice(insertAt, 0, f);
      model.added.push(n);
      numInp.value = nextAddendumNumber();
      drawAddenda();
      drawTable();
    };
    addWrap.appendChild(el('span', null, 'Nomor addendum baru:'));
    addWrap.appendChild(numInp);
    addWrap.appendChild(bAdd);
    secA.appendChild(addWrap);
    host.appendChild(secA);

    /* — seksi 2: tabel data per bulan — */
    var secB = el('div', 'fsection');
    secB.appendChild(el('h4', null, 'Data per bulan'));
    secB.appendChild(el('div', 'fhint', 'Semua kolom diisi manual seperti data asli — termasuk kolom K (nilai komulatif untuk garis). Kosongkan sel = tidak digambar di bulan itu. Arahkan kursor ke judul kolom untuk melihat nama lengkapnya.'));
    var tbl = el('table', 'ftable');
    var thead = el('thead');
    var tbody = el('tbody');
    tbl.appendChild(thead); tbl.appendChild(tbody);
    secB.appendChild(tbl);
    host.appendChild(secB);

    function colFields() {
      return model.fieldOrder.filter(function (k) {
        return k !== 'month' && k !== 'columnSettings' && k !== 'info';
      });
    }
    function drawTable() {
      var trh = el('tr');
      trh.appendChild(el('th', null, 'Bulan'));
      colFields().forEach(function (f) {
        var th = el('th', null, f);
        th.title = msFullName(f);
        trh.appendChild(th);
      });
      trh.appendChild(el('th', null, ''));
      thead.innerHTML = '';
      thead.appendChild(trh);
      tbody.innerHTML = '';
      model.rows.forEach(function (r, ri) {
        var tr = el('tr');
        var tdK = el('td');
        var iK = inp('text', r.key);
        iK.setAttribute('data-role', 'key');
        iK.oninput = function () { r.key = iK.value; };
        tdK.appendChild(iK); tr.appendChild(tdK);
        colFields().forEach(function (f) {
          var td = el('td');
          var raw = r.fields[f] == null ? '' : String(r.fields[f]);
          var isLiteral = /^\{|^"/.test(raw);
          var i = inp('text', isLiteral ? '' : raw);
          if (isLiteral) {
            i.readOnly = true;
            i.placeholder = '(otomatis)';
            i.title = 'Nilai khusus dikelola otomatis';
          } else {
            i.oninput = (function (ff) { return function () { r.fields[ff] = i.value; }; })(f);
          }
          td.appendChild(i); tr.appendChild(td);
        });
        var tdX = el('td');
        var bx = el('button', 'btn small', '✕');
        bx.type = 'button'; bx.title = 'Hapus bulan ini';
        bx.onclick = function () { model.rows.splice(ri, 1); drawTable(); };
        tdX.appendChild(bx); tr.appendChild(tdX);
        tbody.appendChild(tr);
      });
    }
    var mRow = el('div', 'flrow');
    var newMonth = inp('text', '', { placeholder: 'mis. Okt 2026' });
    var bAddM = el('button', 'btn', '+ Tambah bulan');
    bAddM.type = 'button';
    bAddM.onclick = function () {
      var k = newMonth.value.trim();
      if (!k) return;
      if (model.rows.some(function (r) { return r.key === k; })) return;
      model.rows.push({ key: k, fields: {}, order: [] });
      newMonth.value = '';
      drawTable();
    };
    mRow.appendChild(el('span', null, 'Bulan baru:'));
    mRow.appendChild(newMonth);
    mRow.appendChild(bAddM);
    secB.appendChild(mRow);

    drawAddenda();
    drawTable();

    return function read() {
      return {
        rows: model.rows.map(function (r) { return { key: r.key, fields: r.fields, order: r.order || [] }; }),
        fieldOrder: model.fieldOrder,
        added: model.added,
        removed: model.removed,
        injected: model.injected
      };
    };
  }

  function serializeRaRi(content, m) {
    var out = content;
    var removedAll = [];
    (m.removed || []).forEach(function (f) {
      if (removedAll.indexOf(f) < 0) removedAll.push(f);
      if (/^MSA\d+$/.test(f) && removedAll.indexOf(f + 'K') < 0) removedAll.push(f + 'K');
    });
    if (removedAll.length) out = stripSeries(out, removedAll);

    var items = m.rows.map(function (r) {
      function fieldRaw(f) {
        if (removedAll.indexOf(f) >= 0) return null;   // data seri yang dihapus ikut dibuang
        var raw = r.fields[f];
        if (raw == null || raw === '') return null;
        raw = String(raw).trim();
        return raw || null;
      }
      /* pertahankan urutan properti asli baris; hanya field yang masih terdaftar di fieldOrder */
      var written = {};
      var parts = [];
      (r.order || []).concat(m.fieldOrder).forEach(function (f) {
        if (f === 'month' || written[f]) return;
        written[f] = 1;
        if (m.fieldOrder.indexOf(f) < 0) return;   // seri sudah dihapus — datanya ikut dibuang
        var raw = fieldRaw(f);
        if (raw) parts.push(f + ': ' + raw);
      });
      return '{ month: "' + r.key + '", ' + parts.join(', ') + ' }';
    });

    /* tulis ulang array dengan indentasi persis seperti aslinya */
    var a = extractArray(out, 'var data =');
    var sp = '';
    for (var j = a.start + 1; j < out.length; j++) {
      if (out[j] === '\n') {
        for (var k = j + 1; k < out.length && out[k] === ' '; k++) sp += ' ';
        break;
      }
      if (!/\s/.test(out[j])) break;   // item pertama langsung di baris yang sama
    }
    var itemInd = sp || '  ';
    var closeInd = itemInd.length >= 2 ? itemInd.slice(0, itemInd.length - 2) : '';
    out = out.slice(0, a.start + 1) + '\n' +
      items.map(function (s) { return itemInd + s; }).join(',\n') + '\n' +
      closeInd + out.slice(a.end);

    var nums = [];
    (m.injected || []).forEach(function (n) { nums.push(+n); });
    (m.added || []).forEach(function (a2) { nums.push(parseInt(String(a2).replace(/^MSA/, ''), 10) || 0); });
    nums = nums.filter(function (n, i, arr) {
      return n > 0 && arr.indexOf(n) === i && removedAll.indexOf('MSA' + n) < 0;
    });
    out = injectAddendumBuilders(out, nums);
    return out;
  }

  /* ============ REGISTRASI ============ */
  window.PMIS_FORMS = {
    'Contract_History.htm': {
      label: 'Kontrak & Addendum',
      parse: parseContract, render: renderContract, serialize: serializeContract
    },
    'Kurva_S_.htm': {
      label: 'Data Kurva S',
      parse: parseKurvaS, render: renderKurvaS, serialize: serializeKurvaS
    },
    'Mon_Ren_2025_2026.htm': {
      label: 'Rencana vs Realisasi Bulanan',
      parse: function (c) { return parseNumeric(c, 'var data =', 'month'); },
      render: renderNumeric, serialize: serializeNumeric
    },
    'Ra_Ri_Progres_Kontraktor.htm': {
      label: 'Rencana & Realisasi Kontraktor',
      parse: parseRaRi, render: renderRaRi, serialize: serializeRaRi
    },
    'Curah_Hujan.htm': {
      label: 'Hari Hujan',
      parse: parseRain, render: renderRain, serialize: serializeRain
    },
    'Peta Kordinat BM.htm': {
      label: 'Titik Koordinat',
      parse: parseMarkers, render: renderMarkers, serialize: serializeMarkers
    },
    'online_viewer_net (23).htm': {
      label: 'Catatan Evaluasi',
      parse: parseNotes, render: renderNotes, serialize: serializeNotes
    },
    'online_viewer_net (24).htm': {
      label: 'Segmen Monitoring',
      parse: parseSegments, render: renderSegments, serialize: serializeSegments
    }
  };
})();
