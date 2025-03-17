// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { slackNotificationClient } from "../_shared/slack-notification-client.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";

const BATCH_SIZE = 500;

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
  let insertedCount = 0;
  try {
    if (!serviceRoleKey) {
      throw new AuthorizationError("Authorization header is missing");
    }

    // Supabase 클라이언트 초기화
    const supabaseClient = createSupabaseClient(serviceRoleKey);

    const { data: missionTimes, error: queryError } = await supabaseClient
      .from("mission_time")
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

    const missionHistoryBatches = chunkArray(missionHistories, BATCH_SIZE);

    const failedMissionIds: number[] = [];
    for (const batch of missionHistoryBatches) {
      const { data: batchData, error: insertError } = await supabaseClient
        .from("mission_history")
        .insert(batch)
        .select();

      if (insertError) {
        failedMissionIds.push(...batch.map((mission) => mission.mission_id));
      } else if (batchData) {
        insertedCount += batchData.length;
      }
    }

    slackNotificationClient.send(
      `총 ${missionTimes.length}개의 미션 설정으로, ${insertedCount}개의 오늘의 미션이 생성되었습니다.`,
    );

    if (failedMissionIds.length > 0) {
      throw new MissionCreationError(
        "일부 미션 생성에 실패하였습니다.",
        failedMissionIds,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          count: insertedCount,
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    if (error instanceof MissionCreationError) {
      slackNotificationClient.send(
        `${error.message}
        생성에 실패한 미션 설정 목록: ${error.failedMissionIds.join(", ")}`,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
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
    if (error instanceof Error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    {
      return new Response(
        JSON.stringify({
          success: false,
          error,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-missions' \
    --header 'Authorization: Bearer {serviceRoleKey}' \
    --header 'Content-Type: application/json' \

*/

class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

class MissionCreationError extends Error {
  failedMissionIds: number[];

  constructor(message: string, failedMissionIds: number[]) {
    super(message);
    this.name = "MissionCreationError";
    this.failedMissionIds = failedMissionIds;
  }
}
