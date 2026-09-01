import { driveSource } from "./drive.ts";
import { mailSource } from "./mail.ts";
import { slackSource } from "./slack.ts";
import type { MinutesSource, SourceName } from "./types.ts";

/** 取り込みに使えるコネクタの一覧。 */
export const SOURCES: MinutesSource[] = [mailSource, slackSource, driveSource];

export function findSource(name: SourceName): MinutesSource | undefined {
  return SOURCES.find((source) => source.name === name);
}

/** 環境変数が揃っていて、実際に取り込みに使えるコネクタ。 */
export function configuredSources(): MinutesSource[] {
  return SOURCES.filter((source) => source.configured());
}

export * from "./types.ts";
