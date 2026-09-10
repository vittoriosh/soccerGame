export function playerImageSrc(imageUrl: string) {
  return `/api/player-image?src=${encodeURIComponent(imageUrl)}`;
}

/**
 * Club crests live on the same hotlink-protected sofifa CDN as player
 * photos, at a predictable /teams/{id}/{size}.png path, so they route
 * through the same proxy. Returns null when a player has no club (free
 * agent) — clubId is null in that case.
 */
export function clubLogoSrc(clubId: number | null, size: 30 | 60 | 90 = 60) {
  if (!clubId) return null;
  return playerImageSrc(`https://cdn.sofifa.net/teams/${clubId}/${size}.png`);
}
