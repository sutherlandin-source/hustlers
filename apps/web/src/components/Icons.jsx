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

export default Icon;
