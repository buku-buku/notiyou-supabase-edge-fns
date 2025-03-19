export interface UserMetadataData {
  id: string;
  fcm_token: string;
}

export interface ChallengerSupporterData {
  id: string;
  challenger_id: string;
  supporter_id: string;
}

export interface DismissMessageData {
  token: string;
  title: string;
  message: string;
}