import React from 'react'
import { motion } from 'framer-motion'
import styles from './PlanSelection.module.css'

/**
 * کامپوننت انتخاب پلن برای اکانت‌های امنزیا و v2ray
 * @param {string} panelType - نوع پنل (AMN برای امنزیا و MZ برای v2ray)
 * @param {function} onSelectPlan - تابعی که با انتخاب پلن فراخوانی می‌شود
 * @param {object} selectedPlan - پلن انتخابی فعلی
 * @param {number} availableData - حجم قابل اختصاص برای عامل
 */
const PlanSelection = ({ panelType, onSelectPlan, selectedPlan, availableData }) => {
  // پلن‌های امنزیا
  const amneziaPlan = [
    { 
      days: 30, 
      dataLimit: null, 
      cost: 100, // هزینه به واحد داخلی سیستم - در امنزیا 3.33 برابر روز
      label: '30 روز (100 واحد)'
    },
    { 
      days: 60, 
      dataLimit: null, 
      cost: 200, 
      label: '60 روز (200 واحد)'
    },
    { 
      days: 90, 
      dataLimit: null, 
      cost: 300, 
      label: '90 روز (300 واحد)'
    }
  ]

  // پلن‌های v2ray
  const v2rayPlans = [
    // پلن‌های یکماهه
    { 
      days: 30, 
      dataLimit: 15, 
      cost: 15, 
      label: '15 گیگ - 30 روز (15 واحد)'
    },
    { 
      days: 30, 
      dataLimit: 30, 
      cost: 30, 
      label: '30 گیگ - 30 روز (30 واحد)'
    },
    { 
      days: 30, 
      dataLimit: 60, 
      cost: 60, 
      label: '60 گیگ - 30 روز (60 واحد)'
    },
    // پلن‌های دوماهه
    { 
      days: 60, 
      dataLimit: 30, 
      cost: 60, 
      label: '30 گیگ - 60 روز (60 واحد)'
    },
    { 
      days: 60, 
      dataLimit: 60, 
      cost: 120, 
      label: '60 گیگ - 60 روز (120 واحد)'
    },
    { 
      days: 60, 
      dataLimit: 120, 
      cost: 240, 
      label: '120 گیگ - 60 روز (240 واحد)'
    }
  ]

  // انتخاب آرایه پلن‌ها بر اساس نوع پنل
  const plans = panelType === 'AMN' ? amneziaPlan : v2rayPlans

  // بررسی آیا پلن قابل انتخاب است یا خیر (بر اساس موجودی)
  const isPlanAvailable = (plan) => {
    return availableData >= plan.cost
  }

  return (
    <div className={styles['plan-selection']}>
      <h4 className={styles['plan-title']}>انتخاب پلن</h4>
      <div className={styles['plan-container']}>
        {plans.map((plan, index) => (
          <motion.div
            key={index}
            className={`${styles['plan-item']} ${selectedPlan && selectedPlan.days === plan.days && selectedPlan.dataLimit === plan.dataLimit ? styles['selected'] : ''} ${!isPlanAvailable(plan) ? styles['disabled'] : ''}`}
            onClick={() => isPlanAvailable(plan) && onSelectPlan(plan)}
            whileHover={{ scale: isPlanAvailable(plan) ? 1.02 : 1 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles['plan-content']}>
              <h5 className={styles['plan-name']}>{panelType === 'AMN' ? 'نامحدود' : `${plan.dataLimit} گیگابایت`}</h5>
              <div className={styles['plan-days']}>{plan.days} روز</div>
              <div className={styles['plan-details']}>
                {/* تعداد کاربر همزمان */}
                <div className={styles['plan-detail']}>
                  <span className={styles['detail-label']}>کاربر همزمان:</span>
                  <span className={styles['detail-value']}>2</span>
                </div>
                {/* هزینه */}
                <div className={styles['plan-detail']}>
                  <span className={styles['detail-label']}>کسر اعتبار:</span>
                  <span className={styles['detail-value']}>{plan.cost} واحد</span>
                </div>
              </div>
            </div>
            {!isPlanAvailable(plan) && (
              <div className={styles['unavailable-overlay']}>
                <div className={styles['unavailable-text']}>اعتبار ناکافی</div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export default PlanSelection