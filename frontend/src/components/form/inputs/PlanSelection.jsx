import React, { useState } from 'react'
import { motion } from 'framer-motion'
import styles from './PlanSelection.module.css'

/**
 * Plan selection component for Amnezia and V2Ray accounts
 * @param {string} panelType - Panel type (AMN for Amnezia and MZ for V2Ray)
 * @param {function} onSelectPlan - Function called when a plan is selected
 * @param {object} selectedPlan - Currently selected plan
 * @param {number} availableData - Available data allocation for the agent
 * @param {number} amneziaCoefficient - Coefficient for Amnezia/unlimited deduction
 */
const PlanSelection = ({ panelType, onSelectPlan, selectedPlan, availableData, amneziaCoefficient }) => {
  const [customGB, setCustomGB] = useState('15')
  const AMNEZIA_COEFFICIENT = amneziaCoefficient || 6.6666;
  
  // Function to calculate and round up cost
  const calculateCost = (days) => {
    const exactCost = days * AMNEZIA_COEFFICIENT;
    return Math.ceil(exactCost);
  };

  // Amnezia plans
  const amneziaPlan = [
    { 
      days: 30, 
      dataLimit: null, 
      cost: calculateCost(30), // Cost calculated based on AMNEZIA_COEFFICIENT
      label: `30 Days (${calculateCost(30)} Units)`
    },
    { 
      days: 60, 
      dataLimit: null, 
      cost: calculateCost(60),
      label: `60 Days (${calculateCost(60)} Units)`
    },
    { 
      days: 90, 
      dataLimit: null, 
      cost: calculateCost(90),
      label: `90 Days (${calculateCost(90)} Units)`
    }
  ]

  // V2Ray plans - 30 days only
  const v2rayPlans = [
    // One-month plans
    { 
      days: 30, 
      dataLimit: 15, 
      cost: 15, 
      label: '15 GB - 30 Days (15 Units)'
    },
    { 
      days: 30, 
      dataLimit: 30, 
      cost: 30, 
      label: '30 GB - 30 Days (30 Units)'
    },
    { 
      days: 30, 
      dataLimit: 60, 
      cost: 60, 
      label: '60 GB - 30 Days (60 Units)'
    }
  ]

  // Select plan array based on panel type
  const plans = panelType === 'AMN' ? amneziaPlan : v2rayPlans

  // Check if plan is available based on account balance
  const isPlanAvailable = (plan) => {
    return availableData >= plan.cost
  }

  return (
    <div className={styles['plan-selection']}>
      <h4 className={styles['plan-title']}>Select Plan</h4>
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
              <h5 className={styles['plan-name']}>{panelType === 'AMN' ? 'Unlimited' : `${plan.dataLimit} GB`}</h5>
              <div className={styles['plan-days']}>{plan.days} Days</div>
              <div className={styles['plan-details']}>
                {/* Concurrent users */}
                <div className={styles['plan-detail']}>
                  <span className={styles['detail-label']}>Concurrent Users:</span>
                  <span className={styles['detail-value']}>{panelType === 'AMN' ? '1' : '2'}</span>
                </div>
                {/* Cost */}
                <div className={styles['plan-detail']}>
                  <span className={styles['detail-label']}>Deduction:</span>
                  <span className={styles['detail-value']}>{plan.cost} Units</span>
                </div>
              </div>
            </div>
            {!isPlanAvailable(plan) && (
              <div className={styles['unavailable-overlay']}>
                <div className={styles['unavailable-text']}>Insufficient Balance</div>
              </div>
            )}
          </motion.div>
        ))}

        {panelType !== 'AMN' && (
          <motion.div
            key="custom"
            className={`${styles['plan-item']} ${selectedPlan && selectedPlan.isCustom ? styles['selected'] : ''} ${availableData < Math.max(15, (parseInt(customGB || '0', 10) || 0)) ? styles['disabled'] : ''}`}
            onClick={() => {
              const num = parseInt(customGB || '0', 10) || 0
              const gb = Math.max(15, num)
              if (availableData >= gb) {
                onSelectPlan({ days: 30, dataLimit: gb, cost: gb, isCustom: true, label: `Custom - ${gb} GB - 30 Days (${gb} Units)` })
              }
            }}
            whileHover={{ scale: availableData >= Math.max(15, (parseInt(customGB || '0', 10) || 0)) ? 1.02 : 1 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles['plan-content']}>
              <h5 className={styles['plan-name']}>Custom</h5>
              <div className={styles['plan-days']}>30 Days</div>
              <div className={styles['plan-details']}>
                <div className={styles['plan-detail']} style={{ width: '100%' }}>
                  <span className={styles['detail-label']}>Data Limit (GB):</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={customGB}
                      onChange={(e) => {
                        const digits = (e.target.value || '').replace(/[^0-9]/g, '')
                        setCustomGB(digits)
                        if (selectedPlan && selectedPlan.isCustom) {
                          const val = Math.max(15, (parseInt(digits || '0', 10) || 0))
                          onSelectPlan({ days: 30, dataLimit: val, cost: val, isCustom: true, label: `Custom - ${val} GB - 30 Days (${val} Units)` })
                        }
                      }}
                      onBlur={() => {
                        const val = Math.max(15, (parseInt(customGB || '0', 10) || 0))
                        setCustomGB(String(val))
                        if (selectedPlan && selectedPlan.isCustom) {
                          onSelectPlan({ days: 30, dataLimit: val, cost: val, isCustom: true, label: `Custom - ${val} GB - 30 Days (${val} Units)` })
                        }
                      }}
                      className={styles['custom-input']}
                      style={{
                        flex: '1 1 auto',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border-clr, #2f3b52)',
                        background: 'transparent',
                        color: 'inherit'
                      }}
                    />
                    <span className={styles['detail-value']} style={{ whiteSpace: 'nowrap' }}>{Math.max(15, (parseInt(customGB || '0', 10) || 0))} Units</span>
                  </div>
                </div>
              </div>
            </div>
            {availableData < Math.max(15, (parseInt(customGB || '0', 10) || 0)) && (
              <div className={styles['unavailable-overlay']}>
                <div className={styles['unavailable-text']}>Insufficient Balance</div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default PlanSelection
