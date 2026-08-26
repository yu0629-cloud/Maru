export type DeviceSessionView = {
  id: string;
  parent_id: string;
  device_id: string;
  device_name: string | null;
  platform: string | null;
  last_seen_at: string;
  created_at: string;
  isCurrent: boolean;
};
