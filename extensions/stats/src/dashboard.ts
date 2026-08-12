export function dashboardHtml() {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>Pi Stats</title>
  <style>
    :root {
      --ground: #f3f5ef;
      --panel: #ffffff;
      --ink: #17201d;
      --muted: #66706b;
      --rule: #d6ddd5;
      --accent: #2367d1;
      --moss: #55745e;
      --warning: #c47a2c;
      --critical: #b64343;
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --ground: #101512;
        --panel: #171e1a;
        --ink: #e8eee9;
        --muted: #9eaaa3;
        --rule: #303a34;
        --accent: #74a5f0;
        --moss: #8ab596;
        --warning: #e2a45c;
        --critical: #ef7d7d;
        color-scheme: dark;
      }
    }
    :root[data-theme="dark"] {
      --ground: #101512; --panel: #171e1a; --ink: #e8eee9; --muted: #9eaaa3;
      --rule: #303a34; --accent: #74a5f0; --moss: #8ab596;
      --warning: #e2a45c; --critical: #ef7d7d; color-scheme: dark;
    }
    :root[data-theme="light"] {
      --ground: #f3f5ef; --panel: #ffffff; --ink: #17201d; --muted: #66706b;
      --rule: #d6ddd5; --accent: #2367d1; --moss: #55745e;
      --warning: #c47a2c; --critical: #b64343; color-scheme: light;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--ground); color: var(--ink); }
    button, a { font: inherit; }
    button:focus-visible, a:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 34px 0 64px; display: grid; gap: 26px; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 20px; border-bottom: 1px solid var(--rule); padding-bottom: 18px; }
    .eyebrow { color: var(--accent); font: 700 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 5px 0 0; font: 600 clamp(28px, 5vw, 48px)/1 Georgia, serif; letter-spacing: -.035em; text-wrap: balance; }
    .toolbar { display: flex; align-items: center; gap: 10px; }
    button { border: 1px solid var(--rule); background: var(--panel); color: var(--ink); padding: 8px 11px; cursor: pointer; }
    button:hover { border-color: var(--accent); }
    #stamp { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    .rollup { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid var(--rule); background: var(--panel); }
    .metric { min-width: 0; padding: 18px; border-right: 1px solid var(--rule); display: grid; gap: 7px; }
    .metric:last-child { border-right: 0; }
    .metric-label { color: var(--muted); font-size: 11px; font-weight: 750; letter-spacing: .09em; text-transform: uppercase; }
    .metric-value { font: 600 clamp(23px, 3vw, 34px)/1 Georgia, serif; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .metric-note { color: var(--muted); font-size: 12px; }
    .activity { border: 1px solid var(--rule); background: var(--panel); padding: 18px; display: grid; gap: 15px; }
    .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
    h2 { margin: 0; font-size: 14px; letter-spacing: .01em; }
    .section-note { color: var(--muted); font-size: 12px; }
    .bars { min-height: 130px; display: flex; align-items: end; gap: 4px; border-bottom: 1px solid var(--rule); padding-top: 12px; }
    .bar-wrap { flex: 1; min-width: 4px; height: 120px; display: flex; align-items: end; position: relative; }
    .bar { width: 100%; min-height: 2px; background: var(--accent); opacity: .72; }
    .bar-wrap:hover .bar { opacity: 1; }
    .bar-wrap span { display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 2; background: var(--ink); color: var(--ground); padding: 4px 6px; white-space: nowrap; font: 11px/1.2 ui-monospace, monospace; }
    .bar-wrap:hover span { display: block; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
    .table-panel { min-width: 0; border: 1px solid var(--rule); background: var(--panel); }
    .table-panel .section-head { padding: 15px 16px; border-bottom: 1px solid var(--rule); }
    .table-scroll { overflow-x: auto; max-height: 420px; overflow-y: auto; }
    table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--rule); text-align: right; white-space: nowrap; }
    th:first-child, td:first-child { text-align: left; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
    th { position: sticky; top: 0; background: var(--panel); color: var(--muted); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    td { font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
    tr:last-child td { border-bottom: 0; }
    .empty { color: var(--muted); padding: 18px; }
    .warning { color: var(--warning); }
    .critical { color: var(--critical); }
    footer { color: var(--muted); font-size: 12px; display: flex; justify-content: space-between; gap: 18px; }
    @media (max-width: 800px) {
      .rollup { grid-template-columns: 1fr 1fr; }
      .metric { border-bottom: 1px solid var(--rule); }
      .metric:nth-child(2n) { border-right: 0; }
      .grid { grid-template-columns: 1fr; }
      header { align-items: start; flex-direction: column; }
    }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div><div class="eyebrow">Local agent ledger</div><h1>Pi Stats</h1></div>
      <div class="toolbar"><span id="stamp">Loading…</span><button id="theme" type="button">Toggle theme</button><button id="refresh" type="button">Refresh</button></div>
    </header>
    <section class="rollup" aria-label="Usage overview">
      <div class="metric"><span class="metric-label">Requests</span><strong class="metric-value" id="requests">—</strong><span class="metric-note" id="sessions">— session files</span></div>
      <div class="metric"><span class="metric-label">Cost</span><strong class="metric-value" id="cost">—</strong><span class="metric-note">Recorded provider cost</span></div>
      <div class="metric"><span class="metric-label">Tokens</span><strong class="metric-value" id="tokens">—</strong><span class="metric-note" id="token-note">— output</span></div>
      <div class="metric"><span class="metric-label">Cache reuse</span><strong class="metric-value" id="cache">—</strong><span class="metric-note" id="cache-note">Read ÷ reusable input</span></div>
      <div class="metric"><span class="metric-label">Errors</span><strong class="metric-value" id="errors">—</strong><span class="metric-note" id="malformed">— malformed lines</span></div>
    </section>
    <section class="activity"><div class="section-head"><h2>Daily cost</h2><span class="section-note">All recorded days</span></div><div class="bars" id="bars"></div></section>
    <section class="grid"><div class="table-panel"><div class="section-head"><h2>Provider models</h2><span class="section-note">Recent = latest 20 metered requests</span></div><div class="table-scroll" id="models"></div></div><div class="table-panel"><div class="section-head"><h2>Projects</h2><span class="section-note">Local folder names only</span></div><div class="table-scroll" id="projects"></div></div></section>
    <footer><span>Read-only · loopback-only · refreshes every 30 seconds</span><span id="provider-count"></span></footer>
  </main>
  <script>
    const token = new URLSearchParams(location.search).get('token') || '';
    const number = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
    const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
    const percent = value => (value * 100).toFixed(1) + '%';
    const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    function table(rows) {
      if (!rows.length) return '<div class="empty">No usage recorded.</div>';
      return '<table><thead><tr><th>Name</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>' + rows.map(row => '<tr><td title="' + esc(row.key) + '">' + esc(row.key) + '</td><td>' + number.format(row.requests) + '</td><td>' + number.format(row.totalTokens) + '</td><td>' + money.format(row.cost) + '</td></tr>').join('') + '</tbody></table>';
    }
    function cacheWrite(row) {
      if (row.cacheWriteStatus === 'reported') return number.format(row.cacheWrite);
      if (row.cacheWriteStatus === 'not-reported') return 'Not reported';
      if (row.cacheWriteStatus === 'none-recorded') return 'None recorded';
      return '—';
    }
    function modelTable(rows) {
      if (!rows.length) return '<div class="empty">No usage recorded.</div>';
      return '<table><thead><tr><th>Name</th><th>Requests</th><th>Reuse</th><th>Recent</th><th>Recent misses</th><th>Cold misses</th><th>Mid-session misses</th><th>Writes</th><th>Cost</th></tr></thead><tbody>' + rows.map(row => {
        const reusable = row.input + row.cacheRead + row.cacheWrite;
        const reuse = reusable ? percent(row.cacheRead / reusable) : '—';
        const recent = row.recentCacheReuse === null ? '—' : percent(row.recentCacheReuse);
        return '<tr><td title="' + esc(row.key) + '">' + esc(row.key) + '</td><td>' + number.format(row.requests) + '</td><td>' + reuse + '</td><td>' + recent + '</td><td>' + number.format(row.recentCacheMisses) + '</td><td>' + number.format(row.coldStartMisses) + '</td><td>' + number.format(row.midSessionMisses) + '</td><td>' + cacheWrite(row) + '</td><td>' + money.format(row.cost) + '</td></tr>';
      }).join('') + '</tbody></table>';
    }
    async function load() {
      const response = await fetch('/api/stats?token=' + encodeURIComponent(token), { cache: 'no-store' });
      if (!response.ok) throw new Error('Stats request failed: ' + response.status);
      const stats = await response.json();
      const t = stats.totals;
      const reusable = t.input + t.cacheRead + t.cacheWrite;
      document.querySelector('#requests').textContent = number.format(t.requests);
      document.querySelector('#sessions').textContent = number.format(stats.sessionFiles) + ' session files';
      document.querySelector('#cost').textContent = money.format(t.cost);
      document.querySelector('#tokens').textContent = number.format(t.totalTokens);
      document.querySelector('#token-note').textContent = number.format(t.output) + ' output · ' + number.format(t.reasoning) + ' reasoning';
      document.querySelector('#cache').textContent = percent(reusable ? t.cacheRead / reusable : 0);
      document.querySelector('#cache-note').textContent = 'Read ÷ reusable input · ' + (stats.cacheWriteStatus === 'reported' ? number.format(t.cacheWrite) + ' write tokens' : stats.cacheWriteStatus === 'not-reported' ? 'writes not reported' : stats.cacheWriteStatus === 'none-recorded' ? 'no cache activity' : 'usage unmetered');
      document.querySelector('#errors').textContent = percent(t.requests ? t.errors / t.requests : 0);
      document.querySelector('#errors').className = 'metric-value ' + (t.errors ? 'critical' : '');
      document.querySelector('#malformed').textContent = stats.malformedLines + ' malformed lines skipped';
      document.querySelector('#malformed').className = 'metric-note ' + (stats.malformedLines ? 'warning' : '');
      document.querySelector('#models').innerHTML = modelTable(stats.byProviderModel);
      document.querySelector('#projects').innerHTML = table(stats.byProject);
      const max = Math.max(0.000001, ...stats.byDay.map(day => day.cost));
      document.querySelector('#bars').innerHTML = stats.byDay.map(day => '<div class="bar-wrap"><div class="bar" style="height:' + Math.max(2, day.cost / max * 100) + '%"></div><span>' + esc(day.key) + ' · ' + money.format(day.cost) + '</span></div>').join('') || '<div class="empty">No dated usage recorded.</div>';
      document.querySelector('#provider-count').textContent = stats.byProvider.length + ' providers · ' + stats.byModel.length + ' models';
      document.querySelector('#stamp').textContent = 'Updated ' + new Date(stats.generatedAt).toLocaleTimeString();
    }
    document.querySelector('#refresh').addEventListener('click', () => load().catch(showError));
    document.querySelector('#theme').addEventListener('click', () => { const root = document.documentElement; root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; });
    function showError(error) { document.querySelector('#stamp').textContent = error.message; document.querySelector('#stamp').className = 'critical'; }
    load().catch(showError);
    setInterval(() => load().catch(showError), 30000);
  </script>
</body>
</html>`;
}
