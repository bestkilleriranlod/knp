import React, { useState } from 'react'

import Modal from './Modal'
import { AnimatePresence } from 'framer-motion'
import LeadingIcon from './LeadingIcon'
import { ReactComponent as QRCodeIcon } from '../assets/svg/qrcode.svg'
import { ReactComponent as XMarkIcon } from '../assets/svg/x-mark.svg'
import { ReactComponent as ArrowLeftIcon } from '../assets/svg/arrow-left.svg'
import { ReactComponent as ArrowRightIcon } from '../assets/svg/arrow-right.svg'
import { ReactComponent as DownloadIcon } from '../assets/svg/download.svg'
import { QRCodeSVG } from 'qrcode.react';
import { motion } from "framer-motion"
import "./QRCode.css"
import Button from './Button'

const QRCode = ({ onClose, showQRCode, QRCodeLinks, subscriptionLink }) => {
    return (
        <div className="qr-code">
            <AnimatePresence>
                {showQRCode && (
                    <Modal onClose={onClose} className={"qr-code__modal"}>
                        <header className="modal__header">
                            <LeadingIcon>
                                <QRCodeIcon />
                            </LeadingIcon>
                            <h1 className='modal__title'>QR Code</h1>
                            <div className="close-icon" onClick={onClose}>
                                <XMarkIcon />
                            </div>
                        </header>
                        <main className='qr-code__main' style={{ display: "flex", justifyContent: "center" }}>
                            <div className='qr-code-svg-div-container' style={{ display: "flex", flexDirection: "column", alignItems: "center"}}>
                                <QRCodeSVG value={subscriptionLink} size={300} className='qr-code-svg-div' />
                                <div className='download_sublink_btn_container' >
                                <Button className="outlined" 
                                
                                onClick={async () => 
                                {
                                    const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=" + subscriptionLink;
                                    
                                    try 
                                    {
                                      const response = await fetch(qrUrl);
                                      const blob = await response.blob();
                                      const link = document.createElement("a");
                                      link.href = URL.createObjectURL(blob);
                                      link.download = "qr-code.png";
                                      document.body.appendChild(link);
                                      link.click();
                                      document.body.removeChild(link);
                                      URL.revokeObjectURL(link.href);
                                    } 
                                    
                                    catch (error) 
                                    {
                                      console.error("Download failed", error);
                                    }
                                  }}>
                                <DownloadIcon /></Button>
                                Subscribe Link
                                </div>
                            
                            </div>
                        </main>
                    </Modal>
                )}
            </AnimatePresence>
        </div>
    )
}

export default QRCode
