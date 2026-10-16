/** Which Instagram reel/post/story brought this visitor (ADR 0009 attribution). */

const CAMPAIGN_KEY = "utm_campaign";

/**
 * The campaign the visitor arrived with (?utm_campaign=… on the Instagram bio or
 * story link), remembered for the visit so it survives browsing to another product.
 * Browser only; storage failures (private mode) just mean no campaign.
 */
export function currentCampaign(search: string = window.location.search): string | null {
  const fromUrl = new URLSearchParams(search).get(CAMPAIGN_KEY)?.trim().slice(0, 100) || null;
  try {
    if (fromUrl) {
      window.sessionStorage.setItem(CAMPAIGN_KEY, fromUrl);
      return fromUrl;
    }
    return window.sessionStorage.getItem(CAMPAIGN_KEY);
  } catch {
    return fromUrl;
  }
}
