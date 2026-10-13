// Weather from Open-Meteo (free, no API key, no account).
const Weather = (() => {
  const KEY = "cortex.location";
  const CODES = {
    0: ["Clear", "sun"], 1: ["Mostly clear", "sun"], 2: ["Partly cloudy", "partly"], 3: ["Overcast", "cloud"],
    45: ["Fog", "fog"], 48: ["Freezing fog", "fog"],
    51: ["Light drizzle", "rain"], 53: ["Drizzle", "rain"], 55: ["Heavy drizzle", "rain"],
    56: ["Freezing drizzle", "rain"], 57: ["Freezing drizzle", "rain"],
    61: ["Light rain", "rain"], 63: ["Rain", "rain"], 65: ["Heavy rain", "rain"],
    66: ["Freezing rain", "rain"], 67: ["Freezing rain", "rain"],
    71: ["Light snow", "snow"], 73: ["Snow", "snow"], 75: ["Heavy snow", "snow"], 77: ["Snow grains", "snow"],
    80: ["Rain showers", "rain"], 81: ["Rain showers", "rain"], 82: ["Violent showers", "rain"],
    85: ["Snow showers", "snow"], 86: ["Snow showers", "snow"],
    95: ["Thunderstorm", "storm"], 96: ["Thunderstorm, hail", "storm"], 99: ["Thunderstorm, hail", "storm"],
  };
  const ICONS = {
    sun: '<circle cx="24" cy="24" r="9" fill="#ffb547"/><g stroke="#ffb547" stroke-width="2.5" stroke-linecap="round"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/></g>',
    partly: '<circle cx="18" cy="18" r="7" fill="#ffb547"/><path d="M15 38h20a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 1 13z" fill="#bfe9ff"/>',
    cloud: '<path d="M13 37h22a9 9 0 0 0 0-18 12 12 0 0 0-23 3.5A7.3 7.3 0 0 0 13 37z" fill="#bfe9ff"/>',
    fog: '<g stroke="#bfe9ff" stroke-width="3" stroke-linecap="round"><path d="M8 18h32M5 26h38M10 34h28"/></g>',
    rain: '<path d="M13 30h22a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0-1 13z" fill="#bfe9ff"/><g stroke="#43d9ff" stroke-width="2.5" stroke-linecap="round"><path d="M16 35l-2 6M24 35l-2 6M32 35l-2 6"/></g>',
    snow: '<path d="M13 30h22a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0-1 13z" fill="#bfe9ff"/><g fill="#fff"><circle cx="16" cy="38" r="2"/><circle cx="24" cy="41" r="2"/><circle cx="32" cy="38" r="2"/></g>',
    storm: '<path d="M13 28h22a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0-1 13z" fill="#8eb4c6"/><path d="M25 30l-6 9h5l-2 7 8-11h-5l2-5z" fill="#ffb547"/>',
  };

  let status = { ok: false, text: "Starting" };
  // The latest result, for views that draw weather their own way (Home's desktop hub).
  let last = null;
  const subs = new Set();
  function notify(info) { last = info; subs.forEach((fn) => fn(info)); }

  function location() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && typeof saved.lat === "number") return saved;
    } catch { /* storage unavailable */ }
    return window.CORTEX_CONFIG.weather;
  }
  function saveLocation(loc) {
    try { localStorage.setItem(KEY, JSON.stringify(loc)); } catch { /* storage unavailable */ }
  }

  async function geocode(query) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Location lookup failed.");
    const data = await res.json();
    const hit = data.results?.[0];
    if (!hit) throw new Error(`No place called "${query}" was found.`);
    const region = hit.admin1 && hit.admin1 !== hit.name ? `, ${hit.admin1}` : "";
    return { name: `${hit.name}${region}`, lat: hit.latitude, lon: hit.longitude };
  }

  function moonPhase(date) {
    const synodic = 29.530588853;
    const known = Date.UTC(2000, 0, 6, 18, 14);
    const age = (((date - known) / 86400000) % synodic + synodic) % synodic;
    const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
    return names[Math.floor(((age / synodic) * 8) + 0.5) % 8];
  }

  function compass(deg) {
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
  }

  async function fetchWeather(loc) {
    const units = (window.CORTEX_CONFIG.weather.units || "fahrenheit") === "celsius" ? "celsius" : "fahrenheit";
    const params = new URLSearchParams({
      latitude: loc.lat, longitude: loc.lon, timezone: "auto", forecast_days: "5",
      temperature_unit: units, wind_speed_unit: units === "celsius" ? "kmh" : "mph", precipitation_unit: units === "celsius" ? "mm" : "inch",
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Weather service returned ${res.status}.`);
    return { data: await res.json(), units };
  }

  function timeOf(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !window.CORTEX_CONFIG.clock24h });
  }

  function detailRows({ data, units }) {
    const c = data.current, d = data.daily;
    const deg = units === "celsius" ? "°C" : "°F";
    const speed = units === "celsius" ? "km/h" : "mph";
    return [
      ["Feels like", `${Math.round(c.apparent_temperature)}${deg}`],
      ["Humidity", `${c.relative_humidity_2m}%`],
      ["Wind", `${Math.round(c.wind_speed_10m)} ${speed} ${compass(c.wind_direction_10m)}`],
      ["Pressure", `${Math.round(c.surface_pressure)} hPa`],
      ["Rain chance", `${d.precipitation_probability_max?.[0] ?? 0}%`],
      ["Sunrise", timeOf(d.sunrise[0])],
      ["Sunset", timeOf(d.sunset[0])],
      ["Moon", moonPhase(new Date())],
    ];
  }

  // Plain values for custom views: now, today's high/low, five days and the detail rows.
  function summary(result) {
    const { data, units } = result;
    const c = data.current, d = data.daily;
    const [cond, icon] = CODES[c.weather_code] || ["Unknown", "cloud"];
    const days = d.time.slice(0, 5).map((t, i) => {
      const date = new Date(`${t}T12:00:00`);
      const [dc, di] = CODES[d.weather_code[i]] || ["Unknown", "cloud"];
      return { date, cond: dc, icon: ICONS[di], hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]) };
    });
    return {
      temp: Math.round(c.temperature_2m), deg: units === "celsius" ? "°C" : "°F", cond, icon: ICONS[icon],
      hi: days[0]?.hi, lo: days[0]?.lo, days, rows: detailRows(result),
    };
  }

  function render(host, loc, { data, units }) {
    const c = data.current, d = data.daily;
    const [cond, icon] = CODES[c.weather_code] || ["Unknown", "cloud"];
    const deg = units === "celsius" ? "°C" : "°F";
    const rows = detailRows({ data, units });
    const days = [1, 2, 3].map((i) => {
      const date = new Date(`${d.time[i]}T12:00:00`);
      const name = i === 1 ? "Tomorrow" : date.toLocaleDateString([], { weekday: "long" });
      const short = i === 1 ? "Tmrw" : date.toLocaleDateString([], { weekday: "short" });
      const [dc] = CODES[d.weather_code[i]] || ["Unknown"];
      return { name, short, hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]), cond: dc, rain: d.precipitation_probability_max?.[i] ?? 0 };
    });

    // Today strip: now, today's high and low, then the rest behind "More weather".
    const hi = Math.round(d.temperature_2m_max[0]), lo = Math.round(d.temperature_2m_min[0]);
    host.innerHTML = `
      <div class="wx-now">
        <svg class="wx-icon" viewBox="0 0 48 48" aria-hidden="true">${ICONS[icon]}</svg>
        <div>
          <p class="wx-temp"></p>
          <p class="wx-cond"></p>
          <p class="wx-hilo"></p>
        </div>
      </div>
      <p class="wx-loc"></p>
      <details class="wx-more">
        <summary>More weather</summary>
        <p class="wx-updated"></p>
        <dl class="wx-details"></dl>
        <div class="wx-forecast"></div>
      </details>`;
    host.querySelector(".wx-loc").textContent = loc.name;
    host.querySelector(".wx-updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    host.querySelector(".wx-temp").textContent = `${Math.round(c.temperature_2m)}${deg}`;
    host.querySelector(".wx-cond").textContent = cond;
    host.querySelector(".wx-hilo").textContent = `High ${hi}° · Low ${lo}°`;
    const dl = host.querySelector(".wx-details");
    for (const [k, v] of rows) {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      dl.append(dt, dd);
    }
    const fc = host.querySelector(".wx-forecast");
    for (const day of days) {
      const div = document.createElement("div");
      div.className = "wx-day";
      div.innerHTML = `<h3><abbr></abbr></h3><p class="hi-lo"></p><p class="c"></p><p class="rain"></p>`;
      // Short day names keep all three cards on the same lines on phones.
      div.querySelector("abbr").textContent = day.short;
      div.querySelector("abbr").title = day.name;
      div.querySelector("h3").setAttribute("aria-label", day.name);
      div.querySelector(".hi-lo").textContent = `${day.hi}°/${day.lo}°`;
      div.querySelector(".hi-lo").setAttribute("aria-label", `High ${day.hi} degrees, low ${day.lo} degrees`);
      div.querySelector(".c").textContent = day.cond;
      div.querySelector(".rain").textContent = `${day.rain}% rain`;
      fc.appendChild(div);
    }
  }

  async function refresh(host) {
    const loc = location();
    try {
      const result = await fetchWeather(loc);
      render(host, loc, result);
      status = { ok: true, text: `Open-Meteo · ${loc.name}` };
      notify({ ok: true, loc, result, at: new Date() });
    } catch (err) {
      host.innerHTML = '<p class="muted"></p>';
      host.firstChild.textContent = `Weather unavailable: ${err.message}`;
      status = { ok: false, text: err.message };
      notify({ ok: false, loc, error: `Weather unavailable: ${err.message}` });
    }
    return status;
  }

  function bind(form, cityInput, geoBtn, host, after) {
    cityInput.value = location().name || "";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        saveLocation(await geocode(cityInput.value.trim()));
        after(await refresh(host));
      } catch (err) {
        host.innerHTML = '<p class="muted"></p>';
        host.firstChild.textContent = err.message;
        subs.forEach((fn) => fn({ ...last, formError: err.message }));
      }
    });
    geoBtn.addEventListener("click", () => {
      if (!navigator.geolocation) {
        host.textContent = "This browser can't share your location.";
        subs.forEach((fn) => fn({ ...last, formError: "This browser can't share your location." }));
        return;
      }
      geoBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const loc = { name: "My location", lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3) };
        saveLocation(loc);
        cityInput.value = loc.name;
        geoBtn.disabled = false;
        after(await refresh(host));
      }, () => {
        geoBtn.disabled = false;
        host.insertAdjacentHTML("beforeend", '<p class="muted">Location permission was not given.</p>');
        subs.forEach((fn) => fn({ ...last, formError: "Location permission was not given." }));
      }, { timeout: 10000 });
    });
  }

  // A full forecast page for the saved location: the National Weather Service for US locations.
  function forecastUrl() {
    const { lat, lon } = location();
    const us = lat > 18 && lat < 72 && lon > -180 && lon < -64;
    return us ? `https://forecast.weather.gov/MapClick.php?lat=${lat}&lon=${lon}` : null;
  }

  // subscribe(fn): fn({ ok, loc, result | error, formError? }) after every refresh or failed location change.
  function subscribe(fn) { subs.add(fn); if (last) fn(last); }

  return { refresh, bind, forecastUrl, summary, subscribe, location, status: () => status };
})();
