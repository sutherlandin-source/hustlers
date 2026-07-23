import React from "react";

export const Icon = ({ children, className = "nav-icon" }) => (
  <span className={className} aria-hidden>
    {children}
  </span>
);

export const IconDashboard = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 13h8V3H3v10z"></path>
      <path d="M3 21h8v-6H3v6z"></path>
      <path d="M13 21h8V11h-8v10z"></path>
      <path d="M13 3v6h8V3h-8z"></path>
    </svg>
  </Icon>
);

export const IconTasks = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 11l2 2 4-4"></path>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11"></path>
    </svg>
  </Icon>
);

export const IconApplications = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="2"></rect>
      <path d="M8 7h8M8 12h8M8 17h5"></path>
    </svg>
  </Icon>
);

export const IconContracts = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15V6a2 2 0 0 0-2-2H7L3 6v9a2 2 0 0 0 2 2h14a0 0 0 0 0 0 0z"></path>
      <path d="M7 6v-2"></path>
    </svg>
  </Icon>
);

export const IconBrowse = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="6"></circle>
      <path d="M21 21l-4.35-4.35"></path>
    </svg>
  </Icon>
);

export const IconWallet = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="7" width="20" height="14" rx="2"></rect>
      <path d="M16 3v4"></path>
      <path d="M21 13h-2a2 2 0 0 0 0 4h2"></path>
    </svg>
  </Icon>
);

export const IconProfile = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  </Icon>
);

export const IconMenu = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 12h18M3 6h18M3 18h18"></path>
    </svg>
  </Icon>
);

export const IconMessages = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
      <path d="M8 9h8"></path>
      <path d="M8 13h5"></path>
    </svg>
  </Icon>
);

export const IconShieldCheck = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      <path d="M9 12l2 2 4-4"></path>
    </svg>
  </Icon>
);

export const IconChart = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 19V5"></path>
      <path d="M4 19h16"></path>
      <path d="M8 16v-5"></path>
      <path d="M12 16V8"></path>
      <path d="M16 16v-3"></path>
    </svg>
  </Icon>
);

export const IconSettings = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6V22a2 2 0 1 1-4 0v-.1a1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1H2a2 2 0 1 1 0-4h2a1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 3.29l.06.06A1.65 1.65 0 0 0 9 3.6c.3-.52.7-.93 1.2-1.2V2a2 2 0 1 1 4 0v.1c.5.27.9.68 1.2 1.2a1.65 1.65 0 0 0 1.9.25l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 9c.52.3.93.7 1.2 1.2H22a2 2 0 1 1 0 4h-.1c-.27.5-.68.9-1.2 1.2z"></path>
    </svg>
  </Icon>
);

export const IconPaperclip = ({ className }) => (
  <Icon className={className}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
    </svg>
  </Icon>
);

export default Icon;
