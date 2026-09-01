/** アプリ全体で共有する型と、日本語ラベルの定義。 */

/** 役割。executive（役員）以上だけが役員限定タスクを閲覧できる。 */
export type Role = "member" | "executive" | "admin";

export type Status =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

/** 公開範囲。executive は役員・管理者のみ閲覧可。 */
export type Visibility = "all" | "executive";

export const ROLE_LABELS: Record<Role, string> = {
  member: "社員",
  executive: "役員",
  admin: "管理者",
};

export const STATUS_LABELS: Record<Status, string> = {
  not_started: "未着手",
  in_progress: "進行中",
  blocked: "停滞",
  done: "完了",
  cancelled: "中止",
};

export const STATUS_ORDER: Status[] = [
  "not_started",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
];

/** まだ追いかける必要がある状態。 */
export const OPEN_STATUSES: Status[] = ["not_started", "in_progress", "blocked"];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  all: "全社員",
  executive: "役員のみ",
};

export function isOpen(status: Status): boolean {
  return OPEN_STATUSES.includes(status);
}

/** 役員限定タスクを見られる役割か。 */
export function canSeeExecutive(role: Role): boolean {
  return role === "executive" || role === "admin";
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  active: boolean;
}

export interface Task {
  id: number;
  code: string;
  title: string;
  description: string;
  ownerId: string | null;
  ownerName: string;
  ownerEmail: string;
  dueDate: string | null;
  status: Status;
  visibility: Visibility;
  meetingTitle: string;
  meetingDate: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** 進捗が最後に報告／変更された日。「状況がわからない」判定に使う。 */
  statusUpdatedAt: string;
}

export interface TaskUpdate {
  id: number;
  taskId: number;
  userId: string | null;
  userName: string;
  body: string;
  statusFrom: Status | null;
  statusTo: Status | null;
  createdAt: string;
}
