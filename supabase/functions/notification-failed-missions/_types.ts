export interface MissionHistoryData {
  id: number;
  done_at: string;
  mission_at: string;
  last_failed_noti_sent_at: string | null;
  mission_time: {
    id: number;
    challenger_supporter_id: string;
    mission_at: string;
  };
}

export interface ChallengerSupporterData {
  id: string;
  challenger_id: string;
  supporter_id: string;
}

export interface MissionMessagesData {
  user_id: string;
  success_message: string;
  fail_message: string;
}

export interface ChallengerGracePeriodData {
  challenger_id: string;
  grace_period: number;
}

export interface UserMetadataData {
  id: string;
  fcm_token: string;
}

export interface CombinedMissionData {
  id: number;
  done_at: string | null;
  mission_at: string;
  last_failed_noti_sent_at: string | null;
  mission_time: {
    id: number;
    challenger_supporter_id: string;
  };
  supporter_id: string;
  challenger_id: string;
  success_message: string;
  fail_message: string;
  grace_period: number;
  fcm_token: string;
}
