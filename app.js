// --- Nav: scroll class & active link ---
const nav = document.getElementById('site-nav');
const navLinks = document.querySelectorAll('.nav-links a:not(.nav-cta)');
const sections = document.querySelectorAll('section[id]');

function onScroll() {
  nav.classList.toggle('scrolled', window.scrollY > 40);

  // Highlight active section in nav
  let current = '';
  sections.forEach(sec => {
    if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
  });
  navLinks.forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + current);
  });
}

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// --- Mobile nav toggle ---
const toggle = document.getElementById('nav-toggle');
const linksEl = document.getElementById('nav-links');

toggle.addEventListener('click', () => {
  const open = linksEl.classList.toggle('open');
  toggle.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', open);
});

// Close mobile nav on link click
linksEl.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    linksEl.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', false);
  });
});

// --- Scroll-reveal ---
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// --- Weather Widget (Open-Meteo + Geolocation w/ IP fallback) ---
(function initWeather() {
  const widget    = document.getElementById('weather-widget');
  const elEmoji0  = document.getElementById('wx-emoji-0');
  const elTemp0   = document.getElementById('wx-temp-0');
  const elDesc0   = document.getElementById('wx-desc-0');
  const elEmoji1  = document.getElementById('wx-emoji-1');
  const elHi1     = document.getElementById('wx-hi-1');
  const elLo1     = document.getElementById('wx-lo-1');
  const elDesc1   = document.getElementById('wx-desc-1');
  const elLoc     = document.getElementById('weather-location');

  // Open-Meteo WMO weather code → { emoji, label }
  function codeToWeather(code) {
    if (code === 0)                       return { emoji: '☀️',  label: 'Clear sky' };
    if ([1, 2].includes(code))            return { emoji: '🌤️', label: 'Mostly clear' };
    if (code === 3)                       return { emoji: '☁️',  label: 'Cloudy' };
    if ([45, 48].includes(code))          return { emoji: '🌫️', label: 'Foggy' };
    if ([51, 53, 55, 56, 57].includes(code)) return { emoji: '🌦️', label: 'Drizzle' };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { emoji: '🌧️', label: 'Rain' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { emoji: '❄️', label: 'Snow' };
    if ([95, 96, 99].includes(code))      return { emoji: '⛈️', label: 'Thunderstorm' };
    return { emoji: '🌡️', label: 'Weather' };
  }

  function showError(msg) {
    elEmoji0.textContent = '🌐';
    elTemp0.innerHTML = '--<span>°F</span>';
    elDesc0.textContent = msg;
    elEmoji1.textContent = '🌐';
    elHi1.textContent = '--';
    elLo1.textContent = '--';
    elDesc1.textContent = '—';
    elLoc.textContent = 'Unavailable';
    widget.classList.add('ready');
  }

  async function fetchWeather(lat, lon, label) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
                + `&current=temperature_2m,weather_code`
                + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
                + `&temperature_unit=fahrenheit&timezone=auto&forecast_days=2`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather request failed');
      const data = await res.json();

      // --- Today (current temp + today's condition) ---
      const cur = data.current;
      const todayCode = data.daily.weather_code[0];
      const wToday = codeToWeather(todayCode);
      const todayHi = Math.round(data.daily.temperature_2m_max[0]);
      const todayLo = Math.round(data.daily.temperature_2m_min[0]);

      elEmoji0.textContent = wToday.emoji;
      elTemp0.innerHTML = `${Math.round(cur.temperature_2m)}<span>°F</span>`;
      elDesc0.textContent = `${wToday.label} · ${todayHi}° / ${todayLo}°`;

      // --- Tomorrow (high/low + condition) ---
      const tomorrowCode = data.daily.weather_code[1];
      const wTomorrow = codeToWeather(tomorrowCode);
      const tHi = Math.round(data.daily.temperature_2m_max[1]);
      const tLo = Math.round(data.daily.temperature_2m_min[1]);

      elEmoji1.textContent = wTomorrow.emoji;
      elHi1.textContent = tHi;
      elLo1.textContent = tLo;
      elDesc1.textContent = wTomorrow.label;

      // --- Location label ---
      if (label) {
        elLoc.textContent = label;
      } else {
        try {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`
          );
          if (geoRes.ok) {
            const geo = await geoRes.json();
            const place = geo.results && geo.results[0];
            elLoc.textContent = place
              ? (place.admin1 ? `${place.name}, ${place.admin1}` : place.name)
              : `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
          } else {
            elLoc.textContent = `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
          }
        } catch (_) {
          elLoc.textContent = `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
        }
      }

      widget.classList.add('ready');
    } catch (err) {
      showError('Weather unavailable');
    }
  }

  // IP-based geolocation fallback — tries multiple free, no-key providers
  // in sequence so the widget keeps working if any one of them is down,
  // rate-limited, or blocked by CORS from a file:// origin.
  async function fallbackToIP() {
    const providers = [
      {
        url: 'https://ipwho.is/',
        parse: (d) => d && d.success !== false && typeof d.latitude === 'number'
          ? { lat: d.latitude, lon: d.longitude, city: d.city, region: d.region }
          : null,
      },
      {
        url: 'https://freeipapi.com/api/json/',
        parse: (d) => d && typeof d.latitude === 'number'
          ? { lat: d.latitude, lon: d.longitude, city: d.cityName, region: d.regionName }
          : null,
      },
      {
        url: 'https://get.geojs.io/v1/ip/geo.json',
        parse: (d) => {
          const lat = parseFloat(d && d.latitude);
          const lon = parseFloat(d && d.longitude);
          return Number.isFinite(lat) && Number.isFinite(lon)
            ? { lat, lon, city: d.city, region: d.region }
            : null;
        },
      },
      {
        url: 'https://ipapi.co/json/',
        parse: (d) => d && typeof d.latitude === 'number'
          ? { lat: d.latitude, lon: d.longitude, city: d.city, region: d.region }
          : null,
      },
    ];

    for (const p of providers) {
      try {
        const res = await fetch(p.url);
        if (!res.ok) continue;
        const data = await res.json();
        const coords = p.parse(data);
        if (!coords) continue;
        const label = coords.city
          ? (coords.region ? `${coords.city}, ${coords.region}` : coords.city)
          : `${coords.lat.toFixed(1)}°, ${coords.lon.toFixed(1)}°`;
        return fetchWeather(coords.lat, coords.lon, label);
      } catch (_) {
        // try next provider
      }
    }

    showError('Location unavailable');
  }

  // file:// protocol blocks geolocation in most browsers — skip straight to IP
  const isFile = window.location.protocol === 'file:';
  const isSecure = window.isSecureContext;

  if (isFile || !('geolocation' in navigator) || !isSecure) {
    fallbackToIP();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
    () => fallbackToIP(),
    { timeout: 8000, maximumAge: 10 * 60 * 1000 }
  );
})();

/* ============================================
   ARTWORK LIGHTBOX
   ============================================ */
(function initArtModal() {
  const modal = document.getElementById('art-modal');
  if (!modal) return;
  const modalImg = document.getElementById('art-modal-img');
  const modalTitle = document.getElementById('art-modal-title');
  const modalMedium = document.getElementById('art-modal-medium');
  const modalDims = document.getElementById('art-modal-dimensions');
  const closeBtn = document.getElementById('art-modal-close');
  let lastFocused = null;

  function openModal(card) {
    lastFocused = card;
    modalImg.src = card.dataset.artFull;
    modalImg.alt = card.dataset.artTitle + ' — ' + card.dataset.artMedium;
    modalTitle.textContent = card.dataset.artTitle;
    modalMedium.textContent = card.dataset.artMedium;
    modalDims.textContent = card.dataset.artDimensions;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    closeBtn.focus();
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    modalImg.src = '';
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll('.art-card').forEach((card) => {
    card.addEventListener('click', () => openModal(card));
  });

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });
})();
