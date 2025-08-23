// app/api/_lib/types.ts
export type TokenStatus = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist';

export interface DBInfoRow {
  now: string;
  db: string;
}
export interface HasEnumRow {
  has_enum: boolean;
}
export interface HasTableRow {
  reg: string | null;
}
