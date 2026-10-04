import { TEAM_LABELS, VENUE_LABELS } from "./config.js";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function venueLabel(name) {
  const key = String(name || "").trim().toUpperCase();
  return VENUE_LABELS[key] || String(name || "").trim();
}

export function ownTeamPerspective(match) {
  const homeId = String(match.home?.id ?? "");
  const awayId = String(match.away?.id ?? "");

  if (TEAM_LABELS[homeId]) {
    return {
      isHome: true,
      teamId: homeId,
      teamLabel: TEAM_LABELS[homeId],
      ownTeam: match.home,
      opponent: match.away,
      ownScore: match.result?.home ?? null,
      opponentScore: match.result?.away ?? null
    };
  }

  if (TEAM_LABELS[awayId]) {
    return {
      isHome: false,
      teamId: awayId,
      teamLabel: TEAM_LABELS[awayId],
      ownTeam: match.away,
      opponent: match.home,
      ownScore: match.result?.away ?? null,
      opponentScore: match.result?.home ?? null
    };
  }

  return null;
}

export function isFinishedMatch(match) {
  if (match.status?.live) return false;

  return Boolean(match.status?.finished) ||
    (match.result?.home !== null && match.result?.away !== null);
}

export function renderBreakableName(value = "") {
  return escapeHtml(value)
    .replaceAll("/", "/&#8203;")
    .replaceAll("-", "-&#8203;");
}
