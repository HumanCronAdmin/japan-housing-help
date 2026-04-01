/*
 * Japan Housing Troubleshooter - Main JS
 * Move-out cost checker, FAQ accordion, dispute templates, sidebar nav
 */
var APP = {};

document.addEventListener('DOMContentLoaded', function () {
  fetch('js/data.json').then(function(r){return r.json()}).then(function(data){
    APP.data = data;
    renderChecker(data.costData);
    renderTemplates(data.disputeTemplates);
    renderHelp(data.helpContacts);
    renderChecklist(data.photoChecklist);
    renderFAQ(data.faqData);
  });
  initSidebar();
});

function initSidebar() {
  var btn = document.querySelector('.mobile-menu-btn');
  var sidebar = document.querySelector('.sidebar');
  var overlay = document.querySelector('.sidebar-overlay');
  if (btn) btn.addEventListener('click', function(){ sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
  if (overlay) overlay.addEventListener('click', function(){ sidebar.classList.remove('open'); overlay.classList.remove('open'); });
  var links = document.querySelectorAll('.sidebar-nav a');
  var sections = document.querySelectorAll('.section');
  function setActive() {
    var pos = window.scrollY + 120;
    sections.forEach(function(s){
      if (pos >= s.offsetTop && pos < s.offsetTop + s.offsetHeight) {
        links.forEach(function(l){ l.classList.toggle('active', l.getAttribute('href') === '#' + s.id); });
      }
    });
  }
  window.addEventListener('scroll', setActive);
  setActive();
  links.forEach(function(l){ l.addEventListener('click', function(){
    if (window.innerWidth <= 768) { sidebar.classList.remove('open'); overlay.classList.remove('open'); }
  }); });
}

function renderChecker(costData) {
  var el = document.getElementById('checker-container');
  if (!el) return;
  var html = '<div class="checker-steps">';
  html += '<div class="step-group" id="step-a"><h4>Step 1: Apartment Size</h4><div class="radio-group">';
  ['1r1k','1ldk','2ldk','3ldk'].forEach(function(k){
    var labels = {'1r1k':'1R / 1K','1ldk':'1LDK','2ldk':'2LDK','3ldk':'3LDK+'};
    html += '<label class="radio-label"><input type="radio" name="aptsize" value="'+k+'"> '+labels[k]+'</label>';
  });
  html += '</div></div>';
  html += '<div class="step-group" id="step-b"><h4>Step 2: Years Lived</h4>';
  html += '<div class="slider-wrap"><input type="range" id="years-slider" min="1" max="10" value="3"><span id="years-val">3 years</span></div></div>';
  html += '<div class="step-group" id="step-c"><h4>Step 3: Items Being Charged</h4><p class="step-hint">Check each item you are being charged for and enter the amount.</p>';
  html += '<div class="charge-items">';
  Object.keys(costData).forEach(function(key){
    var item = costData[key];
    html += '<div class="charge-row"><label class="check-label"><input type="checkbox" name="charge" value="'+key+'"> '+item.label+'</label>';
    html += '<input type="number" class="amount-input" id="amt-'+key+'" min="0" disabled></div>';
  });
  html += '</div></div>';
  html += '<button id="check-btn" class="btn-primary" disabled>Check My Bill</button>';
  html += '<div id="results" class="results-container" style="display:none"></div>';
  html += '</div>';
  el.innerHTML = html;

  var slider = document.getElementById('years-slider');
  var yval = document.getElementById('years-val');
  slider.addEventListener('input', function(){ yval.textContent = this.value + (this.value==='10' ? '+ years' : ' years'); });

  document.querySelectorAll('input[name="charge"]').forEach(function(cb){
    cb.addEventListener('change', function(){
      var inp = document.getElementById('amt-' + this.value);
      inp.disabled = !this.checked;
      if (!this.checked) inp.value = '';
      updateCheckBtn();
    });
  });
  document.querySelectorAll('.amount-input').forEach(function(inp){ inp.addEventListener('input', updateCheckBtn); });
  document.querySelectorAll('input[name="aptsize"]').forEach(function(r){ r.addEventListener('change', updateCheckBtn); });
  document.getElementById('check-btn').addEventListener('click', runChecker);
}

function updateCheckBtn() {
  var hasSize = document.querySelector('input[name="aptsize"]:checked');
  var hasItem = document.querySelector('input[name="charge"]:checked');
  document.getElementById('check-btn').disabled = !(hasSize && hasItem);
}

function runChecker() {
  var costData = APP.data.costData;
  var size = document.querySelector('input[name="aptsize"]:checked').value;
  var years = parseInt(document.getElementById('years-slider').value);
  var results = [];
  var totalOverpay = 0;

  document.querySelectorAll('input[name="charge"]:checked').forEach(function(cb){
    var key = cb.value;
    var item = costData[key];
    var amount = parseInt(document.getElementById('amt-' + key).value) || 0;
    var verdict, detail, overpay = 0;

    if (item.landlordResponsible) {
      verdict = 'LANDLORD SHOULD PAY';
      detail = item.note;
      overpay = amount;
    } else {
      var range = key === 'cleaning' ? (item.ranges[size] || item.ranges['1r1k']) : item.range;
      var maxFair = range.max;
      if (item.depreciationYears > 0 && years >= item.depreciationYears) {
        maxFair = Math.round(range.max * (item.residualRate || 0.3));
        detail = 'After ' + years + ' years, depreciation applies. Max fair charge: labor only (~' + formatYen(maxFair) + '/unit).';
      } else if (item.depreciationYears > 0) {
        var ratio = 1 - (years / item.depreciationYears) * (1 - (item.residualRate || 0.3));
        maxFair = Math.round(range.max * ratio);
        detail = 'Depreciation: ' + years + '/' + item.depreciationYears + ' years. Adjusted max: ~' + formatYen(maxFair) + '/unit.';
      } else {
        detail = item.note;
      }
      if (amount > maxFair * 1.2) {
        verdict = 'OVERCHARGED';
        overpay = amount - maxFair;
      } else if (amount >= range.min && amount <= maxFair * 1.2) {
        verdict = 'FAIR';
      } else if (amount < range.min && amount > 0) {
        verdict = 'FAIR';
        detail = 'Below typical range. ' + item.note;
      } else {
        verdict = 'FAIR';
      }
    }
    totalOverpay += overpay;
    results.push({ label: item.label, amount: amount, verdict: verdict, detail: detail, overpay: overpay });
  });

  var el = document.getElementById('results');
  var html = '<h4>Results</h4><div class="disclaimer-inline">DISCLAIMER: General information based on MLIT guidelines. NOT legal advice. Consumer Affairs: 188</div>';
  results.forEach(function(r){
    var cls = r.verdict === 'FAIR' ? 'fair' : (r.verdict === 'OVERCHARGED' ? 'overcharged' : 'landlord');
    html += '<div class="result-row ' + cls + '"><div class="result-header"><span class="result-label">' + r.label + '</span>';
    html += '<span class="result-amount">' + formatYen(r.amount) + '</span>';
    html += '<span class="verdict-badge ' + cls + '">' + r.verdict + '</span></div>';
    html += '<p class="result-detail">' + r.detail + '</p></div>';
  });
  if (totalOverpay > 0) {
    html += '<div class="overpay-total">You may be overpaying by approximately <strong>' + formatYen(totalOverpay) + '</strong></div>';
    html += '<a href="#templates" class="btn-secondary">Use Our Dispute Templates</a>';
  } else {
    html += '<div class="all-fair">Your charges appear to be within fair range based on MLIT guidelines.</div>';
  }
  el.innerHTML = html;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (typeof gtag === 'function') { gtag('event', 'cost_check_completed', { total_overpay: totalOverpay }); }
}

function formatYen(n) { return (n || 0).toLocaleString() + ' yen'; }

function renderTemplates(templates) {
  var el = document.getElementById('templates-container');
  if (!el) return;
  var html = '';
  templates.forEach(function(t){
    html += '<div class="template-card"><h4>' + t.title + '</h4>';
    html += '<div class="template-tabs"><button class="tab-btn active" data-lang="en" data-id="'+t.id+'">English</button>';
    html += '<button class="tab-btn" data-lang="jp" data-id="'+t.id+'">Japanese</button></div>';
    html += '<pre class="template-text" id="tpl-'+t.id+'-en">' + escHtml(t.en) + '</pre>';
    html += '<pre class="template-text" id="tpl-'+t.id+'-jp" style="display:none">' + escHtml(t.jp) + '</pre>';
    html += '<button class="btn-copy" data-tpl="'+t.id+'">Copy to Clipboard</button></div>';
  });
  el.innerHTML = html;
  document.querySelectorAll('.tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = this.dataset.id, lang = this.dataset.lang;
      this.parentElement.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active')});
      this.classList.add('active');
      document.getElementById('tpl-'+id+'-en').style.display = lang==='en' ? '' : 'none';
      document.getElementById('tpl-'+id+'-jp').style.display = lang==='jp' ? '' : 'none';
    });
  });
  document.querySelectorAll('.btn-copy').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = this.dataset.tpl;
      var vis = document.querySelector('#tpl-'+id+'-en[style=""], #tpl-'+id+'-en:not([style*="none"]), #tpl-'+id+'-jp[style=""], #tpl-'+id+'-jp:not([style*="none"])');
      if (!vis) vis = document.getElementById('tpl-'+id+'-en');
      navigator.clipboard.writeText(vis.textContent).then(function(){ btn.textContent = 'Copied!'; setTimeout(function(){ btn.textContent = 'Copy to Clipboard'; }, 2000); });
    });
  });
}

function renderHelp(contacts) {
  var el = document.getElementById('help-container');
  if (!el) return;
  var html = '<div class="help-flow">';
  contacts.forEach(function(c, i){
    html += '<div class="help-step"><div class="help-level">Level ' + c.level + '</div>';
    html += '<h4>' + c.title + '</h4><p>' + c.description + '</p>';
    if (c.phone) html += '<p class="help-phone">Phone: <strong>' + c.phone + '</strong></p>';
    if (c.hours) html += '<p class="help-hours">' + c.hours + '</p>';
    if (c.cost) html += '<p class="help-cost">' + c.cost + '</p>';
    if (c.url) html += '<p><a href="' + c.url + '" target="_blank" rel="noopener">Official Website</a></p>';
    if (c.note) html += '<p class="help-note">' + c.note + '</p>';
    html += '</div>';
    if (i < contacts.length - 1) html += '<div class="help-arrow">&#9660;</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function renderChecklist(checklist) {
  var el = document.getElementById('checklist-container');
  if (!el) return;
  var html = '<div class="checklist-grid">';
  checklist.forEach(function(room){
    html += '<div class="checklist-card"><h4>' + room.room + '</h4><ul>';
    room.items.forEach(function(item){ html += '<li><label><input type="checkbox"> ' + item + '</label></li>'; });
    html += '</ul></div>';
  });
  html += '</div>';
  html += '<div class="checklist-tips"><h4>Tips</h4><ul>';
  html += '<li>Photograph EVERYTHING on move-in day, even if it looks fine</li>';
  html += '<li>Include a timestamp (newspaper or phone date visible in frame)</li>';
  html += '<li>Email photos to yourself for dated proof</li>';
  html += '<li>Keep copies of all photos until AFTER deposit is returned</li></ul></div>';
  el.innerHTML = html;
}

function renderFAQ(faq) {
  var el = document.getElementById('faq-container');
  if (!el) return;
  var html = '';
  faq.forEach(function(item){
    html += '<div class="faq-item"><div class="faq-question"><span>' + escHtml(item.q) + '</span><span class="arrow">&#9660;</span></div>';
    html += '<div class="faq-answer"><p>' + escHtml(item.a) + '</p></div></div>';
  });
  el.innerHTML = html;
  document.querySelectorAll('.faq-question').forEach(function(q){
    q.addEventListener('click', function(){
      var item = this.parentElement;
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(function(f){ f.classList.remove('open'); });
      if (!wasOpen) item.classList.add('open');
    });
  });
}

function escHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
