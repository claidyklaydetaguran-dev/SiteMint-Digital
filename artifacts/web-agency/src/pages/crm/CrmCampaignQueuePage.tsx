import { useLocation } from "wouter";
import CrmCampaignQueue from "./CrmCampaignQueue";

export default function CrmCampaignQueuePage() {
  const [, navigate] = useLocation();
  return (
    <CrmCampaignQueue
      onBack={() => navigate("/admin/crm/campaigns")}
    />
  );
}
