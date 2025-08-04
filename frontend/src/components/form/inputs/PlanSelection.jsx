import React from 'react'
import { motion } from 'framer-motion'
import styles from './PlanSelection.module.css'

/**
 * Plan selection component for Amnezia and V2Ray accounts
 * @param {string} panelType - Panel type (AMN for Amnezia and MZ for V2Ray)
 * @param {function} onSelectPlan - Function called when a plan is selected
 * @param {object} selectedPlan - Currently selected plan
 * @param {number} availableData - Available data allocation for the agent
 */
const PlanSelection = ({ panelType, onSelectPlan, selectedPlan, availableData }) => {
  // Amnezia plans
  const amneziaPlan = [
    { 
      days: 30, 
      dataLimit: null, 
      cost: 100, // Cost in system units - in Amnezia 3.33x days
      label: '30 Days (100 Units)'
    },
    { 
      days: 60, 
      dataLimit: null, 
      cost: 200, 
      label: '60 Days (200 Units)'
    },
    { 
      days: 90, 
      dataLimit: null, 
      cost: 300, 
      label: '90 Days (300 Units)'
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
                  <span className={styles['detail-value']}>2</span>
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
      </div>
    </div>
  )
}

export default PlanSelection