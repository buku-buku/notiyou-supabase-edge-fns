import { NotificationType } from "../_shared/types/notification.ts";

export interface UserMetadataData {
  id: string;
  fcm_token: string;
}

export interface ChallengerSupporterData {
  id: string;
  challenger_id: string;
  supporter_id: string;
}

export interface MessageData {
  token: string;
  title: string;
  message: string;
  data: {
    notification_type: NotificationType;
  };
}
