// app/api/list/_store.ts
// ⚠️ In-memory — Vercel’de her instance için ayrı olabilir. Kalıcı depoya geçmek istersen KV/DB ekleyebiliriz.

export type TokenCategory = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist' | 'unknown';

// Ana listeler
export const DeadcoinList = new Set<string>();
export const Redlist = new Set<string>();
export const Blacklist = new Set<string>();
export const WalkingDeadcoinList = new Set<string>();

// Zaman damgaları (opsiyonel – statusAt için)
export const statusTimestamps = new Map<string, string>(); // mint -> ISO date

// Deadcoin oylama sayacı
export const deadcoinVotes: Record<string, { yes: number; no: number }> = {};

// L/V’den “deadcoin” şüphesi → direkt listeye eklemiyoruz; önce “öneri” olarak işaretliyoruz
export const suggestedDeadcoins = new Set<string>();

export function markStatus(mint: string) {
  statusTimestamps.set(mint, new Date().toISOString());
}

export function getStatus(mint: string): TokenCategory {
  if (Blacklist.has(mint)) return 'blacklist';
  if (Redlist.has(mint)) return 'redlist';
  if (DeadcoinList.has(mint)) return 'deadcoin';
  if (WalkingDeadcoinList.has(mint)) return 'walking_dead';
  return 'healthy';
}

// Yürüyen ölüye ekle/çıkar
export function addWalkingDead(mint: string) {
  WalkingDeadcoinList.add(mint);
  markStatus(mint);
}

export function removeWalkingDead(mint: string) {
  if (WalkingDeadcoinList.delete(mint)) markStatus(mint);
}

// L/V’den deadcoin şüphesi: öneri olarak işaretle
export function suggestDeadcoin(mint: string) {
  suggestedDeadcoins.add(mint);
  markStatus(mint);
}

// Deadcoin oylama kaydı + yeterse listeye taşıma
export function voteDeadcoin(mint: string, vote: 'yes' | 'no'): { yes: number; no: number; isDeadcoin: boolean } {
  if (!deadcoinVotes[mint]) deadcoinVotes[mint] = { yes: 0, no: 0 };
  deadcoinVotes[mint][vote] += 1;

  // 3+ “yes” → DeadcoinList’e al, WalkingDead varsa çıkar
  if (deadcoinVotes[mint].yes >= 3) {
    DeadcoinList.add(mint);
    suggestedDeadcoins.delete(mint);
    removeWalkingDead(mint); // varsa çıkar
    markStatus(mint);
    return { ...deadcoinVotes[mint], isDeadcoin: true };
  }
  return { ...deadcoinVotes[mint], isDeadcoin: DeadcoinList.has(mint) };
}
