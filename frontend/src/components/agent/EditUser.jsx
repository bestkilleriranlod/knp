import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'

import { ReactComponent as EditIcon } from '../../assets/svg/edit.svg'
import { ReactComponent as DeleteIcon } from "../../assets/svg/delete.svg"
import { ReactComponent as PowerIcon } from "../../assets/svg/power.svg"
import { ReactComponent as RefreshIcon } from '../../assets/svg/refresh.svg'
import { ReactComponent as LockIcon } from '../../assets/svg/lock.svg'
import { ReactComponent as XMarkIcon } from '../../assets/svg/x-mark.svg'
import { ReactComponent as ThreeDotsIcon } from '../../assets/svg/three-dots.svg'
import { ReactComponent as SpinnerIcon } from '../../assets/svg/spinner.svg'
import Checkbox from '@mui/material/Checkbox'
import PlanSelection from '../form/inputs/PlanSelection'


import Button from '../Button'
import Modal from '../Modal'
import { motion, AnimatePresence } from 'framer-motion'
import LeadingIcon from '../LeadingIcon'
import styles from "./EditUser.module.css"
import FormField from '../form/FormField'
import Dropdown from '../Dropdown'
import FormControlLabel from '@mui/material/FormControlLabel'
import IOSSwitch from '../form/inputs/IOSSwitch'
import ErrorCard from '../ErrorCard'

const flowOptions = [
    { label: "none", value: "none" },
    { label: "xtls-rprx-vision", value: "xtls-rprx-vision" }
]

const EditUser = ({ onClose, showForm, onDeleteItem, item, onEditItem, onPowerItem, onResetItem, editMode, onUnlockItem }) => {
    const [selectedProtocols, setSelectedProtocols] = useState([])
    const [safu, setSafu] = useState((item && Boolean(item.safu)) || null)
    const [protocols, setProtocols] = useState([
        { name: "vmess", disabled: true },
        { name: "vless", disabled: true },
        { name: "trojan", disabled: true },
        { name: "shadowsocks", disabled: true }
    ])
    const [isMoreOptionClicked, setIsMoreOptionClicked] = useState(false)
    const [flowValue, setFlowValue] = useState({ label: "none", value: "none" })
    const [country, setCountry] = useState("")
    const [amneziaDays, setAmneziaDays] = useState(null)
    const [expireInputType, setExpireInputType] = useState("number")
    const [isLoadingProtocols, setIsLoadingProtocols] = useState(false)
    const [hasError, setHasError] = useState(false)
    const [error_msg, setError_msg] = useState("failed to switch countries")
    const [flag, setFlag] = useState(false)
    const [isDataLimitDisabled, setIsDataLimitDisabled] = useState(false)
    const [selectedPlan, setSelectedPlan] = useState(null)

    const access_token = sessionStorage.getItem("access_token")

    useEffect(() => {
        if (!showForm) {
            setIsMoreOptionClicked(false)
        }

        setSafu((item && Boolean(item.safu)) || null)

    }, [showForm])

    useEffect(() => {
        if (item) {
            const userProtocols = Object.keys(item.inbounds)
            setSelectedProtocols(userProtocols)
            setIsDataLimitDisabled(b2gb(item.data_limit) == 10000)
            setCountry(item.country)
            if (item.inbounds.vless) {
                setFlowValue({ label: item.inbounds.vless.flow, value: item.inbounds.vless.flow })
            }

            // تشخیص نوع پنل از روی شناسه پنل یا کشور
            console.log("Panel ID:", item.corresponding_panel_id)
            console.log("Panel Type:", panel_type)
            
            if (panel_type === "AMN") {
                setExpireInputType("plan_selection")
                                    // Set Amnezia days based on current user's days
                if (item.expire) {
                    const days = timeStampToDay(item.expire)
                    // Select closest value to 30, 60, or 90
                    let closestDays = 30;
                    if (days > 45) closestDays = 60;
                    if (days > 75) closestDays = 90;
                    
                    // Set default plan based on number of days
                    setSelectedPlan({
                        days: closestDays,
                        dataLimit: null,
                        cost: closestDays * (10/3), // هزینه امنزیا: 3.33 برابر روز
                        label: `${closestDays} روز (${closestDays * (10/3)} واحد)`
                    });
                    setAmneziaDays(closestDays)
                }
            } else {
                setExpireInputType("plan_selection")
                // تنظیم پلن v2ray بر اساس مقادیر فعلی کاربر
                const dataGB = b2gb(item.data_limit)
                
                // فقط پلن‌های 30 روزه
                const days = 30;
                let closestDataLimit = 30; // مقدار پیش‌فرض
                
                // تعیین نزدیک‌ترین حجم داده
                if (dataGB <= 22.5) closestDataLimit = 15;
                else if (dataGB <= 45) closestDataLimit = 30;
                else closestDataLimit = 60;
                
                // تنظیم پلن
                const cost = closestDataLimit;
                
                setSelectedPlan({
                    days: days,
                    dataLimit: closestDataLimit,
                    cost: cost,
                    label: `${closestDataLimit} گیگ - ${days} روز (${cost} واحد)`
                });
            }
        }
    }, [item])


    useEffect(() => {
        setIsMoreOptionClicked(false)

        const getProtocols = async () => {
            setFlowValue({ label: "none", value: "none" })
            setIsLoadingProtocols(true)
            const panelInboundsObj = (await axios.post("/get_panel_inbounds", { access_token, country })).data

            if (panelInboundsObj.status === "ERR") {
                setError_msg(panelInboundsObj.msg)
                setHasError(true)
                setIsLoadingProtocols(false)
                setProtocols([
                    { name: "vmess", disabled: true },
                    { name: "vless", disabled: true },
                    { name: "trojan", disabled: true },
                    { name: "shadowsocks", disabled: true }
                ])
                setSelectedProtocols([])
                return
            }
            const panelType = panelInboundsObj.panel_type || "MZ";
            delete panelInboundsObj.panel_type;
            
            const availableProtocolsName = Object.keys(panelInboundsObj);
            
            // اگر امنزیا است، تمام پروتکل‌های موجود را انتخاب می‌کنیم
            if (panel_type === "AMN") {
                setSelectedProtocols(availableProtocolsName);
            }
            // در غیر این صورت، منطق قبلی را اجرا می‌کنیم
            else {
                if ((item.country !== country) && !flag) {
                    setSelectedProtocols(availableProtocolsName)
                    setFlag(true)
                }
                setSelectedProtocols(selectedProtocols.filter((protocol) => availableProtocolsName.includes(protocol)))
            }
            
            setProtocols(availableProtocolsName)
            const updatedProtocols = protocols.map((protocol) => ({
                name: protocol.name,
                disabled: !availableProtocolsName.includes(protocol.name),
            }))
            setProtocols(updatedProtocols)
            setIsLoadingProtocols(false)
        }

        if (item) {
            getProtocols()
        }
    }, [country])


    const formFields = [
        { label: "Username", type: "text", id: "username", name: "username", disabled: true },
        // حذف فیلدهای Data Limit و Days To Expire و استفاده از انتخاب پلن به جای آنها
        { label: "Ip Limit", type: "number", id: "ipLimit", name: "ipLimit", disabled: true },
        { label: "Country", type: "multi-select2", id: "country", name: "country", onChange: setCountry, disabled: true },
        { label: "Description", type: "text", id: "desc", name: "desc" },
    ]

    const primaryButtons = [
        { label: "Cancel", className: "outlined", onClick: onClose },
        {
            label: "Renew User", className: "primary", onClick: () => {
                            if (!selectedPlan) {
                setError_msg("Please select a plan")
                setHasError(true)
                return
            }
            
            // Make sure protocols are selected even though protocol section is hidden
            if (selectedProtocols.length === 0) {
                // If user has inbounds, use those protocols
                if (item && item.inbounds) {
                    setSelectedProtocols(Object.keys(item.inbounds))
                } else {
                    // Default to available protocols
                    getProtocols()
                }
            }
            
            // Calculate values based on selected plan
            const dataLimit = panel_type === "AMN" ? 10000 : selectedPlan.dataLimit
            const daysToExpire = selectedPlan.days
            
            // Check how many days remain for the user
            const daysRemaining = item && item.expire ? timeStampToDay(item.expire) : 0
            console.log("Days remaining:", daysRemaining)
            
            // Determine if this is a reservation (add time) or renewal (reset)
            const isReservation = daysRemaining < 10
            const mode = isReservation ? "reservation" : "renewal"
            console.log("Edit mode:", mode, "- Days remaining:", daysRemaining)
            
            // Send parameters to server based on mode
            onEditItem(
                item.id,
                dataLimit,
                daysToExpire,
                item.country, // Always use the user's original country
                selectedProtocols,
                flowValue.value,
                document.getElementById("desc").value,
                safu,
                !isReservation, // is_reset_data=true only if it's a renewal (not reservation)
                mode // new parameter to indicate mode to server
            )
            },
            disabled: editMode,
            pendingText: "Editing..."
        },
    ]

    const getPanelType = () => {
        if (!item) return "MZ";
        
        // تشخیص نوع پنل از روی شناسه پنل یا کشور
        if (item.corresponding_panel_id == 948263502 || 
            item.corresponding_panel_id == 855340348 || 
            item.corresponding_panel_id == 952780616 ||
            (item.country && item.country.includes("Amnezia")))
            return "AMN";
        return "MZ";
    }
    
    const panel_type = getPanelType()
    

    const secondaryButtons = [
        { icon: <DeleteIcon />, type: "button", label: "Delete", className: "ghosted", onClick: (e) => onDeleteItem(e, item.username) },
        panel_type == "AMN"? { icon: <LockIcon />, type: "button", label: "Unlock Account", className: "ghosted", onClick: () => onUnlockItem(item.id) } :
        { icon: <RefreshIcon />, type: "button", label: "Reset Usage", className: "ghosted", onClick: () => onResetItem(item.id) },
        { icon: <PowerIcon />, type: "switch", label: "Power", className: "ghosted", onClick: (e) => onPowerItem(e, item.id, item.status) },
    ]

    const b2gb = (bytes) => {
        return (bytes / (2 ** 10) ** 3).toFixed(2)
    }

    const timeStampToDay = (timeStamp) => {
        const time = timeStamp - Math.floor(Date.now() / 1000)
        return Math.floor(time / 86400) + 1
    }

    const handle_safu_change = (e) => {
        setSafu(e.target.checked)
    }

    const getDefaultValue = (item, field) => {
        if (!item) {
            return ""
        }


        if (field.id === "expire") {
            return timeStampToDay(item[field.id])
        }

        if (field.id === "data_limit") {
            return b2gb(item[field.id])
        }

        if (field.id === "volume") {
            return b2gb(item[field.id])
        }

        if (field.id === "ipLimit") {
            return item["ip_limit"]
        }

        return item[field.id]
    }


    const handleSelectProtocol = (protocol) => {
        if (protocol.disabled) return
        const isProtocolSelected = selectedProtocols.includes(protocol.name)
        if (isProtocolSelected) {
            setSelectedProtocols(selectedProtocols.filter((item) => item !== protocol.name))
        } else {
            setSelectedProtocols([...selectedProtocols, protocol.name])
        }
    }


    const handleClickMoreOption = (e) => {
        e.stopPropagation()
        setIsMoreOptionClicked(!isMoreOptionClicked)
    }

    const handleSelectFlow = (flow) => {
        setFlowValue(flow)
    }

    const formHeader = (
        <header className="modal__header">
            <LeadingIcon>
                <EditIcon />
            </LeadingIcon>
            <h1 className="modal__title">Renew User</h1>
            <div className="close-icon" onClick={onClose}>
                <XMarkIcon />
            </div>
        </header>
    )

    const formFooter = (
        <motion.footer className={`modal__footer ${styles?.footer}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                {secondaryButtons?.map((button, index) => (
                    button.type === "button" ? (
                        <Button
                            key={index}
                            className={button.className}
                            onClick={button.onClick}
                        >
                            {button.icon}
                        </Button>
                    ) : button.type === "switch" ? (
                        <FormControlLabel
                            key={index}
                            onClick={button.onClick}
                            control={<IOSSwitch sx={{ my: 1, mx: 2 }} checked={item ? Boolean(!item.disable) : false} />}
                        //Boolean(!item.disable)
                        />
                    ) : null
                ))}
            </div>
            <div className={styles?.primaryButtons} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                {primaryButtons.map((button, index) => (
                    <Button
                        key={index}
                        className={button.className}
                        onClick={button.onClick}
                        disabled={button.disabled}
                    >
                        {button.disabled ? button.pendingText : button.label}
                    </Button>
                ))}
            </div>
        </motion.footer>
    )

    return (
        <>
            <AnimatePresence>
                {showForm && (
                    <Modal onClose={onClose} width="42rem">
                        {formHeader}
                        <main className={styles['modal__body']}>
                            <form className={styles['modal__form']}>
                                {formFields.map((group, rowIndex) => (
                                    <div key={rowIndex} className="flex gap-16">
                                        {Array.isArray(group) ? group.map((field, index) => {
                                            const defaultValue = getDefaultValue(item, field)

                                            return (<FormField
                                                key={index}
                                                label={field.label}
                                                type={field.type}
                                                id={field.id}
                                                name={field.name}
                                                animateDelay={rowIndex * 0.1}
                                                defaultValue={defaultValue}
                                                disabled={field.disabled}
                                                options={field.options}
                                                value={field.value}
                                                onChange={field.onChange}
                                                placeholder={field.placeholder}
                                                editValue={item ? item.country ? item.country.split(",") : "" : ""}
                                            />)
                                        }) : (
                                            <FormField
                                                key={rowIndex}
                                                label={group.label}
                                                type={group.type}
                                                id={group.id}
                                                name={group.name}
                                                animateDelay={rowIndex * 0.1}
                                                defaultValue={getDefaultValue(item, group)}
                                                disabled={group.disabled}
                                                options={group.options}
                                                value={group.value}
                                                onChange={group.onChange}
                                                placeholder={group.placeholder}
                                                editValue={item ? item.country ? item.country.split(",") : "" : ""}
                                            />
                                        )}
                                    </div>
                                ))}

                            <FormControlLabel
                                control={<Checkbox id="safu" name="safu"
                                    defaultChecked={item.safu} onChange={handle_safu_change}
                                    sx={{marginLeft: "-9px",}}
                                    />}
                                label="Start after first use" />
                            
                            {/* کامپوننت انتخاب پلن */}
                            <div className={styles['plan-section']}>
                                <PlanSelection 
                                    panelType={panel_type} 
                                    onSelectPlan={setSelectedPlan} 
                                    selectedPlan={selectedPlan}
                                    availableData={JSON.parse(sessionStorage.getItem("agent"))?.allocatable_data || 0} // موجودی قابل اختصاص عامل
                                />
                            </div>

                            </form>
                            <div className={`${styles['protocols-section']}`} style={{display: 'none'}}>
                                <h4 className='flex items-center gap-1'>Porotocols {isLoadingProtocols && <span className="flex items-center spinner"><SpinnerIcon /></span>}</h4>
                                <div className={`${styles.protocols}`}>
                                        {protocols.map((protocol, index) => (
                                            <motion.div key={index}
                                                className={`${styles.protocol} ${selectedProtocols.includes(protocol.name) ? styles.selected : protocol.disabled ? styles.disabled : ''}`}
                                                onClick={() => handleSelectProtocol(protocol)}
                                            >
                                                <div className="flex justify-between flex-col w-full">
                                                    <div className="flex justify-between">
                                                        <div className="flex flex-col gap-1.5">
                                                            <h5 className={styles['protocol__name']}>{protocol.name}</h5>
                                                            <p className={styles['protocol__description']}>{
                                                                protocol.name === "vmess" ? "Fast And Secure" :
                                                                    protocol.name === "vless" ? "Lightweight, fast and secure" :
                                                                        protocol.name === "trojan" ? "Lightweight, secure and lightening fast" :
                                                                            protocol.name === "shadowsocks" ? "Fast and secure, but not efficient as others" : ""

                                                            }</p>
                                                        </div>
                                                        {selectedProtocols.includes(protocol.name) && protocol.name === 'vless' && <Button className="gray-100" onClick={(e) => handleClickMoreOption(e)}><ThreeDotsIcon /></Button>}
                                                    </div>
                                                    <AnimatePresence>
                                                        {selectedProtocols.includes(protocol.name) && protocol.name === 'vless' && isMoreOptionClicked && (
                                                            <motion.div
                                                                className={styles['more-options']}
                                                                initial={{ height: 0 }}
                                                                animate={{ height: "auto" }}
                                                                exit={{ height: 0 }}
                                                            >
                                                                <div className='flex flex-col gap-1.5' style={{ paddingTop: "1rem" }}>
                                                                    <h6 style={{ fontWeight: 400 }}>Flow</h6>
                                                                    <Dropdown options={flowOptions} onChange={handleSelectFlow} value={flowValue} />
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </motion.div>
                                        ))}
                                        </div>
                                </div>
                        </main>
                        {formFooter}
                    </Modal>
                )}
            </AnimatePresence>
            <ErrorCard
                hasError={hasError}
                setHasError={setHasError}
                errorTitle="ERROR"
                errorMessage={error_msg}
            />
        </>
    )
}

export default EditUser