import React, { useEffect, useState } from "react"

import "./UsersTable.css"
import ProgressBar from "../ProgressBar";
import SubscriptionActions from "./SubscriptionActions";
import { ReactComponent as ChevronDownIcon } from "../../assets/svg/chevron-down.svg";
import Button from "../Button"
import { AnimatePresence } from "framer-motion"
import UsersTableAccordion from "../UsersTableAccordion";
import convertData from "../../utils/file-size-util";
import handleExpireTime from "../../utils/expire-time-util";
import EmptyTable from "../EmptyTable";

const show_url = (str) => {
    str = str.replace(/^https?:\/\//, '');
    str = str.replace(/:\d+$/, '');
    return "(" + str + ")";
}

const UsersTable = ({ items, currentItems, onEditItem, onCreateItem }) => {
    const [screenWidth, setScreenWidth] = useState(window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth);
    const [expandedId, setExpandedId] = useState(null);

    const shouldRenderTr = screenWidth < 690;

    useEffect(() => {
        const handleResize = () => {
            setScreenWidth(window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const handleShowAccordion = (id) => {
        if (id === expandedId) {
            setExpandedId(null);
        } else {
            setExpandedId(id)
        }
    }

    const renderedUsers =
        items.length === 0
            ? <EmptyTable tableType={"user"} colSpan={4} onCreateButton={onCreateItem} />
            : currentItems.map((item) => {
                const userStatus = item.status
                const dataUsage = convertData(item.used_traffic)
                const totalData = convertData(item.data_limit)
                const lifetime_used_traffic = convertData(item.lifetime_used_traffic)
                const expireTime = handleExpireTime(item.expire)
                // const subscriptionLink = item.real_subscription_url.startsWith("http") ? item.subscription_url : item.real_subscription_url
                const subscriptionLink = item.subscription_url
                const config = item.links.join("\n");
                const QRCodeLinks = item.links
                const key = item.id

                return (
                    <>
                        {/* محاسبه روزهای باقی‌مانده و مقدار دیتای باقی‌مانده برای نمایش هشدار */}
                        <tr 
                            key={key} 
                            onClick={shouldRenderTr ? undefined : () => onEditItem(item)}
                            style={(() => {
                                // محاسبه روزهای باقی‌مانده
                                const remainingDays = Math.floor((item.expire - Math.floor(Date.now() / 1000)) / 86400);
                                
                                // محاسبه دیتای باقی‌مانده به گیگابایت
                                const usedDataGB = parseFloat((item.used_traffic / (2 ** 10) ** 3).toFixed(2));
                                const totalDataGB = parseFloat((item.data_limit / (2 ** 10) ** 3).toFixed(2));
                                const remainingDataGB = totalDataGB - usedDataGB;
                                
                                // تعیین نیاز به نمایش هشدار
                                const showWarning = 
                                    (item.expire > Math.floor(Date.now() / 1000) && remainingDays <= 5) || // کمتر از 5 روز زمان باقی‌مانده
                                    (remainingDataGB <= 5 && remainingDataGB > 0); // کمتر از 5 گیگابایت باقی‌مانده
                                    
                                return showWarning ? {
                                    backgroundColor: 'rgba(253, 224, 71, 0.2)', // رنگ زمینه زرد کم‌رنگ
                                    position: 'relative',
                                } : {};
                            })()}
                        >
                            <td style={{ maxWidth: "10rem" }}>
                                {item.username} <br></br> 
                                <span className='panelUrl' >{show_url(item.corresponding_panel)} </span>
                                {(() => {
                                    // محاسبه روزهای باقی‌مانده
                                    const remainingDays = Math.floor((item.expire - Math.floor(Date.now() / 1000)) / 86400);
                                    
                                    // محاسبه دیتای باقی‌مانده به گیگابایت
                                    const usedDataGB = parseFloat((item.used_traffic / (2 ** 10) ** 3).toFixed(2));
                                    const totalDataGB = parseFloat((item.data_limit / (2 ** 10) ** 3).toFixed(2));
                                    const remainingDataGB = totalDataGB - usedDataGB;
                                    
                                    // تعیین نیاز به نمایش هشدار
                                    const showWarning = 
                                        (item.expire > Math.floor(Date.now() / 1000) && remainingDays <= 5) || // کمتر از 5 روز زمان باقی‌مانده
                                        (remainingDataGB <= 5 && remainingDataGB > 0); // کمتر از 5 گیگابایت باقی‌مانده
                                    
                                    if (showWarning) {
                                        return (
                                            <div style={{
                                                marginTop: '4px',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                backgroundColor: '#FBBF24',
                                                color: '#7C2D12',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                display: 'inline-block'
                                            }}>
                                                {remainingDays <= 5 && remainingDays > 0 ? `${remainingDays} days left` : ''}
                                                {remainingDays <= 5 && remainingDays > 0 && remainingDataGB <= 5 ? ' & ' : ''}
                                                {remainingDataGB <= 5 && remainingDataGB > 0 ? `${remainingDataGB} GB left` : ''}
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </td>
                            <td>
                                <span className={`status ${userStatus}`}>{userStatus}</span>
                                <span className="expire-time">{expireTime}</span>
                            </td>
                            <td>
                                <div className="users-table__progress-bar">
                                    <ProgressBar dataUsage={item.used_traffic} totalData={item.data_limit} status={userStatus} />
                                    <div className="progress-bar__text">
                                        <span className="progress-bar__text__data-usage">{dataUsage} / {totalData}</span>
                                        <span className="progress-bar__text__total-data">Total: {lifetime_used_traffic}</span>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div className="users-table__subscription-actions">
                                    <div className="table-actions">
                                        {<SubscriptionActions subscriptionLink={subscriptionLink} config={config} QRCodeLinks={QRCodeLinks} />}
                                    </div>
                                    <div className={`accordion chevron-icon${expandedId === item.id ? "--up" : ""}`}>
                                        <Button className="ghosted" onClick={() => handleShowAccordion(item.id)}>
                                            <ChevronDownIcon />
                                        </Button>
                                    </div>
                                </div>
                            </td>
                        </tr>

                        <AnimatePresence>
                            {
                                shouldRenderTr && key === expandedId &&
                                <UsersTableAccordion
                                    item={item}
                                    itemKey={key}
                                    userStatus={userStatus}
                                    expireTime={expireTime}
                                    totalData={item.data_limit}
                                    dataUsage={item.used_traffic}
                                    lifetimeUsedTraffic={item.lifetime_used_traffic}
                                    config={config}
                                    subscriptionLink={subscriptionLink}
                                    QRCodeLinks={QRCodeLinks}
                                    onEditItem={onEditItem}
                                />
                            }
                        </AnimatePresence >
                    </>
                )
            })

    return (
        <div className="wrapper">
            <table className="users-table"
            >
                <thead className="users-table__header">
                    <tr className="users-table__header__row">
                        <th>Username</th>
                        <th>Status</th>
                        <th>Data Usage</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody className="users-table__body">
                    {renderedUsers}
                </tbody>
            </table>
        </div >
    )
}

export default UsersTable