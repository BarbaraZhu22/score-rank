// Shared cache for export data
export const exportCache = new Map<string, { data: any; expires: number }>();
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up expired entries every minute
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of exportCache.entries()) {
      if (value.expires < now) {
        exportCache.delete(key);
      }
    }
  }, 60 * 1000);
}

