export type InboxSource = 'codex' | 'web' | 'shortcut' | 'api' | 'import' | 'cli';

export type InboxStatus = 'new' | 'processing' | 'processed' | 'trashed';

export type TaskStatus =
  | 'inbox'
  | 'next'
  | 'today'
  | 'scheduled'
  | 'waiting'
  | 'someday'
  | 'completed'
  | 'canceled'
  | 'trash';

export type Priority = 'low' | 'medium' | 'high';

export type EnergyLevel = 'low' | 'medium' | 'high';

export interface InboxItem {
  id: string;
  raw_text: string;
  source: InboxSource;
  status: InboxStatus;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  metadata_json: string | null;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  source_inbox_id: string | null;
  status: TaskStatus;
  project_id: string | null;
  importance: number;
  urgency: number;
  priority: Priority;
  deadline_at: string | null;
  start_at: string | null;
  reminder_at: string | null;
  repeat_rule: string | null;
  estimated_minutes: number | null;
  energy_level: EnergyLevel | null;
  delegated_to: string | null;
  waiting_for: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deleted_at: string | null;
  requires_computer?: number;
  requires_phone?: number;
  requires_internet?: number;
  requires_quiet?: number;
  can_do_on_commute?: number;
  can_do_offline?: number;
  location_hint?: string | null;
  person_hint?: string | null;
}

export interface TaskRequirementsInput {
  requiresComputer?: boolean;
  requiresPhone?: boolean;
  requiresInternet?: boolean;
  requiresQuiet?: boolean;
  canDoOnCommute?: boolean;
  canDoOffline?: boolean;
  locationHint?: string | null;
  personHint?: string | null;
}

export interface TaskInput {
  title: string;
  notes?: string | null;
  status?: TaskStatus;
  projectId?: string | null;
  importance?: number;
  urgency?: number;
  priority?: Priority;
  deadlineAt?: string | null;
  startAt?: string | null;
  reminderAt?: string | null;
  repeatRule?: string | null;
  estimatedMinutes?: number | null;
  energyLevel?: EnergyLevel | null;
  delegatedTo?: string | null;
  waitingFor?: string | null;
  requirements?: TaskRequirementsInput;
}

export interface RecommendationContext {
  hasComputer?: boolean;
  onCommute?: boolean;
  availableMinutes?: number;
  energyLevel?: EnergyLevel;
  includeWaiting?: boolean;
  currentLocation?: string;
  now?: string;
}

export interface Recommendation {
  task: Task;
  score: number;
  reasons: string[];
}

export type MessageProviderName = 'wecom_app' | 'fake';

export type MessageChannel = 'wecom_user' | 'wecom_party' | 'wecom_tag';

export type MessageSendStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'canceled';

export interface MessageRecipient {
  id: string;
  display_name: string;
  provider: MessageProviderName;
  channel: MessageChannel;
  external_id: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageOutboxItem {
  id: string;
  task_id: string | null;
  recipient_id: string;
  provider: MessageProviderName;
  message_type: 'text';
  body: string;
  scheduled_at: string;
  send_status: MessageSendStatus;
  external_id: string | null;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}


export type DeviceStatus = 'active' | 'offline' | 'retired';

export interface Device {
  id: string;
  name: string;
  notes: string | null;
  status: DeviceStatus;
  created_at: string;
  updated_at: string;
}

export interface DeviceInput {
  name: string;
  notes?: string | null;
  status?: DeviceStatus;
}

export type ComputeJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface ComputeJob {
  id: string;
  title: string;
  project: string | null;
  device_id: string | null;
  device_name: string | null;
  status: ComputeJobStatus;
  gamma: number | null;
  k_pcm: number | null;
  move_rule: string | null;
  iteration: number | null;
  objective: number | null;
  change_value: number | null;
  convergence_note: string | null;
  notes: string | null;
  next_action: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComputeJobInput {
  title: string;
  project?: string | null;
  deviceId?: string | null;
  status?: ComputeJobStatus;
  gamma?: number | null;
  kPcm?: number | null;
  moveRule?: string | null;
  iteration?: number | null;
  objective?: number | null;
  changeValue?: number | null;
  convergenceNote?: string | null;
  notes?: string | null;
  nextAction?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}
