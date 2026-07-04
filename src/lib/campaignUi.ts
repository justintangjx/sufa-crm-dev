import type { Campaign } from "../types/database";

export function isU24Campaign(
  campaign: Pick<Campaign, "id" | "name" | "team"> | null | undefined,
): boolean {
  if (!campaign) {
    return false;
  }
  const campaignName = campaign.name.toLowerCase();
  const campaignTeam = campaign.team?.toLowerCase() ?? "";
  return campaign.id === "c-u24" || campaignName.includes("u24") || campaignTeam.includes("u24");
}

export function pickPrimaryCampaign(campaigns: readonly Campaign[]): Campaign | null {
  return (
    campaigns.find((campaign) => campaign.status === "active" && isU24Campaign(campaign)) ??
    campaigns.find((campaign) => campaign.status === "active") ??
    campaigns[0] ??
    null
  );
}

export function orderCampaignsForMvp<
  T extends Pick<Campaign, "id" | "name" | "team" | "status" | "start_date">,
>(campaigns: readonly T[]): T[] {
  return campaigns.toSorted((a, b) => {
    const u24Rank = Number(isU24Campaign(b)) - Number(isU24Campaign(a));
    if (u24Rank !== 0) {
      return u24Rank;
    }
    const activeRank = Number(b.status === "active") - Number(a.status === "active");
    if (activeRank !== 0) {
      return activeRank;
    }
    return (b.start_date ?? "").localeCompare(a.start_date ?? "");
  });
}
