import type { RecorderState } from "../shared/types";

export type RecorderActionKey = "start" | "pause" | "resume" | "stop";

export interface RecorderControlState {
  primary: RecorderActionKey;
  primaryLabel: string;
  helperText: string;
  showStop: boolean;
}

export function getRecorderControlState(state: RecorderState): RecorderControlState {
  switch (state) {
    case "Recording":
      return { primary: "pause", primaryLabel: "暂停记录", helperText: "正在后台采集和分析屏幕活动", showStop: true };
    case "Paused":
      return { primary: "resume", primaryLabel: "恢复记录", helperText: "记录已暂停，本地数据保持不变", showStop: true };
    case "Error":
      return { primary: "start", primaryLabel: "重新开始", helperText: "上次记录发生异常，请检查状态提示", showStop: false };
    case "Stopped":
      return { primary: "start", primaryLabel: "开始记录", helperText: "上一段记录已停止", showStop: false };
    case "Idle":
    default:
      return { primary: "start", primaryLabel: "开始记录", helperText: "点击后开始后台采集", showStop: false };
  }
}
