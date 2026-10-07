import { serve } from "inngest/next";
import {
  inngest,
  sendEmail,
  maintenance,
  refreshReplyJob,
  scheduledReplies,
} from "@/lib/inngest";
export const maxDuration = 300;
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendEmail, maintenance, refreshReplyJob, scheduledReplies],
});
