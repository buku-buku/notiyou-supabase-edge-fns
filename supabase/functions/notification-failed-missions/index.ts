import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { firebaseMessaging, Messaging } from "../_shared/firebase-admin.ts";
import { ServiceResponse } from "../_shared/service-response.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { NotificationType } from "../_shared/types/notification.ts";
import {
  ChallengerGracePeriodData,
  ChallengerSupporterData,
  CombinedMissionData,
  MissionHistoryData,
  MissionMessagesData,
  UserMetadataData,
} from "./_types.ts";

Deno.serve(async (req) => {
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
    const failedMissions = await findFailedMissions(supabaseClient);
    const result = await sendNotifications(
      firebaseMessaging,
      failedMissions,
      supabaseClient,
    );

    return new ServiceResponse({
      success: true,
      data: result,
    }, {
      status: 200,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return new ServiceResponse({
        success: false,
        error: error.message,
      }, {
        status: 401,
      });
    }

    return new ServiceResponse({
      success: false,
      error: error instanceof Error
        ? error.message
        : "알 수 없는 오류가 발생했습니다.",
    }, {
      status: 500,
    });
  }
});

async function findFailedMissions(
  supabase: SupabaseClient,
): Promise<CombinedMissionData[]> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 첫 번째 쿼리: mission_history, mission_time, challenger_supporter 데이터 가져오기
  const { data: missionsData, error: missionsError } = await supabase
    .from("mission_history")
    .select(`
      id,
      done_at,
      mission_at,
      last_failed_noti_sent_at,
      mission_time!inner (
        id,
        challenger_supporter_id
      )
    `)
    .gte("created_at", yesterday.toISOString())
    .lt("created_at", tomorrow.toISOString()) as unknown as {
      data: MissionHistoryData[];
      error: Error;
    };

  if (missionsError) {
    throw new Error(
      "미션 데이터를 가져오는 중 오류가 발생했습니다: " +
        missionsError.message,
    );
  }

  // 결과가 없으면 빈 배열 반환
  if (!missionsData || missionsData.length === 0) {
    return [];
  }
  // 두 번째 쿼리: challenger_supporter 데이터 가져오기
  const { data: supporterData, error: supporterError } = await supabase
    .from("challenger_supporter")
    .select("id, challenger_id, supporter_id")
    .in(
      "id",
      missionsData.map((mission) =>
        mission.mission_time.challenger_supporter_id
      ),
    ) as unknown as {
      data: ChallengerSupporterData[];
      error: Error;
    };

  if (supporterError) {
    throw new Error(
      "서포터 데이터를 가져오는 중 오류가 발생했습니다: " +
        supporterError.message,
    );
  }

  // null이 아닌 supporter_id만 필터링
  const validSupporterIds = supporterData
    .map((supporter) => supporter.supporter_id)
    .filter((id) => id);

  // 세 번째 쿼리: mission_messages 데이터 가져오기
  const { data: messagesData, error: messagesError } = await supabase
    .from("mission_messages")
    .select("user_id, success_message, fail_message")
    .in("user_id", validSupporterIds) as unknown as {
      data: MissionMessagesData[];
      error: Error;
    };

  if (messagesError) {
    throw new Error(
      "메시지 데이터를 가져오는 중 오류가 발생했습니다: " +
        messagesError.message,
    );
  }

  // null이 아닌 challenger_id만 필터링
  const validChallengerIds = supporterData
    .map((supporter) => supporter.challenger_id)
    .filter((id) => id);

  // 네 번째 쿼리: grace_period 데이터 가져오기
  const { data: gracePeriodData, error: gracePeriodError } = await supabase
    .from("challenger_grace_period")
    .select("challenger_id, grace_period")
    .in("challenger_id", validChallengerIds) as unknown as {
      data: ChallengerGracePeriodData[];
      error: Error;
    };

  if (gracePeriodError) {
    throw new Error(
      "유예 기간 데이터를 가져오는 중 오류가 발생했습니다: " +
        gracePeriodError.message,
    );
  }

  // 다섯 번째 쿼리: fcm_token 데이터 가져오기
  const { data: userMetadataData, error: userMetadataError } = await supabase
    .from("user_metadata")
    .select("id, fcm_token")
    .in("id", validSupporterIds) as unknown as {
      data: UserMetadataData[];
      error: Error;
    };

  if (userMetadataError) {
    throw new Error(
      "FCM 토큰 데이터를 가져오는 중 오류가 발생했습니다: " +
        userMetadataError.message,
    );
  }

  // 데이터 결합
  const combinedData: CombinedMissionData[] = missionsData.map((mission) => {
    const supporter = supporterData.find((s) =>
      s.id === mission.mission_time.challenger_supporter_id
    );

    if (!supporter) return null;

    const messages = messagesData.find((m) =>
      m.user_id === supporter.supporter_id
    );
    const gracePeriod = gracePeriodData.find((gp) =>
      gp.challenger_id === supporter.challenger_id
    )?.grace_period || 0;
    const fcmToken = userMetadataData.find((ft) =>
      ft.id === supporter.supporter_id
    )?.fcm_token || "";

    return {
      ...mission,
      supporter_id: supporter.supporter_id,
      challenger_id: supporter.challenger_id,
      success_message: messages?.success_message || "",
      fail_message: messages?.fail_message || "",
      grace_period: gracePeriod,
      fcm_token: fcmToken,
    };
  }).filter((item) => item !== null);

  const failedMissions = combinedData.filter((mission) => {
    const now = new Date();
    const [nowHour, nowMinute] = now.toISOString().split("T")[1].split(":");
    const [missionHour, missionMinute] = mission.mission_at.split(":");

    const isOverDeadline = nowHour > missionHour ||
      (nowHour === missionHour && nowMinute >= missionMinute);

    return !mission.done_at && isOverDeadline &&
      isNotRecentlyNotified(mission, now);
  });

  return failedMissions;
}

function isNotRecentlyNotified(mission: CombinedMissionData, now: Date) {
  const lastNotifiedTime = mission.last_failed_noti_sent_at
    ? new Date(mission.last_failed_noti_sent_at)
    : null;

  return !lastNotifiedTime ||
    (now.getTime() - lastNotifiedTime.getTime()) > 10 * 60 * 1000;
}

async function sendNotifications(
  firebaseMessaging: Messaging,
  failedMissions: CombinedMissionData[],
  supabase: SupabaseClient,
) {
  const response = await firebaseMessaging.sendEach(
    failedMissions.map((mission) => ({
      token: mission.fcm_token,
      notification: {
        title: "도전자 미션 실패 알림",
        body: mission.fail_message ?? "도전자가 미션을 실패했습니다.",
      },
      data: {
        notification_type: NotificationType.MISSION_FAILED,
      },
    })),
  );

  const successfulMissionIds = failedMissions
    .filter((_, index) => response.responses[index].success)
    .map((mission) => mission.id);

  if (successfulMissionIds.length > 0) {
    const { error } = await supabase
      .from("mission_history")
      .update({ last_failed_noti_sent_at: new Date().toISOString() })
      .in("id", successfulMissionIds);

    if (error) {
      console.error("Failed to update last_failed_noti_sent_at:", error);
    }
  }

  return response;
}

class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}
