/**
 * سیستم کش ساده برای ذخیره موقت داده‌ها
 */
class Cache {
  constructor(defaultTTL = 60) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL; // زمان انقضا به ثانیه
  }

  /**
   * ذخیره داده در کش
   * @param {string} key - کلید کش
   * @param {any} value - مقدار
   * @param {number} ttl - زمان انقضا به ثانیه (اختیاری)
   */
  set(key, value, ttl = this.defaultTTL) {
    const expiry = Date.now() + (ttl * 1000);
    this.cache.set(key, {
      value,
      expiry
    });
    return value;
  }

  /**
   * بازیابی داده از کش
   * @param {string} key - کلید کش
   * @returns {any|null} - مقدار کش شده یا null در صورت عدم وجود یا منقضی شدن
   */
  get(key) {
    const data = this.cache.get(key);
    
    if (!data) return null;
    
    // بررسی انقضا
    if (Date.now() > data.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return data.value;
  }

  /**
   * حذف داده از کش
   * @param {string} key - کلید کش
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * پاکسازی کل کش
   */
  clear() {
    this.cache.clear();
  }

  /**
   * بازیابی از کش یا اجرای تابع در صورت عدم وجود داده در کش
   * @param {string} key - کلید کش
   * @param {Function} fetchFn - تابع دریافت داده در صورت عدم وجود در کش
   * @param {number} ttl - زمان انقضا به ثانیه (اختیاری)
   * @returns {Promise<any>} - مقدار کش شده یا نتیجه تابع
   */
  async getOrFetch(key, fetchFn, ttl = this.defaultTTL) {
    const cachedValue = this.get(key);
    if (cachedValue !== null) {
      return cachedValue;
    }
    
    const value = await fetchFn();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * حذف داده‌های منقضی شده
   */
  cleanup() {
    const now = Date.now();
    for (const [key, data] of this.cache.entries()) {
      if (now > data.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

// ایجاد نمونه‌های کش با TTL متفاوت
const shortCache = new Cache(30); // 30 ثانیه
const mediumCache = new Cache(300); // 5 دقیقه
const longCache = new Cache(3600); // 1 ساعت

// تنظیم زمانبندی برای پاکسازی خودکار
setInterval(() => {
  shortCache.cleanup();
  mediumCache.cleanup();
  longCache.cleanup();
}, 60000); // هر دقیقه

module.exports = {
  shortCache,
  mediumCache,
  longCache,
  Cache
}; 