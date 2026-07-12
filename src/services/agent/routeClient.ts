/**
 * Agentic layer — client for the `agent-route` edge function.
 * Sends captured input + project context, returns proposals (nothing applied).
 */
import { supabase } from "@/integrations/supabase/client";
import type { AgentRouteInput, AgentRouteResponse } from "./types";

export async function routeAgentInput(
  input: AgentRouteInput,
  projectId: string,
  language: string,
  userType?: string | null,
): Promise<AgentRouteResponse> {
  const { data, error } = await supabase.functions.invoke("agent-route", {
    body: { input, projectId, language, userType: userType ?? null },
  });

  if (error) throw new Error(error.message);
  if (!data || !Array.isArray(data.proposals)) {
    throw new Error("Oväntat svar från agent-route");
  }
  return data as AgentRouteResponse;
}
