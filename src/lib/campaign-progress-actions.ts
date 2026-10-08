"use server";

import { z } from "zod";
import { requireUser } from "@/lib/session";
import { readCampaignProgress } from "@/lib/campaign-progress";

export async function getCampaignProgress(campaignIds: string[]) {
  const user = await requireUser();
  const ids = z.array(z.uuid()).max(500).parse(campaignIds);
  return readCampaignProgress(user, ids);
}
