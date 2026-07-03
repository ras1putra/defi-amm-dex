import { z } from "zod";

export const proposalSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(100, "Title is too long"),
  description: z.string().min(20, "Description must be at least 20 characters"),
});

export type ProposalFormValues = z.infer<typeof proposalSchema>;
