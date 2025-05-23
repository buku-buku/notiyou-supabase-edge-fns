import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { firebaseMessaging, Messaging } from "../_shared/firebase-admin.ts";
import { slackNotificationClient } from "../_shared/slack-notification-client.ts";
import { ServiceResponse } from "../_shared/service-response.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";
import {
  ChallengerSupporterData,
  MessageData,
  UserMetadataData,
} from "./_types.ts";
import { NotificationType } from "../_shared/types/notification.ts";

type RequestPayload = {
  type: "UPDATE";
  table: "challenger_supporter";
  schema: "public";
  record: ChallengerSupporterData;
  old_record: ChallengerSupporterData;
};

const messages = {
  register: {
    title: "서포터 초대 알림",
    message: "님이 초대를 수락했습니다.",
    data: {
      notification_type: NotificationType.SUPPORTER_ASSIGNED,
    },
  },
  dismiss: {
    challenger: {
      title: "서포터 해제 알림",
      message: "님이 미션에서 해제되었습니다.",
      data: {
        notification_type: NotificationType.SUPPORTER_DISMISSED,
      },
    },
    supporter: {
      title: "서포터 해제 알림",
      message: "님의 미션에서 해제되었습니다.",
      data: {
        notification_type: NotificationType.SUPPORTER_DISMISSED,
      },
    },
  },
};

Deno.serve(async (req) => {
  const { old_record, record } = await req.json() as RequestPayload;
  const { challenger_id: challengerId, supporter_id: oldSupporterId } =
    old_record;
  const { supporter_id: newSupporterId } = record;
  const serviceRoleKey = req.headers.get("Authorization")?.replace(
    "Bearer ",
    "",
  );
  const supabaseClient = createSupabaseClient(serviceRoleKey ?? "");
  const challengerMetadataData = await getUserMetadataData(
    supabaseClient,
    challengerId,
  );

  if (!challengerMetadataData) {
    return new ServiceResponse({
      success: false,
      error: "Challenger metadata data not found",
    }, {
      status: 404,
    });
  }

  // 조력자가 새로 등록된 경우
  if (oldSupporterId === null && newSupporterId) {
    try {
      const supporterName = await getUserName(supabaseClient, newSupporterId);
      const supporterRegisteredMessageData = generateMessageData(
        challengerMetadataData,
        "register",
        "challenger",
        supporterName,
      );

      const result = await sendNotifications(firebaseMessaging, [
        supporterRegisteredMessageData,
      ]);
      await slackNotificationClient.send(
        `to Challenger: 서포터(${newSupporterId})가 초대를 수락했습니다.`,
      );
      return new ServiceResponse({
        success: true,
        data: result,
      }, {
        status: 200,
      });
    } catch (error) {
      return new ServiceResponse({
        success: false,
        error: error instanceof Error
          ? error.message
          : "알 수 없는 오류가 발생했습니다.",
      }, {
        status: 500,
      });
    }
  }

  // 기존 조력자가 해제된 경우
  if (oldSupporterId && newSupporterId === null) {
    try {
      const supporterMetadataData = await getUserMetadataData(
        supabaseClient,
        oldSupporterId,
      );

      if (!supporterMetadataData) {
        return new ServiceResponse({
          success: false,
          error: "Supporter metadata data not found",
        }, {
          status: 404,
        });
      }

      const challengerName = await getUserName(supabaseClient, challengerId);
      const supporterName = await getUserName(supabaseClient, oldSupporterId);

      const supporterDismissMessageData = generateMessageData(
        supporterMetadataData,
        "dismiss",
        "supporter",
        challengerName,
      );
      const challengerDismissMessageData = generateMessageData(
        challengerMetadataData,
        "dismiss",
        "challenger",
        supporterName,
      );

      const result = await sendNotifications(firebaseMessaging, [
        supporterDismissMessageData,
        challengerDismissMessageData,
      ]);
      await slackNotificationClient.send(
        `to Challenger: 서포터 ${supporterName}(${oldSupporterId})가 미션을 그만두었습니다.`,
      );
      await slackNotificationClient.send(
        `to Supporter: 도전자 ${challengerName}(${challengerId})의 미션에서 해제되었습니다.`,
      );
      return new ServiceResponse({
        success: true,
        data: result,
      }, {
        status: 200,
      });
    } catch (error) {
      return new ServiceResponse({
        success: false,
        error: error instanceof Error
          ? error.message
          : "알 수 없는 오류가 발생했습니다.",
      }, {
        status: 500,
      });
    }
  }

  return new ServiceResponse({
    success: false,
    error: "Unprocessable update operation",
  }, {
    status: 422,
  });
});

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
      `${userId}의 FCM 토큰 데이터를 가져오는 중 오류가 발생했습니다: ${error.message}`,
    );
  }

  if (!data.fcm_token) {
    return null;
  }

  return data;
}

function generateMessageData(
  userMetadataData: UserMetadataData,
  messageType: "register" | "dismiss",
  userRole: "challenger" | "supporter",
  participantName: string,
): MessageData {
  return {
    token: userMetadataData?.fcm_token,
    title: messageType === "register"
      ? messages.register.title
      : messages.dismiss[userRole].title,
    message: messageType === "register"
      ? participantName + messages.register.message
      : participantName + messages.dismiss[userRole].message,
    data: messageType === "register"
      ? messages.register.data
      : messages.dismiss[userRole].data,
  };
}

async function sendNotifications(
  firebaseMessaging: Messaging,
  messageDataList: MessageData[],
) {
  try {
    const promises = messageDataList.map(
      async ({ token, title, message, data }) => {
        try {
          return await firebaseMessaging.send({
            token,
            notification: {
              title,
              body: message ?? "조력자가 해제되었습니다.",
            },
            data,
          });
        } catch (error: unknown) {
          if (error instanceof Error) {
            console.error(`메시지 전송 실패: ${error.message}`);
          } else {
            console.error(`메시지 전송 실패: ${error}`);
          }
          return null;
        }
      },
    );

    const results = await Promise.all(promises);
    return results.filter((result) => result !== null);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`FCM 메시지 전송 중 오류 발생: ${error.message}`);
    } else {
      throw new Error(`FCM 메시지 전송 중 오류 발생: ${error}`);
    }
  }
}

async function getUserName(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_metadata")
    .select("name")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(
      `${userId}의 이름을 가져오는 중 오류가 발생했습니다: ${error.message}`,
    );
  }

  return data?.name;
}
