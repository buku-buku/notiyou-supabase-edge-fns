import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { firebaseMessaging, Messaging } from "../_shared/firebase-admin.ts";
import { slackNotificationClient } from "../_shared/slack-notification-client.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import { ChallengerSupporterData, DismissMessageData, UserMetadataData } from "./_types.ts";

type RequestPayload = {
  type: "UPDATE";
  table: "challenger_supporter";
  schema: "public";
  record: ChallengerSupporterData;
  old_record: ChallengerSupporterData;
};

Deno.serve(async (req) => {
  const { old_record, record } = await req.json() as RequestPayload;
  
  // 조력제 해제 이벤트가 아닌 경우
  if (old_record.supporter_id === null || record.supporter_id) {
    return new Response(JSON.stringify({
      success: true,
      message: "Not a supporter dismiss event",
    }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 200,
    });
  }

  const serviceRoleKey = req.headers.get("Authorization")?.replace(
    "Bearer ",
    "",
  );

  const supabaseClient = createSupabaseClient(serviceRoleKey);
  const { challenger_id, supporter_id } = old_record;
  const dismissMessageDataList: DismissMessageData[] = [];

  const supporterMetadataData = await getUserMetadataData(supabaseClient, supporter_id);
  if (supporterMetadataData) {
    const supporterDismissMessageData = generateDismissMessageData(supporterMetadataData, "supporter");
    dismissMessageDataList.push(supporterDismissMessageData);
  }
  const challengerMetadataData = await getUserMetadataData(supabaseClient, challenger_id);
  if (challengerMetadataData) {
    const challengerDismissMessageData = generateDismissMessageData(challengerMetadataData, "challenger");
    dismissMessageDataList.push(challengerDismissMessageData);
  }

  try {
    const result = await sendNotifications(firebaseMessaging, dismissMessageDataList);
    // TODO: 디버깅용 기능 제거
    await slackNotificationClient.send(`to Challenger: 서포터(${supporter_id})가 미션을 그만두었습니다.`)
    await slackNotificationClient.send(`to Supporter: 도전자(${challenger_id})의 미션에서 해제되었습니다.`)

    return new Response(
      JSON.stringify(result),
      { headers: { "Content-Type": "application/json", status: 200, } },
    )
  } catch (error) {
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
})

async function getUserMetadataData(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_metadata")
    .select("id, fcm_token")
    .eq("id", userId)
    .single() as unknown as {
      data: UserMetadataData;
      error: Error;
    };

  if (error) {
    throw new Error(
      `${userId}의 FCM 토큰 데이터를 가져오는 중 오류가 발생했습니다: ${error.message}`
    );
  }

  if (!data.fcm_token) {
    return null;
  }

  return data;
}

function generateDismissMessageData(
  userMetadataData: UserMetadataData,
  userRole: "challenger" | "supporter",
) {
  return {
    token: userMetadataData?.fcm_token,
    title: '조력자 해제 알림',
    message: userRole === "challenger" ? '조력자가 그만두었습니다.' : '미션에서 해제되었습니다.',
  }
}

async function sendNotifications(
  firebaseMessaging: Messaging,
  dismissMessageDataList: DismissMessageData[],
) {
  try {
    const promises = dismissMessageDataList.map(async (data) => {
      try {
        return await firebaseMessaging.send({
          token: data.token,
          notification: {
            title: data.title,
            body: data.message ?? "조력자가 해제되었습니다.",
          },
        });
      } catch (error) {
        console.error(`메시지 전송 실패: ${error.message}`);
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter(result => result !== null);
  } catch (error) {
    throw new Error(`FCM 메시지 전송 중 오류 발생: ${error.message}`);
  }
}