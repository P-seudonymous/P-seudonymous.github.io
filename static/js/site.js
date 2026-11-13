(() => {
  const ambient = document.querySelector('.ambient');
  const dock = document.querySelector('.dock');
  const parser = new DOMParser();
  let navigationController;
  let navigationNumber = 0;
  let currentPage = `${location.pathname}${location.search}`;
  let lastPresence;
  const lastTrackKey = 'site-last-spotify-track';
  let lastTrack;
  try {
    const saved = JSON.parse(localStorage.getItem(lastTrackKey));
    if (saved && typeof saved.song === 'string' && typeof saved.artist === 'string' && Number.isFinite(saved.playedAt)) lastTrack = saved;
  } catch (_) { /* Storage can be unavailable in private browsing. */ }
  history.scrollRestoration = 'manual';

  const relativeTime = (timestamp) => {
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const showLastTrack = () => {
    const spotify = document.getElementById('spotify-status');
    if (!spotify || !lastTrack) return false;
    spotify.textContent = `Last played: ${lastTrack.song} — ${lastTrack.artist} · ${relativeTime(lastTrack.playedAt)}`;
    if (/^[a-zA-Z0-9]{22}$/.test(lastTrack.trackId)) spotify.href = `https://open.spotify.com/track/${lastTrack.trackId}`;
    else spotify.removeAttribute('href');
    spotify.setAttribute('aria-label', 'Last song heard on Spotify');
    return true;
  };

  const showPresence = (presence) => {
    const status = document.getElementById('discord-status');
    const dot = document.getElementById('discord-dot');
    const spotify = document.getElementById('spotify-status');
    const activity = document.getElementById('spotify-activity');
    if (!status || !dot || !spotify || !activity) return;

    status.textContent = presence.discord_status === 'dnd' ? 'Do not disturb' : presence.discord_status;
    dot.className = `status-dot ${presence.discord_status}`;
    if (presence.listening_to_spotify && presence.spotify) {
      activity.classList.add('is-playing');
      spotify.textContent = `${presence.spotify.song} — ${presence.spotify.artist}`;
      spotify.href = `https://open.spotify.com/track/${presence.spotify.track_id}`;
      spotify.setAttribute('aria-label', 'Current song on Spotify');
      lastTrack = {
        song: presence.spotify.song,
        artist: presence.spotify.artist,
        trackId: presence.spotify.track_id,
        playedAt: Number(presence.spotify.timestamps?.end) || Date.now()
      };
      try { localStorage.setItem(lastTrackKey, JSON.stringify(lastTrack)); } catch (_) { /* Keep the in-memory copy. */ }
    } else {
      activity.classList.remove('is-playing');
      if (lastTrack && lastTrack.playedAt > Date.now()) {
        lastTrack.playedAt = Date.now();
        try { localStorage.setItem(lastTrackKey, JSON.stringify(lastTrack)); } catch (_) { /* Keep the in-memory copy. */ }
      }
      if (!showLastTrack()) {
        spotify.textContent = spotify.dataset.idleStatus;
        spotify.removeAttribute('href');
        spotify.removeAttribute('aria-label');
      }
    }
  };

  const updatePresence = async () => {
    const discordId = document.querySelector('[data-discord-id]')?.dataset.discordId;
    if (!discordId || !/^\d+$/.test(discordId)) return;
    try {
      const response = await fetch(`https://api.lanyard.rest/v1/users/${discordId}`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload.success) return;
      lastPresence = payload.data;
      showPresence(lastPresence);
    } catch (_) { /* Keep the last visible activity if the service is unavailable. */ }
  };

  const navigate = async (url, addHistory) => {
    navigationController?.abort();
    navigationController = new AbortController();
    const number = ++navigationNumber;
    try {
      const response = await fetch(url.href, { signal: navigationController.signal });
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Page unavailable');
      const page = parser.parseFromString(await response.text(), 'text/html');
      const nextMain = page.querySelector('main');
      const nextDock = page.querySelector('.dock');
      if (!nextMain || !nextDock || number !== navigationNumber) return;

      const currentUnderlay = document.querySelector('.home-underlay');
      const nextUnderlay = page.querySelector('.home-underlay');
      if (!nextUnderlay) currentUnderlay?.remove();
      else if (!currentUnderlay) ambient.after(nextUnderlay);
      document.querySelector('main').replaceWith(nextMain);
      document.title = page.title;
      const description = page.querySelector('meta[name="description"]');
      if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description.content);
      const nextItems = nextDock.querySelectorAll('.dock-item');
      dock.querySelectorAll('.dock-item').forEach((item, index) => {
        if (nextItems[index]?.hasAttribute('aria-current')) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });

      if (addHistory) history.pushState({}, '', url.href);
      currentPage = `${url.pathname}${url.search}`;
      window.scrollTo(0, 0);
      nextMain.tabIndex = -1;
      nextMain.focus({ preventScroll: true });
      if (lastPresence) showPresence(lastPresence);
      updatePresence();
    } catch (error) {
      if (error.name !== 'AbortError') location.assign(url.href);
    }
  };

  document.addEventListener('click', (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const themeButton = event.target.closest('[data-theme-toggle]');
    if (themeButton) {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('site-theme', next);
      return;
    }

    const link = event.target.closest('a[href]');
    if (link) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.hash || /\.[^/]+$/.test(url.pathname)) return;
      if (`${url.pathname}${url.search}` === currentPage) return;
      event.preventDefault();
      navigate(url, true);
      return;
    }

  });

  window.addEventListener('popstate', () => {
    const url = new URL(location.href);
    if (`${url.pathname}${url.search}` !== currentPage) navigate(url, false);
  });

  showLastTrack();
  updatePresence();
  window.setInterval(updatePresence, 30000);
  window.setInterval(() => {
    if (lastPresence && !lastPresence.listening_to_spotify) showLastTrack();
  }, 60000);
})();
