import type { CampaignWithMembership } from "../../data/types";
import type { Campaign } from "../../types/database";

export interface CampaignFormState {
  name: string;
  team: string;
  startDate: string;
  endDate: string;
  location: string;
  status: Campaign["status"];
}

export const emptyCampaignForm: CampaignFormState = {
  name: "",
  team: "",
  startDate: "",
  endDate: "",
  location: "",
  status: "draft",
};

export interface CampaignAssignmentFormState {
  athleteId: string;
  status: CampaignWithMembership["memberStatus"];
}

export const emptyCampaignAssignmentForm: CampaignAssignmentFormState = {
  athleteId: "",
  status: "registered",
};
