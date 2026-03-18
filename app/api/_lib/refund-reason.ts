export function isBlacklistRefundReason(reason: unknown): boolean {
    const raw = String(reason ?? '').trim().toLowerCase();
    if (!raw) return false;
  
    return (
      raw.includes('blacklist') ||
      raw.includes('blacklisted') ||
      raw.includes('black_list') ||
      raw.includes('black-list') ||
      raw.includes('kara liste') ||
      raw.includes('karaliste') ||
      raw.includes('token_blacklist') ||
      raw.includes('invalidated:blacklist') ||
      raw.includes('invalidated_by_blacklist')
    );
  }