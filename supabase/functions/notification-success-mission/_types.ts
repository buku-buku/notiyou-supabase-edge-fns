export interface MissionHistoryData {
  id: number;
  /**
   * @type {timestamptz}
   */
  done_at: string;
  mission_id: number;
  /**
   * @type {timetz}
   */
  mission_at: string;
  /**
   * @type {timestamptz}
   */
  created_at: string;
}

export interface MissionTimeData {
  id: number;
  challenger_supporter: {
    challenger_id: string;
    supporter_id: string;
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
  success_message: string;
  fcm_token: string;
}
