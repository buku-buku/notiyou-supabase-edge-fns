// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface ChallengerMissionTime {
  id: number;
  created_at: string;
  updated_at: string;
  challenger_id: string;
  mission_at: string;
  mission_number: number;
  supporter_id: string | null;
}

Deno.serve(async (req) => {
  const serviceRoleKey = req.headers.get("Authorization")?.replace(
    "Bearer ",
    "",
  );
  try {
    if (!serviceRoleKey) {
      throw new AuthorizationError("Authorization header is missing");
    }

    // Supabase 클라이언트 초기화
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
        },
      },
    );

    const { data: missionTimes, error: queryError } = await supabaseClient
      .from("challenger_mission_time")
      .select("*");

    if (queryError) throw queryError;

    // mission_history 생성
    const missionHistories = (missionTimes as ChallengerMissionTime[]).map((
      missionTime,
    ) => ({
      created_at: new Date().toISOString(),
      mission_id: missionTime.id,
      mission_at: missionTime.mission_at,
    }));

    const { data: insertedData, error: insertError } = await supabaseClient
      .from("mission_history")
      .insert(missionHistories)
      .select();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          count: insertedData?.length,
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return new Response(
        JSON.stringify({
          success: false,
          error,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-missions' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU' \
    --header 'Content-Type: application/json' \

*/

class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}
