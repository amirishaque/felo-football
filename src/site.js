// The felo.news chrome — navbar, sidebar headlines and footer — rebuilt as
// plain HTML so /football reads as a section of the site, not a separate
// app. Markup and class names follow the news frontend's Navbar.jsx and
// Footer.jsx; the nav categories and the sports headlines come live from
// the news API so the two never drift apart.
const config = require('./config');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// What the nav showed when this was written; used until the API answers,
// and whenever it does not.
const FALLBACK_CATEGORIES = ['Technology', 'Business', 'Sports', 'World', 'Politics', 'Entertainment']
    .map(name => ({ name, slug: name.toLowerCase() }));

const TTL = 10 * 60 * 1000;
const cache = { categories: { at: 0, value: FALLBACK_CATEGORIES }, sports: { at: 0, value: [] } };

async function refresh(key, path, pick) {
    const c = cache[key];
    if (Date.now() - c.at < TTL) return;
    c.at = Date.now(); // one attempt per TTL, even when it fails
    try {
        const res = await fetch(config.mainApi + path, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return;
        const value = pick((await res.json()).data || []);
        if (value.length) c.value = value;
    } catch { /* keep the last good copy */ }
}

// Kicked off on each render, never awaited: a slow news API must not hold
// up the scores. The next render gets whatever arrived.
function warm() {
    refresh('categories', '/api/categories', d => d.filter(c => c.showInNav).map(c => ({ name: c.name, slug: c.slug })));
    refresh('sports', '/api/news?category=sports&limit=6', d => d.map(n => ({ title: n.title, slug: n.slug, image: n.image, publishedAt: n.publishedAt })));
}

// Feather icons, same set the frontend uses via react-icons/fi.
const icon = {
    heart: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-support-heart" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    youtube: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="newsletter-icon" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    send: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    facebook: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
};

const YT = 'https://www.youtube.com/@FeloNews';

// Football goes right after Sports, as in the news frontend's nav; at the
// end of the row it was the item the overflow fade cut off. `null` marks
// its place.
const withFootball = list => {
    const i = list.findIndex(c => c.slug === 'sports');
    return i === -1 ? [...list, null] : [...list.slice(0, i + 1), null, ...list.slice(i + 1)];
};

function navbar() {
    warm();
    const cats = cache.categories.value.slice(0, 7);
    const B = config.basePath;
    return `<nav class="navbar">
  <div class="container navbar-inner">
    <a href="/" class="navbar-logo"><span class="logo-text">Felo<span class="brand-accent">News</span></span></a>
    <div class="navbar-categories">
      ${withFootball(cats).map(c => c
        ? `<a href="/category/${esc(c.slug)}" class="nav-cat-link">${esc(c.name)}</a>`
        : `<a href="${B}" class="nav-cat-link nav-cat-live is-active" aria-current="page"><span class="nav-live-dot"></span>Football</a>`).join('\n      ')}
      <a href="/crypto-ai" class="nav-cat-link nav-cat-flag">Crypto AI<span class="nav-flag">New</span></a>
    </div>
    <div class="navbar-actions">
      <a href="/support" class="nav-support" aria-label="Support Felo News">${icon.heart}<span>Support</span></a>
      <a href="${YT}?sub_confirmation=1" target="_blank" rel="noopener noreferrer" class="nav-youtube" aria-label="Subscribe to our YouTube channel">${icon.youtube}<span>Subscribe</span></a>
      <button type="button" class="btn btn-ghost btn-icon" data-search-open aria-label="Search">${icon.search}</button>
      <div class="auth-buttons" data-auth>
        <a href="/login" class="btn btn-ghost btn-sm">Login</a>
        <a href="/signup" class="btn btn-primary btn-sm">Sign Up</a>
      </div>
      <button type="button" class="btn btn-ghost btn-icon mobile-menu-btn" data-menu-toggle aria-label="Menu" aria-expanded="false">${icon.menu}</button>
    </div>
  </div>
  <div class="search-overlay" data-search hidden>
    <div class="search-box">
      <form action="/search" method="get">
        <span class="search-icon">${icon.search}</span>
        <input type="text" name="q" placeholder="Search news, topics..." class="search-input" aria-label="Search news">
        <button type="button" class="btn btn-ghost btn-icon" data-search-close aria-label="Close search">${icon.x}</button>
      </form>
    </div>
  </div>
  <div class="mobile-menu" data-menu hidden>
    <div class="mobile-menu-inner">
      ${withFootball(cache.categories.value).map(c => c
        ? `<a href="/category/${esc(c.slug)}" class="mobile-nav-link">${esc(c.name)}</a>`
        : `<a href="${B}" class="mobile-nav-link is-active"><span class="nav-live-dot"></span>Football</a>`).join('\n      ')}
      <a href="/crypto-ai" class="mobile-nav-link">Crypto AI<span class="nav-flag">New</span></a>
      <div class="mobile-divider"></div>
      <a href="/support" class="mobile-nav-link mobile-nav-support">${icon.heart} Support Felo News</a>
      <a href="${YT}?sub_confirmation=1" target="_blank" rel="noopener noreferrer" class="mobile-nav-link mobile-nav-youtube">${icon.youtube} Subscribe on YouTube</a>
      <div class="mobile-divider"></div>
      <div data-auth-mobile>
        <a href="/login" class="mobile-nav-link">Login</a>
        <a href="/signup" class="btn btn-primary w-full">Sign Up</a>
      </div>
    </div>
  </div>
</nav>`;
}

const timeAgo = iso => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!Number.isFinite(m)) return '';
    if (m < 60) return `${Math.max(m, 1)}m ago`;
    if (m < 1440) return `${Math.round(m / 60)}h ago`;
    return `${Math.round(m / 1440)}d ago`;
};

// Latest sports briefings from the news side — the link back into the site.
function sidebar() {
    warm();
    const items = cache.sports.value;
    if (!items.length) return '';
    return `<aside class="fb-aside">
  <section class="side-card">
    <h2 class="side-h">Sports news</h2>
    <ul class="side-list">
      ${items.map(n => `<li><a href="/news/${esc(n.slug)}" class="side-item">`
        + (n.image ? `<img src="${esc(n.image)}" alt="" width="72" height="54" loading="lazy" decoding="async">` : '')
        + `<span><span class="side-t">${esc(n.title)}</span><span class="side-m">${esc(timeAgo(n.publishedAt))}</span></span></a></li>`).join('\n      ')}
    </ul>
    <a href="/category/sports" class="side-more">More sports news →</a>
  </section>
</aside>`;
}

function footer() {
    warm();
    const B = config.basePath;
    const year = new Date().getFullYear();
    return `<footer class="footer">
  <div class="footer-newsletter">
    <div class="container">
      <div class="newsletter-content">
        <div class="newsletter-text">
          <span class="newsletter-kicker">The Morning Brief</span>
          <h3>The day's stories, already summarized</h3>
          <p>One AI-written digest of what happened and why it matters — in your inbox by 8am.</p>
        </div>
        <form class="newsletter-form" data-newsletter>
          <div class="newsletter-input-wrap">${icon.mail}<input type="email" name="email" placeholder="Enter your email address" required aria-label="Email address"></div>
          <button type="submit" class="btn btn-primary">${icon.send}<span>Subscribe</span></button>
        </form>
      </div>
      <p class="newsletter-msg" data-newsletter-msg hidden></p>
    </div>
  </div>
  <div class="footer-main">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="/" class="footer-logo">Felo<span>News</span></a>
          <p>Independent briefings that compile reporting from newsrooms worldwide into what happened and why it matters.</p>
          <address class="footer-contact">
            Felo News<br>
            House 42, Bridge Colony, Kot Lakhpat, Lahore, Pakistan<br>
            <a href="tel:+923084354717">+92 308 4354717</a> · <a href="mailto:felopronews@gmail.com">felopronews@gmail.com</a>
          </address>
          <div class="social-links">
            <a href="https://www.facebook.com/61592602435701" class="social-link" aria-label="Facebook" target="_blank" rel="noopener noreferrer">${icon.facebook}</a>
            <a href="${YT}" class="social-link" aria-label="YouTube" target="_blank" rel="noopener noreferrer">${icon.youtube}</a>
          </div>
        </div>
        <div class="footer-col">
          <h4>Categories</h4>
          <ul>
            ${cache.categories.value.map(c => `<li><a href="/category/${esc(c.slug)}">${esc(c.name)}</a></li>`).join('\n            ')}
            <li><a href="${B}">Football Scores</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <ul>
            <li><a href="/about">About Us</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/support">Support Us</a></li>
            <li><a href="mailto:felopronews@gmail.com?subject=Advertising">Advertise</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Legal</h4>
          <ul>
            <li><a href="/privacy-policy">Privacy Policy</a></li>
            <li><a href="/terms">Terms of Service</a></li>
            <li><a href="/refund-policy">Refund Policy</a></li>
            <li><a href="/privacy-policy#cookies">Cookie Policy</a></li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <div class="container">
      <p>© ${year} Felo News. All rights reserved.</p>
      <p>Match data: API-Football · scores refresh automatically</p>
    </div>
  </div>
</footer>`;
}

module.exports = { navbar, sidebar, footer, warm };
