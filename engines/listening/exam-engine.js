/*
  BUYE-Online — IELTS Listening exam-style engine
  ------------------------------------------------
  Each test page defines window.TEST_DATA before loading this file:

  window.TEST_DATA = {
    title: "IELTS Listening — Test 2",
    audioSrc: "audio.mp3",              // relative to the test's own HTML file
    totalQuestions: 40,
    partBoundaries: [10, 20, 30, 40],   // last question number in each part
    partLabels: {
      1: "Part 1 — <short description>",
      2: "Part 2 — <short description>",
      3: "Part 3 — <short description>",
      4: "Part 4 — <short description>"
    },
    key: {
      1: ["answer", "accepted alternate", ...],
      ...
      40: [...]
    }
  };

  The HTML around the question content must keep the same element IDs/classes
  used in this engine (see tests/test-1/index.html as the reference markup):
  #sc-screen, #sc-vol, #sc-test-btn, #sc-confirm, #sc-err, #sc-start-btn,
  #test-screen, #part-tag, #time-wrap, #timer, #part-tabs, .part-panel[data-part],
  .flag-btn[data-flag], input.ans[data-q] / select.ans[data-q] / input[name=qN],
  #palette-parts, #ctrl-progress, #prev-part-btn, #next-part-btn,
  #go-review-btn, #palette-review-btn, #review-screen, #review-grid,
  #review-back-btn, #review-submit-btn, #rv-answered/#rv-unanswered/#rv-flagged/#rv-time,
  #results-screen, #band-score, #raw-score, #part-scores, #review-body, #retake-btn
*/
(function(){
  "use strict";

  var TD = window.TEST_DATA;
  if(!TD){ console.error("TEST_DATA is not defined — the test page must set it before loading exam-engine.js"); return; }

  var TOTAL_Q = TD.totalQuestions || 40;
  var BOUNDARIES = TD.partBoundaries || [10,20,30,40];
  var NUM_PARTS = BOUNDARIES.length;
  var KEY = TD.key || {};
  var PART_LABELS = TD.partLabels || {};

  document.title = TD.title || document.title;
  document.querySelectorAll('[data-bind="title"]').forEach(function(el){ el.textContent = TD.title || ''; });

  function PART_OF(n){
    for(var i=0;i<BOUNDARIES.length;i++){ if(n <= BOUNDARIES[i]) return i+1; }
    return BOUNDARIES.length;
  }

  function norm(s){ return (s||"").toString().trim().toLowerCase().replace(/\s+/g," ").replace(/[.,;]+$/,""); }
  function isCorrect(q,val){
    var accepted = KEY[q]||[]; var v = norm(val);
    if(!v) return false;
    for(var i=0;i<accepted.length;i++){ if(norm(accepted[i])===v) return true; }
    return false;
  }
  function getAnswer(q){
    var t = document.querySelector('input.ans[data-q="'+q+'"]'); if(t) return t.value.trim();
    var s = document.querySelector('select.ans[data-q="'+q+'"]'); if(s) return s.value;
    var r = document.querySelector('input[name="q'+q+'"]:checked'); if(r) return r.value;
    return "";
  }
  function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  var flagged = {};

  /* ---------- sound check ---------- */
  var scVol = document.getElementById('sc-vol');
  var scTestBtn = document.getElementById('sc-test-btn');
  var scConfirm = document.getElementById('sc-confirm');
  var scErr = document.getElementById('sc-err');
  var scStartBtn = document.getElementById('sc-start-btn');
  var scScreen = document.getElementById('sc-screen');
  var testScreen = document.getElementById('test-screen');

  var audioCtx = null;
  function beep(){
    try{
      audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 440;
      g.gain.value = parseFloat(scVol.value) * 0.3;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.6);
    }catch(e){}
  }
  scTestBtn.addEventListener('click', beep);

  scStartBtn.addEventListener('click', function(){
    if(!scConfirm.checked){
      scErr.classList.add('show');
      return;
    }
    scErr.classList.remove('show');
    scScreen.classList.add('hidden');
    testScreen.classList.remove('hidden');
    window.scrollTo(0,0);
    player.volume = parseFloat(scVol.value);
    startTimer();
    player.play().catch(function(){});
    renderPalette();
    showPart(1);
  });

  /* ---------- audio (locked, autoplay, no seek) ---------- */
  var player = document.createElement('audio');
  player.src = TD.audioSrc;
  player.preload = 'auto';
  document.body.appendChild(player);
  var lastKnownTime = 0;
  player.addEventListener('timeupdate', function(){ lastKnownTime = player.currentTime; });
  player.addEventListener('seeking', function(){
    if(Math.abs(player.currentTime - lastKnownTime) > 1){ player.currentTime = lastKnownTime; }
  });

  /* ---------- part tabs & panels ---------- */
  var currentPart = 1;
  var partTabsEl = document.getElementById('part-tabs');
  var partTag = document.getElementById('part-tag');
  for(var p=1;p<=NUM_PARTS;p++){
    (function(pn){
      var b = document.createElement('button');
      b.textContent = 'Part ' + pn;
      b.id = 'tab-' + pn;
      b.addEventListener('click', function(){ showPart(pn); });
      partTabsEl.appendChild(b);
    })(p);
  }
  function showPart(p){
    currentPart = p;
    document.querySelectorAll('.part-panel').forEach(function(sec){
      sec.classList.toggle('active', sec.getAttribute('data-part') === String(p));
    });
    for(var i=1;i<=NUM_PARTS;i++){ document.getElementById('tab-'+i).classList.toggle('active', i===p); }
    partTag.textContent = 'Part ' + p + ' of ' + NUM_PARTS;
    document.getElementById('prev-part-btn').disabled = (p===1);
    document.getElementById('next-part-btn').disabled = (p===NUM_PARTS);
    window.scrollTo(0,0);
    updatePaletteCurrent();
  }
  document.getElementById('prev-part-btn').addEventListener('click', function(){ if(currentPart>1) showPart(currentPart-1); });
  document.getElementById('next-part-btn').addEventListener('click', function(){ if(currentPart<NUM_PARTS) showPart(currentPart+1); });

  /* ---------- flags ---------- */
  document.querySelectorAll('.flag-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var q = btn.getAttribute('data-flag');
      flagged[q] = !flagged[q];
      btn.classList.toggle('on', !!flagged[q]);
      var badge = document.getElementById('badge-'+q);
      if(badge) badge.classList.toggle('flagged', !!flagged[q]);
      renderPalette();
    });
  });

  /* ---------- live answered styling ---------- */
  document.querySelectorAll('input.ans').forEach(function(el){
    el.addEventListener('input', function(){
      el.classList.toggle('answered', el.value.trim().length>0);
      renderPalette();
    });
  });
  document.querySelectorAll('select.ans').forEach(function(el){
    el.addEventListener('change', function(){
      el.classList.toggle('answered', !!el.value);
      renderPalette();
    });
  });
  document.querySelectorAll('.mcq-opt input[type=radio]').forEach(function(el){
    el.addEventListener('change', function(){
      var block = el.closest('.mcq-block');
      block.querySelectorAll('.mcq-opt').forEach(function(o){ o.classList.remove('checked'); });
      el.closest('.mcq-opt').classList.add('checked');
      renderPalette();
    });
  });

  /* ---------- side palette ---------- */
  var paletteParts = document.getElementById('palette-parts');
  function buildPalette(){
    paletteParts.innerHTML = '';
    for(var p=1;p<=NUM_PARTS;p++){
      var wrap = document.createElement('div');
      wrap.className = 'palette-part';
      var lbl = document.createElement('div');
      lbl.className = 'pl';
      lbl.textContent = 'Part ' + p;
      wrap.appendChild(lbl);
      var grid = document.createElement('div');
      grid.className = 'palette-grid';
      var start = (p===1) ? 1 : BOUNDARIES[p-2]+1;
      var end = BOUNDARIES[p-1];
      for(var q=start;q<=end;q++){
        (function(qn){
          var btn = document.createElement('button');
          btn.textContent = qn;
          btn.id = 'pal-' + qn;
          btn.addEventListener('click', function(){
            showPart(PART_OF(qn));
            setTimeout(function(){
              var f = document.querySelector('[data-q="'+qn+'"]');
              if(f && f.focus) f.focus();
            }, 50);
          });
          grid.appendChild(btn);
        })(q);
      }
      wrap.appendChild(grid);
      paletteParts.appendChild(wrap);
    }
  }
  buildPalette();

  function renderPalette(){
    var answered = 0;
    for(var q=1;q<=TOTAL_Q;q++){
      var has = !!getAnswer(q);
      if(has) answered++;
      var pal = document.getElementById('pal-'+q);
      if(pal){ pal.classList.toggle('answered', has); pal.classList.toggle('flagged', !!flagged[q]); }
    }
    document.getElementById('ctrl-progress').textContent = answered + ' / ' + TOTAL_Q + ' answered';
    updatePaletteCurrent();
    return answered;
  }
  function updatePaletteCurrent(){
    for(var q=1;q<=TOTAL_Q;q++){
      var pal = document.getElementById('pal-'+q);
      if(pal) pal.classList.toggle('current', PART_OF(q)===currentPart);
    }
  }

  /* ---------- timer ---------- */
  var TOTAL_SECONDS = (TD.timeLimitMinutes || 30) * 60;
  var remaining = TOTAL_SECONDS, handle = null;
  var timerEl = document.getElementById('timer');
  var timeWrap = document.getElementById('time-wrap');
  function fmt(s){ var m=Math.floor(s/60), sec=s%60; return (m<10?'0':'')+m+':'+(sec<10?'0':'')+sec; }
  function tick(){
    remaining--;
    if(remaining<=0){ remaining=0; timerEl.textContent='00:00'; clearInterval(handle); doSubmit(); return; }
    timerEl.textContent = fmt(remaining);
    timeWrap.classList.toggle('low', remaining<=120);
  }
  function startTimer(){ timerEl.textContent = fmt(remaining); handle = setInterval(tick,1000); }

  /* ---------- review screen ---------- */
  var reviewScreen = document.getElementById('review-screen');
  var reviewGrid = document.getElementById('review-grid');
  for(var q=1;q<=TOTAL_Q;q++){
    (function(qn){
      var btn = document.createElement('button');
      btn.textContent = qn;
      btn.id = 'rv-' + qn;
      btn.addEventListener('click', function(){
        reviewScreen.classList.add('hidden');
        testScreen.classList.remove('hidden');
        showPart(PART_OF(qn));
        setTimeout(function(){
          var f = document.querySelector('[data-q="'+qn+'"]');
          if(f && f.focus) f.focus();
        }, 50);
      });
      reviewGrid.appendChild(btn);
    })(q);
  }
  function openReview(){
    var answered = renderPalette();
    document.getElementById('rv-answered').textContent = answered + ' / ' + TOTAL_Q;
    document.getElementById('rv-unanswered').textContent = (TOTAL_Q-answered);
    document.getElementById('rv-flagged').textContent = Object.keys(flagged).filter(function(k){return flagged[k];}).length;
    document.getElementById('rv-time').textContent = fmt(remaining);
    for(var q=1;q<=TOTAL_Q;q++){
      var b = document.getElementById('rv-'+q);
      b.classList.toggle('answered', !!getAnswer(q));
      b.classList.toggle('flagged', !!flagged[q]);
    }
    testScreen.classList.add('hidden');
    reviewScreen.classList.remove('hidden');
    window.scrollTo(0,0);
  }
  document.getElementById('go-review-btn').addEventListener('click', openReview);
  document.getElementById('palette-review-btn').addEventListener('click', openReview);
  document.getElementById('review-back-btn').addEventListener('click', function(){
    reviewScreen.classList.add('hidden');
    testScreen.classList.remove('hidden');
  });
  document.getElementById('review-submit-btn').addEventListener('click', doSubmit);

  /* ---------- band table & submit ---------- */
  function bandFor(raw){
    var table = [[39,40,9],[37,38,8.5],[35,36,8],[32,34,7.5],[30,31,7],[26,29,6.5],[23,25,6],[18,22,5.5],[16,17,5],[13,15,4.5],[10,12,4],[8,9,3.5],[6,7,3],[4,5,2.5],[2,3,2],[0,1,1]];
    // scale the standard 40-question table proportionally if a test doesn't have 40 questions
    var scale = TOTAL_Q / 40;
    for(var i=0;i<table.length;i++){
      var lo = Math.round(table[i][0]*scale), hi = Math.round(table[i][1]*scale);
      if(raw>=lo && raw<=hi) return table[i][2];
    }
    return 1;
  }
  var resultsScreen = document.getElementById('results-screen');
  function doSubmit(){
    clearInterval(handle);
    player.pause();

    var partCorrect = {}; for(var pp=1; pp<=NUM_PARTS; pp++){ partCorrect[pp]=0; }
    var rows = "", raw = 0;
    for(var q=1;q<=TOTAL_Q;q++){
      var val = getAnswer(q);
      var correct = isCorrect(q,val);
      if(correct){ raw++; partCorrect[PART_OF(q)]++; }
      var acceptedList = KEY[q] || [""];
      rows += '<tr class="'+(correct?'correct':'wrong')+'">'+
        '<td class="mark">'+(correct?'&#10003;':'&#10007;')+'</td>'+
        '<td>'+q+'</td>'+
        '<td class="ua">'+(val?escapeHtml(val):'<em>blank</em>')+'</td>'+
        '<td class="ca">'+escapeHtml(acceptedList[0])+'</td>'+
      '</tr>';
    }
    document.getElementById('review-body').innerHTML = rows;
    document.getElementById('raw-score').textContent = raw + ' / ' + TOTAL_Q;
    document.getElementById('band-score').textContent = bandFor(raw).toFixed(1).replace(/\.0$/,'');

    var ps = document.getElementById('part-scores'); ps.innerHTML = '';
    for(var p=1;p<=NUM_PARTS;p++){
      var partSize = (p===1) ? BOUNDARIES[0] : (BOUNDARIES[p-1]-BOUNDARIES[p-2]);
      var d = document.createElement('div');
      d.innerHTML = '<div class="pn">'+(PART_LABELS[p]||('Part '+p))+'</div><div class="pv">'+partCorrect[p]+' / '+partSize+'</div>';
      ps.appendChild(d);
    }

    testScreen.classList.add('hidden');
    reviewScreen.classList.add('hidden');
    resultsScreen.classList.remove('hidden');
    window.scrollTo(0,0);
  }
  document.getElementById('retake-btn').addEventListener('click', function(){ window.location.reload(); });

})();
