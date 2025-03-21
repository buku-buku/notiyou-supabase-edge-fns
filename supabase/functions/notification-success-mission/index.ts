import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { firebaseMessaging, Messaging } from "../_shared/firebase-admin.ts";
import { slackNotificationClient } from "../_shared/slack-notification-client.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import {
  CombinedMissionData,
  MissionHistoryData,
  MissionMessagesData,
  MissionTimeData,
  UserMetadataData,
} from "./_types.ts";

/**
 * @link https://supabase.com/docs/guides/database/webhooks#payload
 */
interface RequestPayload {
  type: "UPDATE";
  table: "mission_history";
  schema: "public";
  record: MissionHistoryData;
  old_record: MissionHistoryData;
}

Deno.serve(async (req) => {
  const { old_record, record } = await req.json() as RequestPayload;

  // 미션 완료 처리 UPDATE가 아니거나, 미션 완료를 취소하는 경우 알림을 보내지 않음
  if (old_record.done_at === record.done_at || !record.done_at) {
    return new Response(null, {
      status: 204,
    });
  }

  const {
    mission_id: missionId,
  } = record;

  const serviceRoleKey = req.headers.get("Authorization")?.replace(
    "Bearer ",
    "",
  );

  try {
    if (!serviceRoleKey) {
      throw new AuthorizationError("Authorization header is missing");
    }

    // 요청 본문 파싱
    const supabaseClient = createSupabaseClient(serviceRoleKey);
    const missionData = await findMissionToNotify(supabaseClient, missionId);
    if (missionData === null) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "미션 데이터를 찾을 수 없습니다.",
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 404,
        },
      );
    }

    const result = await sendNotifications(firebaseMessaging, [missionData]);
    slackNotificationClient.send(
      `mission_history.${record.id}번 미션 성공 알림 전송 결과: ${
        result.responses.map((r) => r.success).join(", ")
      }`,
    );

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    slackNotificationClient.send(
      `mission_history.${record.id}번 미션 성공 알림 전송 중 오류가 발생했습니다: ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
    );

    if (error instanceof AuthorizationError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
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
        error: error instanceof Error
          ? error.message
          : "알 수 없는 오류가 발생했습니다.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
});

async function findMissionToNotify(
  supabase: SupabaseClient,
  missionId: number,
): Promise<CombinedMissionData | null> {
  // 첫 번째 쿼리: mission_time, challenger_supporter 데이터 가져오기
  const { data: missionTimeData, error: missionTimeError } = await supabase
    .from("mission_time")
    .select(`
      id,
      challenger_supporter!inner (
        id,
        challenger_id,
        supporter_id
      )
    `)
    .eq("id", missionId).single() as unknown as {
      data: MissionTimeData;
      error: Error;
    };

  if (missionTimeError) {
    throw new Error(
      "미션 데이터를 가져오는 중 오류가 발생했습니다: " +
        missionTimeError.message,
    );
  }

  if (missionTimeData.challenger_supporter.supporter_id === null) {
    return null;
  }

  // 두 번째 쿼리: mission_messages 데이터 가져오기
  const { data: messagesData, error: messagesError } = await supabase
    .from("mission_messages")
    .select("user_id, success_message, fail_message")
    .eq(
      "user_id",
      missionTimeData.challenger_supporter.challenger_id,
    ) as unknown as {
      data: MissionMessagesData | null;
      error: Error;
    };

  if (messagesError) {
    throw new Error(
      "메시지 데이터를 가져오는 중 오류가 발생했습니다: " +
        messagesError.message,
    );
  }

  // 세 번째 쿼리: fcm_token 데이터 가져오기
  const { data: userMetadataData, error: userMetadataError } = await supabase
    .from("user_metadata")
    .select("id, fcm_token")
    .eq("id", missionTimeData.challenger_supporter.supporter_id)
    .single() as unknown as {
      data: UserMetadataData;
      error: Error;
    };

  if (userMetadataError) {
    throw new Error(
      "FCM 토큰 데이터를 가져오는 중 오류가 발생했습니다: " +
        userMetadataError.message,
    );
  }

  if (!userMetadataData.fcm_token) {
    return null;
  }

  // 데이터 결합
  const combinedData: CombinedMissionData = {
    fcm_token: userMetadataData?.fcm_token,
    success_message: messagesData?.success_message || "",
  };

  return combinedData;
}

function sendNotifications(
  firebaseMessaging: Messaging,
  successMissions: CombinedMissionData[],
) {
  return firebaseMessaging.sendEach(
    successMissions.map((mission) => ({
      token: mission.fcm_token,
      notification: {
        title: "도전자 미션 성공 알림",
        body: mission.success_message ?? "도전자가 미션을 성공했습니다.",
      },
    })),
  );
}

class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}
