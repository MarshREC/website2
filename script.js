const DISCORD_USER_ID = "1370490512552890368";
const LANYARD_URL = `https://api.lanyard.rest/v1/users/${DISCORD_USER_ID}`;
const REFRESH_MS = 30_000;

const el = (id) => document.getElementById(id);
const ui = {
  avatar: el("avatar"), avatarFallback: el("avatar-fallback"), displayName: el("display-name"),
  username: el("username"), statusDot: el("status-dot"), statusLabel: el("status-label"),
  customStatus: el("custom-status"), presenceArea: el("presence-area"), presenceGrid: el("presence-grid"),
  activityCard: el("activity-card"), activityArt: el("activity-art"), activityName: el("activity-name"),
  activityDetail: el("activity-detail"), activityTime: el("activity-time"), spotifyCard: el("spotify-card"),
  spotifyBody: el("spotify-body"), spotifyArt: el("spotify-art"), spotifySong: el("spotify-song"),
  spotifyArtist: el("spotify-artist"), spotifyProgress: el("spotify-progress"), connectionNote: el("connection-note"),
  lastUpdated: el("last-updated"), refresh: el("refresh-button")
};

let currentActivityStart = null;
let currentSpotifyTimestamps = null;
let lastKnownData = null;

const statusText = { online: "online", idle: "idle", dnd: "do not disturb", offline: "offline" };

function initials(name) {
  return (name || "?").trim().slice(0, 1).toUpperCase() || "?";
}

function avatarUrl(user) {
  if (!user?.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=512`;
}

function activityAsset(activity) {
  const image = activity?.assets?.large_image;
  if (!image || !activity?.application_id) return null;
  if (image.startsWith("mp:")) return `https://media.discordapp.net/${image.slice(3)}`;
  return `https://cdn.discordapp.com/app-assets/${activity.application_id}/${image}.png`;
}

function elapsedTime(start) {
  if (!start) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `for ${hours ? `${hours}h ` : ""}${minutes}m`;
}

function setStatus(status) {
  const safeStatus = statusText[status] ? status : "offline";
  ui.statusDot.className = `status-dot status-dot--${safeStatus}`;
  ui.statusLabel.textContent = statusText[safeStatus];
}

function setCustomStatus(activity) {
  ui.customStatus.replaceChildren();
  if (!activity?.state) {
    ui.customStatus.hidden = true;
    return;
  }
  ui.customStatus.hidden = false;
  const emoji = activity.emoji;
  if (emoji?.id) {
    const image = document.createElement("img");
    image.className = "custom-emoji";
    image.src = `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "webp"}?size=48`;
    image.alt = emoji.name || "";
    ui.customStatus.append(image);
  } else if (emoji?.name) {
    ui.customStatus.append(`${emoji.name} `);
  }
  ui.customStatus.append(activity.state);
}

function setActivity(activity) {
  ui.activityCard.hidden = !activity;
  currentActivityStart = activity?.timestamps?.start || null;
  if (!activity) {
    ui.activityArt.style.backgroundImage = "";
    ui.activityArt.textContent = "";
    ui.activityName.textContent = "";
    ui.activityDetail.textContent = "";
    ui.activityTime.textContent = "";
    return;
  }
  const asset = activityAsset(activity);
  ui.activityArt.style.backgroundImage = asset ? `url("${asset}")` : "";
  ui.activityArt.classList.toggle("activity-art--fallback", !asset);
  ui.activityArt.textContent = asset ? "" : activity.name.slice(0, 1).toUpperCase();
  ui.activityName.textContent = activity.name;
  ui.activityDetail.textContent = [activity.details, activity.state].filter(Boolean).join(" · ");
  updateActivityClock();
}

function setSpotify(spotify) {
  const isPlaying = Boolean(spotify?.song && spotify?.album_art_url);
  ui.spotifyCard.hidden = !isPlaying;
  currentSpotifyTimestamps = isPlaying ? spotify.timestamps : null;
  if (!isPlaying) return;
  ui.spotifyArt.src = spotify.album_art_url;
  ui.spotifyArt.alt = `${spotify.album || "Spotify"} album artwork`;
  ui.spotifySong.textContent = spotify.song;
  ui.spotifyArtist.textContent = spotify.artist || "Unknown artist";
  updateSpotifyProgress();
}

function updateActivityClock() {
  ui.activityTime.textContent = currentActivityStart ? elapsedTime(currentActivityStart) : "";
}

function updateSpotifyProgress() {
  const timestamps = currentSpotifyTimestamps;
  if (!timestamps?.start || !timestamps?.end) {
    ui.spotifyProgress.style.width = "0%";
    return;
  }
  const progress = Math.min(100, Math.max(0, ((Date.now() - timestamps.start) / (timestamps.end - timestamps.start)) * 100));
  ui.spotifyProgress.style.width = `${progress}%`;
}

function render(data, cached = false) {
  const user = data.discord_user || {};
  const name = user.global_name || user.display_name || user.username || "Discord profile";
  const avatar = avatarUrl(user);
  const activities = Array.isArray(data.activities) ? data.activities : [];
  const custom = activities.find((activity) => activity.type === 4);
  const activity = activities.find((item) => item.type !== 4 && item.name !== "Spotify");

  ui.displayName.textContent = name;
  document.title = `${name} — Discord Presence`;
  ui.username.textContent = user.username ? `@${user.username}` : "@unknown";
  ui.avatarFallback.textContent = initials(name);
  if (avatar) {
    ui.avatar.onload = () => { ui.avatarFallback.hidden = true; };
    ui.avatar.onerror = () => {
      ui.avatar.hidden = true;
      ui.avatarFallback.hidden = false;
    };
    ui.avatarFallback.hidden = true;
    ui.avatar.src = avatar;
    ui.avatar.hidden = false;
  } else {
    ui.avatar.hidden = true;
    ui.avatarFallback.hidden = false;
  }
  setStatus(data.discord_status);
  setCustomStatus(custom);
  setActivity(activity);
  setSpotify(data.listening_to_spotify ? data.spotify : null);
  const hasSpotify = Boolean(data.listening_to_spotify && data.spotify?.song && data.spotify?.album_art_url);
  ui.presenceArea.hidden = !(activity || hasSpotify);
  ui.presenceGrid.classList.toggle("presence-grid--single", Boolean(activity) !== hasSpotify);
  ui.connectionNote.textContent = cached ? "Showing the last known presence. Retrying shortly." : data.discord_status === "offline" ? "Currently offline. Live details will return when available." : "Presence updates every 30 seconds.";
  ui.lastUpdated.textContent = `updated ${new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date())}`;
}

async function refreshPresence() {
  ui.refresh.classList.add("is-loading");
  try {
    const response = await fetch(LANYARD_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Lanyard responded with ${response.status}`);
    const result = await response.json();
    if (!result.success || !result.data) throw new Error("Lanyard returned no presence data");
    lastKnownData = result.data;
    sessionStorage.setItem("lanyard-last-presence", JSON.stringify(lastKnownData));
    render(lastKnownData);
  } catch (error) {
    const stored = lastKnownData || JSON.parse(sessionStorage.getItem("lanyard-last-presence") || "null");
    if (stored) render(stored, true);
    else {
      setStatus("offline");
      ui.customStatus.hidden = true;
      ui.presenceArea.hidden = true;
      ui.connectionNote.textContent = "Couldn’t reach Lanyard. Retrying shortly.";
      ui.lastUpdated.textContent = "waiting for a connection";
    }
  } finally {
    ui.refresh.classList.remove("is-loading");
  }
}

function startStarfield() {
  const canvas = el("starfield");
  const context = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let stars = [];
  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    stars = Array.from({ length: Math.min(100, Math.floor(innerWidth / 13)) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, size: Math.random() * 1.25 + .25, speed: Math.random() * .12 + .02, phase: Math.random() * Math.PI * 2 }));
  }
  function draw(time = 0) {
    context.clearRect(0, 0, innerWidth, innerHeight);
    for (const star of stars) {
      const alpha = .16 + ((Math.sin(time * .001 * star.speed * 9 + star.phase) + 1) / 2) * .44;
      context.fillStyle = `rgba(232, 240, 255, ${alpha})`;
      context.fillRect(star.x, star.y, star.size, star.size);
    }
    if (!reduced) requestAnimationFrame(draw);
  }
  resize(); draw();
  addEventListener("resize", resize, { passive: true });
}

ui.refresh.addEventListener("click", refreshPresence);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPresence(); });
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  addEventListener("pointermove", (event) => {
    document.documentElement.style.setProperty("--parallax-x", `${event.clientX - innerWidth / 2}px`);
    document.documentElement.style.setProperty("--parallax-y", `${event.clientY - innerHeight / 2}px`);
  }, { passive: true });
}
setInterval(refreshPresence, REFRESH_MS);
setInterval(() => { updateActivityClock(); updateSpotifyProgress(); }, 1000);
startStarfield();
refreshPresence();
